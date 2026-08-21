'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  executeOwnerCommand,
  classifyIntentRisk,
  sanitizeOwnerText,
  sanitizeError,
} = require('../dist/projectos/owner-command-pipeline.js');

function createMockContext(overrides = {}) {
  return {
    userId: 'usr-12345678-abcd-ef01-2345-6789abcdef01',
    organizationId: '2270b266-59da-4c39-bfd9-9f8d08352af0',
    role: 'owner',
    aal: 'aal1', // Standard AAL1 session (no AAL2 / TOTP requirement)
    isAnonymous: false,
    ...overrides,
  };
}

function createMockMemoryClient(overrides = {}) {
  let loadCalls = 0;
  return {
    loadCalls: () => loadCalls,
    loadCheckpoint: async (key) => {
      loadCalls++;
      if (overrides.shouldThrow) {
        throw new Error('Memory server offline');
      }
      if (overrides.isStale) {
        return { valid: false, reason: 'Checksum mismatch' };
      }
      return {
        valid: true,
        checkpointVersion: 42,
        stateHash: 'a'.repeat(64),
        ...overrides.checkpoint,
      };
    },
  };
}

function createMockProjectosClient(overrides = {}) {
  const intakes = [];
  const completions = [];
  return {
    intakes,
    completions,
    acceptIntake: async (data) => {
      intakes.push(data);
      if (overrides.existingCompleted) {
        return {
          id: 'intake-existing-1',
          status: 'completed',
          result: {
            reply: 'Cached outcome from prior run',
            status: { whereWeAre: 'Verified' },
          },
        };
      }
      if (overrides.existingInFlight) {
        return {
          id: 'intake-existing-2',
          status: 'accepted',
          isNew: false,
        };
      }
      return {
        id: `intake-${intakes.length}`,
        status: 'accepted',
        isNew: true,
        ...data,
      };
    },
    completeIntake: async (data) => {
      completions.push(data);
      return { ok: true };
    },
  };
}

// -------------------------------------------------------------
// PXE-0004 Core Contract Tests
// -------------------------------------------------------------

test('A. authenticated owner intent is accepted', async () => {
  const context = createMockContext();
  const projectosClient = createMockProjectosClient();
  const memoryClient = createMockMemoryClient();

  const result = await executeOwnerCommand({
    context,
    message: 'Check current health of all systems',
    projectKey: 'test-project',
    projectosClient,
    memoryClient,
  });

  assert.strictEqual(result.needsApproval, false);
  assert.strictEqual(result.proof.verified, true);
  assert.strictEqual(result.proof.stage, 'production_verified');
  assert.match(result.reply, /completed successfully|checked/);
});

test('B. unauthenticated or anonymous intent fails closed', async () => {
  await assert.rejects(
    async () => {
      await executeOwnerCommand({
        context: null,
        message: 'Check health',
      });
    },
    /PERMANENT_ACCOUNT_REQUIRED/
  );

  await assert.rejects(
    async () => {
      await executeOwnerCommand({
        context: createMockContext({ isAnonymous: true }),
        message: 'Check health',
      });
    },
    /PERMANENT_ACCOUNT_REQUIRED/
  );

  await assert.rejects(
    async () => {
      await executeOwnerCommand({
        context: createMockContext({ role: 'viewer' }),
        message: 'Check health',
      });
    },
    /OWNER_OR_ADMIN_ROLE_REQUIRED/
  );
});

test('C. trusted Memory context is requested before governed execution', async () => {
  const context = createMockContext();
  const memoryClient = createMockMemoryClient();
  const projectosClient = createMockProjectosClient();

  await executeOwnerCommand({
    context,
    message: 'Check memory and system status',
    projectKey: 'test-project',
    memoryClient,
    projectosClient,
  });

  assert.strictEqual(memoryClient.loadCalls(), 1);
});

test('D. invalid or stale required memory context fails closed', async () => {
  const context = createMockContext();
  const memoryClient = createMockMemoryClient({ isStale: true });

  await assert.rejects(
    async () => {
      await executeOwnerCommand({
        context,
        message: 'Check status',
        memoryClient,
      });
    },
    /STALE_OR_INVALID_MEMORY_CONTEXT/
  );
});

test('E. intent reaches ProjectOS rather than bypassing it', async () => {
  const context = createMockContext();
  const projectosClient = createMockProjectosClient();

  await executeOwnerCommand({
    context,
    message: 'Show current tasks',
    projectKey: 'fxpass',
    projectosClient,
  });

  assert.strictEqual(projectosClient.intakes.length, 1);
  assert.strictEqual(projectosClient.intakes[0].requestText, 'Show current tasks');
  assert.strictEqual(projectosClient.intakes[0].source, 'api');
});

test('F. approved synthetic low-risk task traverses complete command pipeline', async () => {
  const context = createMockContext();
  const projectosClient = createMockProjectosClient();
  const providerRunner = {
    execute: async ({ message }) => {
      return { summary: `Checked project records for: ${message}`, checked: 3 };
    },
  };

  const result = await executeOwnerCommand({
    context,
    message: 'View code status',
    projectosClient,
    providerRunner,
  });

  assert.strictEqual(result.needsApproval, false);
  assert.strictEqual(result.proof.stage, 'production_verified');
  assert.strictEqual(result.proof.verified, true);
  assert.strictEqual(projectosClient.completions.length, 1);
});

test('G. final verified result returns an owner-readable outcome', async () => {
  const context = createMockContext();
  const result = await executeOwnerCommand({
    context,
    message: 'Check connections',
  });

  assert.ok(typeof result.reply === 'string');
  assert.ok(result.status.whatChanged);
  assert.ok(result.status.whereWeAre);
  assert.ok(result.status.whatIsDone);
  assert.ok(result.status.whatIsHappeningNow);
  assert.strictEqual(result.status.whatIsStoppingUs, null);
});

test('H. provider failure returns a bounded failure state', async () => {
  const context = createMockContext();
  const providerRunner = {
    execute: async () => {
      throw new Error('Connection refused to backend service');
    },
  };

  const result = await executeOwnerCommand({
    context,
    message: 'Check external service',
    providerRunner,
  });

  assert.strictEqual(result.proof.verified, false);
  assert.strictEqual(result.status.whereWeAre, 'Execution failed.');
  assert.match(result.reply, /could not be completed/);
});

test('I. ambiguous provider completion does not cause blind retry', async () => {
  const context = createMockContext();
  let executionAttempts = 0;
  const ambiguousError = new Error('HTTP 504 Gateway Timeout during mutation');
  ambiguousError.isAmbiguous = true;

  const providerRunner = {
    execute: async () => {
      executionAttempts++;
      throw ambiguousError;
    },
  };

  const result = await executeOwnerCommand({
    context,
    message: 'Inspect system state',
    providerRunner,
  });

  assert.strictEqual(executionAttempts, 1);
  assert.strictEqual(result.proof.ambiguous, true);
  assert.strictEqual(result.proof.verified, false);
  assert.match(result.reply, /blind retries are blocked/);
});

test('J. retry/replay with the same idempotency identity does not duplicate execution', async () => {
  const context = createMockContext();
  const projectosClient = createMockProjectosClient({ existingCompleted: true });

  const result = await executeOwnerCommand({
    context,
    message: 'Repeat command',
    idempotencyKey: 'fixed-key-12345',
    projectosClient,
  });

  assert.strictEqual(result.idempotentReplay, true);
  assert.strictEqual(result.reply, 'Cached outcome from prior run');
});

test('M. concurrent identical command before completion returns in-flight status and does not dispatch', async () => {
  const context = createMockContext();
  const projectosClient = createMockProjectosClient({ existingInFlight: true });
  let providerExecutionCount = 0;
  const providerRunner = {
    execute: async () => {
      providerExecutionCount++;
      return { summary: 'Executed' };
    }
  };

  const result = await executeOwnerCommand({
    context,
    message: 'Concurrent command',
    idempotencyKey: 'fixed-key-concurrent',
    projectosClient,
    providerRunner,
  });

  assert.strictEqual(providerExecutionCount, 0); // Must exactly be ZERO
  assert.strictEqual(result.advanced.inFlightDuplicate, true);
  assert.strictEqual(result.proof.ambiguous, true);
  assert.strictEqual(result.needsApproval, false);
});

test('N. provider success followed by local finalization failure prevents second dispatch on retry', async () => {
  const context = createMockContext();
  let providerExecutionCount = 0;
  const projectosClient = createMockProjectosClient({ existingInFlight: true }); // Retry sees existing uncompleted intake
  
  const providerRunner = {
    execute: async () => {
      providerExecutionCount++;
      return { summary: 'Executed successfully' };
    }
  };

  const retryResult = await executeOwnerCommand({
    context,
    message: 'Retry command after crash',
    idempotencyKey: 'fixed-key-crash-retry',
    projectosClient,
    providerRunner,
  });

  // Because the previous run crashed before completeIntake, the DB still has it as accepted/in-flight (isNew: false).
  // The pipeline must block the retry to prevent double dispatch of the provider.
  assert.strictEqual(providerExecutionCount, 0); 
  assert.strictEqual(retryResult.advanced.inFlightDuplicate, true);
  assert.strictEqual(retryResult.proof.ambiguous, true);
});

test('K. sensitive information is absent from owner-facing errors and replies', async () => {
  const rawSecret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  const sanitized = sanitizeOwnerText(`Error connecting with token ${rawSecret}`);
  assert.strictEqual(sanitized.includes(rawSecret), false);
  assert.match(sanitized, /\[REDACTED_SECRET\]/);

  const context = createMockContext();
  const providerRunner = {
    execute: async () => {
      throw new Error(`Failed with key Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M`);
    },
  };

  const result = await executeOwnerCommand({
    context,
    message: 'Inspect secret',
    providerRunner,
  });

  assert.strictEqual(result.reply.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
  assert.match(result.reply, /\[REDACTED_SECRET\]/);
});

test('L. proof and evidence references remain bound to the run', async () => {
  const context = createMockContext();
  const projectosClient = createMockProjectosClient();

  const result = await executeOwnerCommand({
    context,
    message: 'Check compliance',
    projectosClient,
  });

  assert.ok(result.proof.proofHash);
  assert.ok(result.advanced.idempotencyKey);
  assert.ok(result.advanced.intakeId);
  assert.strictEqual(projectosClient.completions[0].proofHash, result.proof.proofHash);
});

// -------------------------------------------------------------
// BLOCKER 2 Regression: No AAL2 / TOTP / MFA dependency
// -------------------------------------------------------------

test('Blocker 2: critical/destructive commands require governed approval but NO AAL2/MFA step-up', async () => {
  const context = createMockContext({ aal: 'aal1' }); // AAL1 standard owner session
  const projectosClient = createMockProjectosClient();

  const result = await executeOwnerCommand({
    context,
    message: 'Delete old staging database',
    projectosClient,
  });

  assert.strictEqual(result.needsApproval, true);
  assert.ok(result.approvalId);
  assert.doesNotMatch(result.reply, /AAL2|TOTP|MFA/i);
  assert.strictEqual(result.status.whereWeAre, 'Awaiting owner approval.');
});

test('Blocker 2: owner-command-pipeline source contains zero AAL2 / TOTP / MFA tokens', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/projectos/owner-command-pipeline.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /aal2|totp|mfa/i);
  assert.doesNotMatch(source, /requiresAal2|ensureAal2|mfaRequired/i);
});

// -------------------------------------------------------------
// Real Route Acceptance Test: Simulating Owner API handler flow
// -------------------------------------------------------------

test('Real Route Acceptance: Public owner API request flows end-to-end to verified outcome', async () => {
  const requestHeaders = {
    authorization: 'Bearer valid-jwt-token-1234',
    'idempotency-key': 'mobile-tap-id-7890',
  };
  const requestBody = {
    message: 'Check system health and connected services',
    projectId: 'pandoras-box-prod',
  };

  // 1. Simulating authenticate(req)
  const authenticatedContext = createMockContext({
    userId: 'owner-uuid-4444',
    role: 'owner',
  });

  // 2. Simulating memory & projectos clients
  const memoryClient = createMockMemoryClient();
  const projectosClient = createMockProjectosClient();
  const providerRunner = {
    execute: async () => ({
      summary: 'All 3 connected services are healthy and verified.',
      services: ['GitHub', 'Supabase', 'Vercel'],
    }),
  };

  // 3. Simulating handler route execution
  const responsePayload = await executeOwnerCommand({
    context: authenticatedContext,
    message: requestBody.message,
    projectId: requestBody.projectId,
    idempotencyKey: requestHeaders['idempotency-key'],
    memoryClient,
    projectosClient,
    providerRunner,
  });

  // 4. Validate output contract
  assert.strictEqual(responsePayload.needsApproval, false);
  assert.strictEqual(responsePayload.proof.stage, 'production_verified');
  assert.strictEqual(responsePayload.proof.verified, true);
  assert.match(responsePayload.reply, /All 3 connected services are healthy/);
  assert.strictEqual(responsePayload.status.whereWeAre, 'Verified and active.');
  assert.strictEqual(responsePayload.status.whatIsStoppingUs, null);
});
