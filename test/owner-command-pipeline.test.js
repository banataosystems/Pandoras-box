'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  executeOwnerCommand,
  classifyIntentRisk,
  sanitizeOwnerText,
  sanitizeError,
} = require('../src/projectos/owner-command-pipeline.js');

function createMockContext(overrides = {}) {
  return {
    userId: 'usr-12345678-abcd-ef01-2345-6789abcdef01',
    organizationId: '2270b266-59da-4c39-bfd9-9f8d08352af0',
    role: 'owner',
    aal: 'aal1',
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
      return {
        id: `intake-${intakes.length}`,
        status: 'accepted',
        ...data,
      };
    },
    completeIntake: async (data) => {
      completions.push(data);
      return { ok: true };
    },
  };
}

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
