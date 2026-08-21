const assert = require('node:assert/strict');
const test = require('node:test');

const { createHttpApp, executionPayloadHash } = require('../dist/http-app.js');
const {
  assertHighImpactPolicy,
  assertManifestConfirmation,
} = require('../dist/runtime/tool-manifest.js');
const { executeTool } = require('../dist/runtime/tool-catalog.js');

const ADMIN_TOKEN = 'admin-token-that-is-longer-than-thirty-two-characters';
const APPROVAL_TOKEN = 'approval-token-that-is-longer-than-thirty-two-chars';
const PLAN_ID = 'cfef1a79-1465-4c18-8180-563c4c397820';
const REQUEST_ID = 'e7928d0d-b112-4339-8a2b-16ff9e789ccb';

async function withServer(app, action) {
  const server = await new Promise((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  try {
    const address = server.address();
    return await action(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function runtime(ledger, toolExecutor) {
  const runtimeSecurity = {
    adminToken: ADMIN_TOKEN,
    approvalToken: APPROVAL_TOKEN,
    allowedOrigins: ['https://mcpmaster.vercel.app'],
  };
  return createHttpApp({
    port: 3000,
    adminToken: ADMIN_TOKEN,
    approvalToken: APPROVAL_TOKEN,
    allowedOrigins: 'https://mcpmaster.vercel.app',
    rateLimitRequests: 100,
    rateLimitWindowMs: 60_000,
  }, { async resolve() { return runtimeSecurity; } }, ledger, {
    async consume() { return { allowed: true, limit: 100, remaining: 99, count: 1, resetAt: new Date(Date.now() + 60_000).toISOString(), windowSeconds: 60 }; },
  }, async () => [], toolExecutor);
}

function protectedHeaders(extra = {}) {
  return {
    authorization: `Bearer ${ADMIN_TOKEN}`,
    'content-type': 'application/json',
    ...extra,
  };
}

test('durable execution rejects a claimed payload mismatch before provider execution', async () => {
  const ledger = {
    async claimPlan() {
      return {
        planId: PLAN_ID,
        requestId: REQUEST_ID,
        tool: 'github.get-repository',
        risk: 'read',
        args: { owner: 'banataosystems', repo: 'Pandoras-box' },
        payloadHash: '0'.repeat(64),
        status: 'executing',
      };
    },
    async finishPlan() { throw new Error('finish must not be reached'); },
  };
  await withServer(runtime(ledger), async (origin) => {
    const response = await fetch(`${origin}/tools/execute`, {
      method: 'POST',
      headers: protectedHeaders({ 'x-vercel-oidc-token': 'v'.repeat(80) }),
      body: JSON.stringify({ planId: PLAN_ID }),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.match(body.error.message, /payload hash mismatch/);
  });
});

test('write and destructive operations cannot bypass the separate durable plan action', async () => {
  const ledger = {};
  await withServer(runtime(ledger), async (origin) => {
    for (const tool of ['github.create-issue', 'github.merge-pull-request']) {
      const response = await fetch(`${origin}/tools/execute`, {
        method: 'POST',
        headers: protectedHeaders({ 'x-vercel-oidc-token': 'v'.repeat(80) }),
        body: JSON.stringify({ tool, args: {} }),
      });
      const body = await response.json();
      assert.equal(response.status, 409);
      assert.equal(body.error.code, 'PLAN_REQUIRED');
    }
  });
});

test('non-OIDC mutation execution requires the durable ledger despite a valid static approval token', async () => {
  const ledgerCalls = [];
  const executedTools = [];
  const ledger = new Proxy({}, {
    get(_target, property) {
      return async () => {
        ledgerCalls.push(String(property));
        throw new Error(`ledger ${String(property)} must not be reached`);
      };
    },
  });
  const app = runtime(ledger, async (tool) => {
    executedTools.push(tool);
    return { full_name: 'banataosystems/Pandoras-box' };
  });

  await withServer(app, async (origin) => {
    const readResponse = await fetch(`${origin}/tools/execute`, {
      method: 'POST',
      headers: protectedHeaders(),
      body: JSON.stringify({
        tool: 'github.get-repository',
        args: { owner: 'banataosystems', repo: 'Pandoras-box' },
      }),
    });
    assert.equal(readResponse.status, 200);

    for (const tool of ['github.create-issue', 'github.merge-pull-request']) {
      const response = await fetch(`${origin}/tools/execute`, {
        method: 'POST',
        headers: protectedHeaders({ 'x-approval-token': APPROVAL_TOKEN }),
        body: JSON.stringify({ tool, args: {} }),
      });
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.error.code, 'DURABLE_LEDGER_REQUIRED');
    }
  });

  assert.deepEqual(ledgerCalls, []);
  assert.deepEqual(executedTools, ['github.get-repository']);
});

test('approval and execution are separate actions with exact server attribution', async () => {
  const calls = [];
  const ledger = {
    async approvePlan(token, planId, approver) {
      calls.push({ token, planId, approver });
      return { planId, requestId: REQUEST_ID, status: 'approved' };
    },
  };
  await withServer(runtime(ledger), async (origin) => {
    const response = await fetch(`${origin}/tools/approve`, {
      method: 'POST',
      headers: protectedHeaders({
        'x-vercel-oidc-token': 'v'.repeat(80),
        'x-approval-token': APPROVAL_TOKEN,
        'x-approver-id': 'supabase:verified-user',
      }),
      body: JSON.stringify({ planId: PLAN_ID }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ token: 'v'.repeat(80), planId: PLAN_ID, approver: 'supabase:verified-user' }]);
  });
});

test('operator approval rejects a substituted ledger plan identity or state', async () => {
  const ledger = {
    async approvePlan() {
      return {
        planId: '64368ef2-61b1-4586-8bdb-4d75fcbd5f77',
        requestId: REQUEST_ID,
        status: 'approved',
      };
    },
  };
  await withServer(runtime(ledger), async (origin) => {
    const response = await fetch(`${origin}/tools/approve`, {
      method: 'POST',
      headers: protectedHeaders({
        'x-vercel-oidc-token': 'v'.repeat(80),
        'x-approval-token': APPROVAL_TOKEN,
        'x-approver-id': 'supabase:verified-user',
      }),
      body: JSON.stringify({ planId: PLAN_ID }),
    });
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.match(body.error.message, /mismatched plan identity or state/);
  });
});

test('operator execution rejects a substituted ledger plan identity or state', async () => {
  const ledger = {
    async claimPlan() {
      return {
        planId: '64368ef2-61b1-4586-8bdb-4d75fcbd5f77',
        requestId: REQUEST_ID,
        tool: 'github.get-repository',
        risk: 'read',
        args: { owner: 'banataosystems', repo: 'Pandoras-box' },
        payloadHash: executionPayloadHash('github.get-repository', { owner: 'banataosystems', repo: 'Pandoras-box' }),
        status: 'executing',
      };
    },
  };
  await withServer(runtime(ledger), async (origin) => {
    const response = await fetch(`${origin}/tools/execute`, {
      method: 'POST',
      headers: protectedHeaders({ 'x-vercel-oidc-token': 'v'.repeat(80) }),
      body: JSON.stringify({ planId: PLAN_ID }),
    });
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.match(body.error.message, /mismatched plan identity or state/);
  });
});

test('execution payload hashes are canonical and bind tool plus exact arguments', () => {
  const left = executionPayloadHash('github.create-issue', { owner: 'banataosystems', repo: 'Pandoras-box', title: 'x' });
  const reordered = executionPayloadHash('github.create-issue', { title: 'x', repo: 'Pandoras-box', owner: 'banataosystems' });
  const changed = executionPayloadHash('github.create-issue', { owner: 'banataosystems', repo: 'Pandoras-box', title: 'y' });
  assert.equal(left, reordered);
  assert.notEqual(left, changed);
});

test('provider mutation, allowlist, scope, and confirmation controls stay enforced', async () => {
  const args = { owner: 'banataosystems', repo: 'Pandoras-box', title: 'x' };
  await assert.rejects(
    executeTool('github.create-issue', args, {
      github: {
        id: 'fixture', label: 'fixture', baseUrl: 'https://api.github.com', token: 'not-used',
        allowMutations: false, allowedRepositories: ['banataosystems/Pandoras-box'], grantedScopes: ['issues:write'],
      },
    }),
    /mutations are disabled/i,
  );
  await assert.rejects(
    executeTool('github.create-issue', args, {
      github: {
        id: 'fixture', label: 'fixture', baseUrl: 'https://api.github.com', token: 'not-used',
        allowMutations: true, allowedRepositories: ['banataosystems/another'], grantedScopes: ['issues:write'],
      },
    }),
    /not allowed to access/i,
  );
  await assert.rejects(
    executeTool('github.create-issue', args, {
      github: {
        id: 'fixture', label: 'fixture', baseUrl: 'https://api.github.com', token: 'not-used',
        allowMutations: true, allowedRepositories: ['banataosystems/Pandoras-box'], grantedScopes: [],
      },
    }),
    /missing required scope/i,
  );
  assert.throws(
    () => assertManifestConfirmation('github.delete-repository-api', {
      owner: 'banataosystems', repo: 'Pandoras-box', confirmation: 'DELETE wrong/repository',
    }),
    /Confirmation must exactly equal/,
  );
});

test('high-impact destructive actions remain behind the separate break-glass gate', () => {
  const args = {
    owner: 'banataosystems',
    repo: 'Pandoras-box',
    pathSegments: [],
    confirmation: 'DELETE banataosystems/Pandoras-box',
  };
  assertManifestConfirmation('github.delete-repository-api', args);
  assert.throws(() => assertHighImpactPolicy('github.delete-repository-api', args, false), /disabled by default/);
  assert.doesNotThrow(() => assertHighImpactPolicy('github.delete-repository-api', args, true));
});
