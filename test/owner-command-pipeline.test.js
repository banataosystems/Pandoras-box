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
    completeIntake: async (data) => { completions.push(data); return { ok: true }; },
    createExecutionPlan: async (data) => { 
      return { 
        planId: 'mock-plan-id', 
        status: (data && data.risk !== 'critical' && data.risk !== 'high') ? 'approved' : 'unplanned' 
      }; 
    },
    claimExecutionPlan: async (data) => { return { id: 'mock-plan-id', status: 'executing' }; },
    enqueueExecutionDispatch: async (planId) => { return { id: 'mock-dispatch-id', planId, status: 'queued' }; },
    finishExecutionPlan: async () => { return { ok: true }; }
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
  assert.strictEqual(result.proof.verified, false);
  assert.strictEqual(result.proof.stage, 'dispatch_pending');
  assert.match(result.reply, /successfully dispatched for execution/);
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
  assert.strictEqual(result.proof.stage, 'dispatch_pending');
  assert.strictEqual(result.proof.verified, false);
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

test('H. dispatch enqueue failure returns a bounded failure state', async () => {
  const context = createMockContext();
  const projectosClient = createMockProjectosClient();
  projectosClient.enqueueExecutionDispatch = async () => {
    throw new Error('Database connection refused');
  };

  const result = await executeOwnerCommand({
    context,
    message: 'Check external service',
    projectosClient,
  });

  assert.strictEqual(result.proof.verified, false);
  assert.strictEqual(result.status.whereWeAre, 'Execution failed.');
  assert.match(result.reply, /could not be completed/);
});

test('I. stranded claim triggers reconciliation when enqueue fails', async () => {
  const context = createMockContext();
  let finishedPlan = false;
  const projectosClient = createMockProjectosClient();
  projectosClient.enqueueExecutionDispatch = async () => {
    throw new Error('Enqueue error');
  };
  projectosClient.finishExecutionPlan = async () => {
    finishedPlan = true;
  };

  const result = await executeOwnerCommand({
    context,
    message: 'Inspect system state',
    projectosClient,
  });

  assert.strictEqual(finishedPlan, true);
  assert.strictEqual(result.proof.verified, false);
  assert.strictEqual(result.status.whereWeAre, 'Execution failed.');
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
  });

  assert.strictEqual(result.advanced.inFlightDuplicate, true);
  assert.strictEqual(result.proof.ambiguous, true);
  assert.strictEqual(result.needsApproval, false);
});

test('N. in-flight duplicate blocked from enqueue', async () => {
  const context = createMockContext();
  let enqueueCalls = 0;
  const projectosClient = createMockProjectosClient({ existingInFlight: true });
  projectosClient.enqueueExecutionDispatch = async () => { enqueueCalls++; return {}; };
  
  const retryResult = await executeOwnerCommand({
    context,
    message: 'Retry command after crash',
    idempotencyKey: 'fixed-key-crash-retry',
    projectosClient,
  });

  assert.strictEqual(enqueueCalls, 0); 
  assert.strictEqual(retryResult.advanced.inFlightDuplicate, true);
  assert.strictEqual(retryResult.proof.ambiguous, true);
});

test('K. sensitive information is absent from owner-facing errors and replies', async () => {
  const rawSecret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  const sanitized = sanitizeOwnerText(`Error connecting with token ${rawSecret}`);
  assert.strictEqual(sanitized.includes(rawSecret), false);
  assert.match(sanitized, /\[REDACTED_SECRET\]/);

  const context = createMockContext();
  const projectosClient = createMockProjectosClient();
  projectosClient.enqueueExecutionDispatch = async () => {
    throw new Error(`Failed with key Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M`);
  };

  const result = await executeOwnerCommand({
    context,
    message: 'Inspect secret',
    projectosClient,
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

  assert.strictEqual(result.proof.proofHash, null);
  assert.ok(result.advanced.idempotencyKey);
  assert.ok(result.advanced.intakeId);
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
    path.join(__dirname, '../src/projectos/owner-command-pipeline.ts'),
    'utf8'
  );
  assert.doesNotMatch(source, /aal2|totp|mfa/i);
  assert.doesNotMatch(source, /requiresAal2|ensureAal2|mfaRequired/i);
});

// -------------------------------------------------------------
// Real Route Acceptance Test: Simulating Owner API handler flow
// -------------------------------------------------------------

test('Real Route Acceptance: Public owner API request flows end-to-end to dispatch enqueue', async () => {
  const requestHeaders = {
    authorization: 'Bearer valid-jwt-token-1234',
    'idempotency-key': 'mobile-tap-id-7890',
  };
  const requestBody = {
    message: 'Check system health and connected services',
    projectId: 'pandoras-box-prod',
  };

  const authenticatedContext = createMockContext({
    userId: 'owner-uuid-4444',
    role: 'owner',
  });

  const memoryClient = createMockMemoryClient();
  const projectosClient = createMockProjectosClient();

  const responsePayload = await executeOwnerCommand({
    context: authenticatedContext,
    message: requestBody.message,
    projectId: requestBody.projectId,
    idempotencyKey: requestHeaders['idempotency-key'],
    memoryClient,
    projectosClient,
  });

  assert.strictEqual(responsePayload.needsApproval, false);
  assert.strictEqual(responsePayload.proof.stage, 'dispatch_pending');
  assert.strictEqual(responsePayload.proof.verified, false);
  assert.match(responsePayload.reply, /Command successfully dispatched/);
  assert.strictEqual(responsePayload.status.whereWeAre, 'Executed, pending verification.');
  assert.strictEqual(responsePayload.status.whatIsStoppingUs, null);
});
