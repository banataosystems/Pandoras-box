const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');

const {
  canApproveProjectOsPlan,
  projectOsApproverAttribution,
} = require('../dist/projectos-approval-authorization.js');
const { createProjectOsMcpHandler } = require('../dist/projectos-mcp-handler.js');
const {
  resolveProjectOsMachineCredential,
  SupabaseBearerAuthenticator,
} = require('../apps/meta-business-mcp/dist/auth/supabase-bearer.js');

const USER_ID = 'e5f5744e-554b-4f92-aad2-3f58ae6a33ad';
const ORGANIZATION_ID = '2270b266-59da-4c39-bfd9-9f8d08352af0';
const PLAN_ID = 'ed34d145-f738-47b7-a985-15e75342ba2c';
const ALL_SCOPES = ['openid', 'email', 'profile', 'offline_access', 'projectos:read', 'projectos:plan', 'projectos:approve', 'projectos:execute'];
const ACCESS_TOKEN = `header.${Buffer.from(JSON.stringify({ sub: USER_ID, aal: 'aal1', scope: ALL_SCOPES.join(' ') })).toString('base64url')}.signature-material-long-enough`;

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
}

function requestFor(name, args = {}, headers = {}) {
  return {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ACCESS_TOKEN}`,
      'x-approval-token': 'caller-controlled-approval',
      'x-approver-id': 'caller-controlled-approver',
      'x-vercel-oidc-token': 'caller-controlled-oidc',
      'x-vercel-sc-headers': 'caller-controlled-internal-envelope',
      ...headers,
    },
    body: {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name, arguments: args },
    },
  };
}

function harness(role, ledgerOverrides = {}, membershipOverrides = {}) {
  const calls = [];
  const ledger = {
    async approvePlan(token, planId, approvedBy) {
      calls.push({ token, planId, approvedBy });
      return { planId, status: 'approved' };
    },
    async listPlans() { return []; },
    async createPlan() { throw new Error('not used'); },
    async claimPlan() { throw new Error('not used'); },
    async finishPlan() { throw new Error('not used'); },
    ...ledgerOverrides,
  };
  const handler = createProjectOsMcpHandler({
    organizationId: ORGANIZATION_ID,
    authenticator: {
      async authenticate() {
        return { userId: USER_ID, accessToken: ACCESS_TOKEN, aal: 'aal1', scopes: ALL_SCOPES };
      },
    },
    membershipResolver: {
      async resolve(organizationId, userId) {
        if (!role) return null;
        return { organizationId, userId, role, ...membershipOverrides };
      },
    },
    ledger,
    workloadToken: () => 'server-side-vercel-oidc-token-that-is-never-read-from-the-caller',
  });
  return { handler, ledger, calls };
}

async function invoke(handler, request) {
  const response = responseRecorder();
  await handler(request, response);
  return response;
}

for (const role of ['owner', 'admin']) {
  test(`authenticated ${role} AAL1 can approve an eligible pending plan`, async () => {
    const { handler, calls } = harness(role);
    const request = requestFor('projectos_approve_plan', { planId: PLAN_ID });
    const response = await invoke(handler, request);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.result.structuredContent.plan.status, 'approved');
    assert.deepEqual(calls, [{
      token: 'server-side-vercel-oidc-token-that-is-never-read-from-the-caller',
      planId: PLAN_ID,
      approvedBy: `supabase:${USER_ID}`,
    }]);
    assert.equal(request.headers['x-approval-token'], undefined);
    assert.equal(request.headers['x-approver-id'], undefined);
    assert.equal(request.headers['x-vercel-oidc-token'], undefined);
    assert.equal(request.headers['x-vercel-sc-headers'], undefined);
  });
}

for (const role of ['operator', 'member', 'viewer']) {
  test(`${role} cannot approve a ProjectOS plan`, async () => {
    const { handler, calls } = harness(role);
    const response = await invoke(handler, requestFor('projectos_approve_plan', { planId: PLAN_ID }));
    assert.equal(response.statusCode, 403);
    assert.match(response.body.error.message, /owner or admin/);
    assert.equal(calls.length, 0);
  });
}

test('unauthenticated caller cannot approve', async () => {
  const { handler, calls } = harness('owner');
  const request = requestFor('projectos_approve_plan', { planId: PLAN_ID });
  delete request.headers.authorization;
  const response = await invoke(handler, request);
  assert.equal(response.statusCode, 401);
  assert.match(response.headers['www-authenticate'], /^Bearer /);
  assert.equal(calls.length, 0);
});

test('wrong-organization or inactive membership cannot approve', async () => {
  const { handler, calls } = harness(null);
  const response = await invoke(handler, requestFor('projectos_approve_plan', { planId: PLAN_ID }));
  assert.equal(response.statusCode, 403);
  assert.match(response.body.error.message, /active ProjectOS organization membership/);
  assert.equal(calls.length, 0);
});

test('mismatched organization and user records cannot approve', async () => {
  for (const mismatch of [
    { organizationId: 'd2d4cf70-d915-477a-af62-218f90ef60c4' },
    { userId: 'f678af44-344d-412c-b5fd-63ec48dcce29' },
  ]) {
    const { handler, calls } = harness('owner', {}, mismatch);
    const response = await invoke(handler, requestFor('projectos_approve_plan', { planId: PLAN_ID }));
    assert.equal(response.statusCode, 403);
    assert.match(response.body.error.message, /does not match/);
    assert.equal(calls.length, 0);
  }
});

test('invalid plan identity is rejected before the durable ledger', async () => {
  const { handler, calls } = harness('owner');
  const response = await invoke(handler, requestFor('projectos_approve_plan', { planId: 'not-a-uuid' }));
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error.message, /must be a UUID/);
  assert.equal(calls.length, 0);
});

test('OAuth scope undergrant cannot approve or execute a ProjectOS plan', async () => {
  for (const [name, scopes, required] of [
    ['projectos_approve_plan', ['openid', 'projectos:read'], 'projectos:approve'],
    ['projectos_execute_plan', ['openid', 'projectos:approve'], 'projectos:execute'],
  ]) {
    const { ledger } = harness('owner');
    const handler = createProjectOsMcpHandler({
      organizationId: ORGANIZATION_ID,
      authenticator: {
        async authenticate() { return { userId: USER_ID, accessToken: ACCESS_TOKEN, aal: 'aal1', scopes }; },
      },
      membershipResolver: {
        async resolve() { return { organizationId: ORGANIZATION_ID, userId: USER_ID, role: 'owner' }; },
      },
      ledger,
      workloadToken: () => 'server-side-vercel-oidc-token-that-is-never-read-from-the-caller',
    });
    const response = await invoke(handler, requestFor(name, { planId: PLAN_ID }));
    assert.equal(response.statusCode, 403);
    assert.match(response.body.error.message, new RegExp(required));
  }
});

test('standard identity scopes alone cannot widen into ProjectOS approval authority', async () => {
  for (const [scopes, required] of [
    [['openid', 'email', 'profile', 'offline_access'], 'projectos:approve'],
    [['email', 'profile', 'projectos:approve'], 'openid'],
  ]) {
    const { ledger } = harness('owner');
    const handler = createProjectOsMcpHandler({
      organizationId: ORGANIZATION_ID,
      authenticator: { async authenticate() { return { userId: USER_ID, accessToken: ACCESS_TOKEN, aal: 'aal1', scopes }; } },
      membershipResolver: { async resolve() { return { organizationId: ORGANIZATION_ID, userId: USER_ID, role: 'owner' }; } },
      ledger,
      workloadToken: () => 'server-side-vercel-oidc-token-that-is-never-read-from-the-caller',
    });
    const response = await invoke(handler, requestFor('projectos_approve_plan', { planId: PLAN_ID }));
    assert.equal(response.statusCode, 403);
    assert.match(response.body.error.message, new RegExp(required));
    assert.match(response.headers['www-authenticate'], /insufficient_scope/);
  }
});

test('durable ledger cannot substitute a different plan identity or state', async () => {
  for (const returned of [
    { planId: 'f6e50fa9-fc53-484c-8bc3-58749b2eaee4', status: 'approved' },
    { planId: PLAN_ID, status: 'pending_approval' },
  ]) {
    const { handler } = harness('admin', { async approvePlan() { return returned; } });
    const response = await invoke(handler, requestFor('projectos_approve_plan', { planId: PLAN_ID }));
    assert.equal(response.statusCode, 409);
    assert.match(response.body.error.message, /mismatched plan identity or state/);
  }
});

test('expired pending plan remains rejected by the durable ledger', async () => {
  const { handler } = harness('owner', {
    async approvePlan() {
      throw Object.assign(new Error('Execution plan has expired'), { status: 409 });
    },
  });
  const response = await invoke(handler, requestFor('projectos_approve_plan', { planId: PLAN_ID }));
  assert.equal(response.statusCode, 409);
  assert.match(response.body.error.message, /expired/);
});

test('already claimed or executed plan cannot be approved or replayed', async () => {
  const { handler } = harness('admin', {
    async approvePlan() {
      throw Object.assign(new Error('Execution plan is not pending approval'), { status: 409 });
    },
  });
  const response = await invoke(handler, requestFor('projectos_approve_plan', { planId: PLAN_ID }));
  assert.equal(response.statusCode, 409);
  assert.match(response.body.error.message, /not pending/);
});

test('an approved plan is claimed and executed once and replay is rejected', async () => {
  const args = { owner: 'banataosystems', repo: 'Pandoras-box' };
  const payloadHash = require('../dist/http-app.js').executionPayloadHash('github.get-repository', args);
  let claimed = false;
  let executions = 0;
  const dependencies = {
    organizationId: ORGANIZATION_ID,
    authenticator: { async authenticate() { return { userId: USER_ID, accessToken: ACCESS_TOKEN, aal: 'aal1', scopes: ALL_SCOPES }; } },
    membershipResolver: { async resolve() { return { organizationId: ORGANIZATION_ID, userId: USER_ID, role: 'owner' }; } },
    ledger: {
      async claimPlan() {
        if (claimed) throw Object.assign(new Error('Execution plan is already claimed'), { status: 409 });
        claimed = true;
        return {
          planId: PLAN_ID,
          requestId: 'f6e50fa9-fc53-484c-8bc3-58749b2eaee4',
          tool: 'github.get-repository',
          risk: 'read',
          args,
          payloadHash,
          status: 'executing',
        };
      },
      async finishPlan() { return { planId: PLAN_ID, status: 'completed' }; },
    },
    workloadToken: () => 'server-side-vercel-oidc-token-that-is-never-read-from-the-caller',
    async execute() { executions += 1; return { ok: true }; },
    toolConfiguration() { return {}; },
  };
  claimed = false;
  const executeHandler = createProjectOsMcpHandler(dependencies);
  const first = await invoke(executeHandler, requestFor('projectos_execute_plan', { planId: PLAN_ID }));
  const replay = await invoke(executeHandler, requestFor('projectos_execute_plan', { planId: PLAN_ID }));
  assert.equal(first.statusCode, 200);
  assert.equal(replay.statusCode, 409);
  assert.match(replay.body.error.message, /already claimed/);
  assert.equal(executions, 1);
});

test('approval authorization depends on owner/admin role, not AAL', () => {
  const ownerAal1 = { identity: { userId: USER_ID, aal: 'aal1' }, membership: { role: 'owner' } };
  const adminWithoutAal = { identity: { userId: USER_ID }, membership: { role: 'admin' } };
  assert.equal(canApproveProjectOsPlan(ownerAal1), true);
  assert.equal(canApproveProjectOsPlan(adminWithoutAal), true);
  assert.equal(projectOsApproverAttribution(ownerAal1), `supabase:${USER_ID}`);
  assert.doesNotMatch(projectOsApproverAttribution(ownerAal1), /aal/i);
});

test('verified Supabase bearer authentication carries bounded OAuth scopes into authorization', async () => {
  const authenticator = new SupabaseBearerAuthenticator({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_example0123456789012345',
    async fetchFn(_url, init) {
      assert.equal(init.headers.authorization, `Bearer ${ACCESS_TOKEN}`);
      return new Response(JSON.stringify({ id: USER_ID, email: 'owner@example.com' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const identity = await authenticator.authenticate(`Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual(identity.scopes, ALL_SCOPES);
  assert.equal(identity.scopeClaimsPresent, true);
  assert.equal(identity.aal, 'aal1');
});

test('verified bearer authentication distinguishes first-party and malformed OAuth scope claims', async () => {
  async function authenticate(payload) {
    const token = `header.${Buffer.from(JSON.stringify({ sub: USER_ID, ...payload })).toString('base64url')}.signature-material-long-enough`;
    const authenticator = new SupabaseBearerAuthenticator({
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example0123456789012345',
      async fetchFn() {
        return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
      },
    });
    return authenticator.authenticate(`Bearer ${token}`);
  }
  const firstParty = await authenticate({ aal: 'aal1' });
  assert.equal(firstParty.scopeClaimsPresent, false);
  assert.deepEqual(firstParty.scopes, []);

  for (const malformed of [{ scope: '' }, { scp: null }, { scopes: {} }]) {
    const identity = await authenticate(malformed);
    assert.equal(identity.scopeClaimsPresent, true);
    assert.deepEqual(identity.scopes, []);
  }
});

test('machine credentials are structurally operator-only and cannot become human approvers', () => {
  const secret = 'a'.repeat(50);
  const token = `pmt_v1_ci_${secret}`;
  const base = {
    tokenPrefix: 'pmt_v1_ci_',
    tokenHash: createHash('sha256').update(token).digest('hex'),
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    repositoryFullName: 'banataosystems/Pandoras-box',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  assert.equal(resolveProjectOsMachineCredential(token, USER_ID, [{ ...base, role: 'owner' }]), undefined);
  const operator = resolveProjectOsMachineCredential(token, USER_ID, [{ ...base, role: 'operator' }]);
  assert.equal(operator.role, 'operator');
  assert.equal(canApproveProjectOsPlan({ identity: { userId: USER_ID }, membership: operator }), false);
});
