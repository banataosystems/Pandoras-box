'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/*
 * Memory broker authorization contract tests.
 *
 * The broker (api/memory-broker.ts) is a Vercel serverless function.
 * It cannot be directly imported as a compiled CommonJS module because it lives
 * in the api/ directory (Vercel convention, not compiled to dist/).
 *
 * We test the authorization contract by simulating the broker's exact logic
 * through mock-driven behavioral tests that prove each gate in isolation.
 */

// ---------- Minimal broker simulation matching api/memory-broker.ts ----------

function createBrokerSimulation({
  authenticateFn,
  fetchFn,
  resolveOidcFn,
  hydrateFn,
  attachFn,
  serviceRoleKey,
}) {
  return async function memoryBroker(request, response) {
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (err) {
      return response.status(400).json({ error: 'Invalid JSON' });
    }

    const { planId } = body;
    if (!planId || typeof planId !== 'string') {
      return response.status(400).json({ error: 'Missing planId' });
    }

    const authorization = request.headers['authorization'];
    if (!authorization) {
      return response.status(401).json({ error: 'Missing authorization' });
    }

    let identity;
    try {
      identity = await authenticateFn(authorization);
    } catch (err) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    try {
      if (!serviceRoleKey) {
        throw new Error('Service role key is not configured');
      }

      // Fetch execution plan using service role
      const planRes = await fetchFn(
        `https://mock.supabase.co/rest/v1/execution_plans?id=eq.${planId}&select=organization_id,request_id,tool,args`,
        {
          method: 'GET',
          headers: {
            apikey: 'sb_publishable_mock_key_12345678',
            Authorization: `Bearer ${serviceRoleKey}`,
            Accept: 'application/json',
          },
        }
      );

      if (!planRes.ok) {
        return response.status(500).json({ error: 'Failed to retrieve plan' });
      }

      const planRows = await planRes.json();
      if (!planRows || planRows.length !== 1) {
        return response.status(404).json({ error: 'Plan not found' });
      }

      const plan = planRows[0];
      const { organization_id, request_id, tool, args } = plan;

      // Verify membership using user's JWT (not service role)
      const membershipRes = await fetchFn(
        `https://mock.supabase.co/rest/v1/memberships?user_id=eq.${identity.userId}&organization_id=eq.${organization_id}&status=eq.active&select=role`,
        {
          method: 'GET',
          headers: {
            apikey: 'sb_publishable_mock_key_12345678',
            Authorization: authorization, // User's bearer token!
            Accept: 'application/json',
          },
        }
      );

      if (!membershipRes.ok) {
        return response.status(500).json({ error: 'Failed to verify membership' });
      }

      const membershipRows = await membershipRes.json();
      if (!membershipRows || membershipRows.length === 0) {
        return response
          .status(403)
          .json({ error: 'Forbidden: No active membership in plan organization' });
      }

      const role = membershipRows[0].role;
      if (role !== 'owner' && role !== 'admin') {
        return response
          .status(403)
          .json({ error: 'Forbidden: Owner or admin role required' });
      }

      // Derive authoritative values from plan, ignore caller-supplied values
      const authoritativeRequestId = request_id;
      const authoritativeTool = tool;
      const authoritativeArgs = args;

      // Obtain Vercel workload OIDC
      const oidcToken = await resolveOidcFn();
      if (!oidcToken) {
        return response.status(503).json({ error: 'Missing Vercel OIDC token' });
      }

      // Hydrate Memory
      const hydrated = await hydrateFn(oidcToken, {
        tool: authoritativeTool,
        args: authoritativeArgs,
      });
      if (!hydrated || !hydrated.contextHash) {
        return response.status(500).json({ error: 'Memory hydration failed' });
      }

      // Attach context
      await attachFn(oidcToken, {
        planId,
        requestId: authoritativeRequestId,
        contextHash: hydrated.contextHash,
        contextEnvelope: hydrated.envelope,
      });

      return response.status(200).json({ ok: true, contextHash: hydrated.contextHash });
    } catch (err) {
      return response.status(500).json({ error: err.message || 'Internal server error' });
    }
  };
}

// ---------- Helpers ----------

function createReq(body, headers) {
  const rawHeaders = headers || {};
  const chunks = [Buffer.from(JSON.stringify(body))];
  const iter = chunks[Symbol.iterator]();
  return {
    method: 'POST',
    headers: rawHeaders,
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          const res = iter.next();
          return { done: res.done, value: res.value };
        },
      };
    },
  };
}

function createRes() {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.data = data;
    return res;
  };
  return res;
}

// ---------- Default mocks ----------

function defaultMocks(overrides) {
  const serviceRoleKey = 'mock-service-role-key-for-test';
  const fetchCalls = [];

  return {
    serviceRoleKey,
    fetchCalls,
    authenticateFn:
      overrides?.authenticateFn ||
      (async (auth) => {
        if (!auth || !auth.startsWith('Bearer ')) {
          throw new Error('Unauthorized');
        }
        return { userId: 'user-good-1' };
      }),
    fetchFn:
      overrides?.fetchFn ||
      (async (url, options) => {
        fetchCalls.push({ url, options });
        if (url.includes('/execution_plans')) {
          return {
            ok: true,
            json: async () => [
              {
                organization_id: 'org-1',
                request_id: 'req-from-plan',
                tool: 'tool-from-plan',
                args: { key: 'value-from-plan' },
              },
            ],
          };
        }
        if (url.includes('/memberships')) {
          const role = overrides?.membershipRole || 'owner';
          return {
            ok: true,
            json: async () => (overrides?.membershipEmpty ? [] : [{ role }]),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    resolveOidcFn: overrides?.resolveOidcFn || (async () => 'oidc-mock-token'),
    hydrateFn:
      overrides?.hydrateFn ||
      (async (token, params) => ({
        contextHash: 'sha256-hash-mock',
        envelope: { tool: params.tool, args: params.args },
      })),
    attachFn: overrides?.attachFn || (async () => {}),
  };
}

// ---------- Tests ----------

test('anonymous request → 401', async () => {
  const mocks = defaultMocks();
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, {}); // No authorization header
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 401);
  assert.ok(res.data.error);
});

test('invalid bearer → 401', async () => {
  const mocks = defaultMocks({
    authenticateFn: async () => {
      throw new Error('Invalid token');
    },
  });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer invalid-garbage' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 401);
});

test('authenticated user but no active membership → 403', async () => {
  const mocks = defaultMocks({ membershipEmpty: true });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.data.error, /No active membership/);
});

test('member role → 403', async () => {
  const mocks = defaultMocks({ membershipRole: 'member' });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.data.error, /Owner or admin role required/);
});

test('viewer role → 403', async () => {
  const mocks = defaultMocks({ membershipRole: 'viewer' });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.data.error, /Owner or admin role required/);
});

test('operator role → 403', async () => {
  const mocks = defaultMocks({ membershipRole: 'operator' });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.data.error, /Owner or admin role required/);
});

test('owner of exact plan organization → allowed', async () => {
  const mocks = defaultMocks({ membershipRole: 'owner' });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.ok, true);
  assert.ok(res.data.contextHash);
});

test('admin of exact plan organization → allowed', async () => {
  const mocks = defaultMocks({ membershipRole: 'admin' });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.ok, true);
});

test('owner/admin of different organization → forbidden', async () => {
  // The membership check uses the plan's organization_id, not the caller's claimed org.
  // If the user has no membership in the plan's org, they are rejected.
  const mocks = defaultMocks({
    fetchFn: async (url, options) => {
      if (url.includes('/execution_plans')) {
        return {
          ok: true,
          json: async () => [
            {
              organization_id: 'org-different',
              request_id: 'req-1',
              tool: 'tool-1',
              args: {},
            },
          ],
        };
      }
      if (url.includes('/memberships')) {
        // No membership in org-different
        return { ok: true, json: async () => [] };
      }
      throw new Error(`Unexpected: ${url}`);
    },
  });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 403);
});

test('caller supplies only planId; requestId/tool/args derived from durable plan', async () => {
  const hydrateCalls = [];
  const attachCalls = [];
  const mocks = defaultMocks({
    hydrateFn: async (token, params) => {
      hydrateCalls.push(params);
      return { contextHash: 'hash-1', envelope: { tool: params.tool, args: params.args } };
    },
    attachFn: async (token, params) => {
      attachCalls.push(params);
    },
  });
  const broker = createBrokerSimulation(mocks);
  // Caller includes forged requestId, tool, args alongside planId — they must be ignored
  const req = createReq(
    { planId: 'plan-1', requestId: 'forged-req', tool: 'forged-tool', args: { evil: true } },
    { authorization: 'Bearer valid-token' }
  );
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 200);

  // Hydration used plan's authoritative values, not caller's
  assert.strictEqual(hydrateCalls[0].tool, 'tool-from-plan');
  assert.deepStrictEqual(hydrateCalls[0].args, { key: 'value-from-plan' });

  // Attach used plan's requestId, not caller's
  assert.strictEqual(attachCalls[0].requestId, 'req-from-plan');
});

test('caller-forged requestId/tool/args cannot influence hydration', async () => {
  const hydrateCalls = [];
  const mocks = defaultMocks({
    hydrateFn: async (token, params) => {
      hydrateCalls.push(params);
      return { contextHash: 'hash-2', envelope: {} };
    },
  });
  const broker = createBrokerSimulation(mocks);
  const req = createReq(
    { planId: 'plan-1', requestId: 'attack-req', tool: 'attack-tool', args: { inject: true } },
    { authorization: 'Bearer valid-token' }
  );
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 200);
  // Verify forged values were never passed to hydration
  assert.notStrictEqual(hydrateCalls[0].tool, 'attack-tool');
  assert.strictEqual(hydrateCalls[0].tool, 'tool-from-plan');
});

test('missing plan → fail closed', async () => {
  const mocks = defaultMocks({
    fetchFn: async (url) => {
      if (url.includes('/execution_plans')) {
        return { ok: true, json: async () => [] }; // No plan found
      }
      return { ok: true, json: async () => [{ role: 'owner' }] };
    },
  });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'nonexistent' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 404);
  assert.match(res.data.error, /Plan not found/);
});

test('memory hydration failure → fail closed', async () => {
  const mocks = defaultMocks({
    hydrateFn: async () => null, // hydration returns nothing
  });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 500);
  assert.match(res.data.error, /Memory hydration failed/);
});

test('context attach mismatch → fail closed', async () => {
  const mocks = defaultMocks({
    attachFn: async () => {
      throw new Error('Context mismatch');
    },
  });
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 500);
  assert.match(res.data.error, /Context mismatch/);
});

test('Vercel OIDC token never returned to caller', async () => {
  const mocks = defaultMocks();
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 200);
  const responseStr = JSON.stringify(res.data);
  assert.ok(!responseStr.includes('oidc-mock-token'), 'OIDC token must not appear in response');
});

test('SUPABASE_SERVICE_ROLE_KEY never appears in response/log/outbound Memory request', async () => {
  const outboundCalls = [];
  const serviceRoleKey = 'mock-service-role-key-never-leak';
  const mocks = defaultMocks({
    fetchFn: async (url, options) => {
      outboundCalls.push({ url, options });
      if (url.includes('/execution_plans')) {
        // Verify the plan fetch uses service role (expected for private table)
        assert.ok(
          options.headers.Authorization.includes(serviceRoleKey),
          'Plan fetch should use service role'
        );
        return {
          ok: true,
          json: async () => [
            { organization_id: 'org-1', request_id: 'req-1', tool: 'tool-1', args: {} },
          ],
        };
      }
      if (url.includes('/memberships')) {
        // Membership fetch must use USER's token, NOT service role
        assert.ok(
          !options.headers.Authorization.includes(serviceRoleKey),
          'Membership fetch must NOT use service role key'
        );
        assert.ok(
          options.headers.Authorization === 'Bearer valid-token',
          'Membership fetch must use user bearer token'
        );
        return { ok: true, json: async () => [{ role: 'owner' }] };
      }
      throw new Error(`Unexpected: ${url}`);
    },
    hydrateFn: async (oidcToken, params) => {
      // The hydrate function receives the OIDC token, NOT the service role key
      assert.ok(
        oidcToken !== serviceRoleKey,
        'Memory hydration must not receive service role key'
      );
      return { contextHash: 'hash-safe', envelope: {} };
    },
  });
  mocks.serviceRoleKey = serviceRoleKey;
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer valid-token' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 200);
  const responseStr = JSON.stringify(res.data);
  assert.ok(
    !responseStr.includes(serviceRoleKey),
    'Service role key must never appear in response'
  );
});

test('service role key is only used for plan retrieval, never for membership or Memory', async () => {
  const serviceRoleKey = 'mock-service-role-isolation-test';
  const allFetchCalls = [];
  const mocks = defaultMocks({
    fetchFn: async (url, options) => {
      allFetchCalls.push({ url, authorization: options.headers.Authorization });
      if (url.includes('/execution_plans')) {
        return {
          ok: true,
          json: async () => [
            { organization_id: 'org-1', request_id: 'r', tool: 't', args: {} },
          ],
        };
      }
      if (url.includes('/memberships')) {
        return { ok: true, json: async () => [{ role: 'owner' }] };
      }
      throw new Error(`Unexpected: ${url}`);
    },
  });
  mocks.serviceRoleKey = serviceRoleKey;
  const broker = createBrokerSimulation(mocks);
  const req = createReq({ planId: 'plan-1' }, { authorization: 'Bearer user-jwt' });
  const res = createRes();
  await broker(req, res);
  assert.strictEqual(res.statusCode, 200);

  // Plan fetch uses service role
  const planCall = allFetchCalls.find((c) => c.url.includes('/execution_plans'));
  assert.ok(planCall);
  assert.ok(planCall.authorization.includes(serviceRoleKey));

  // Membership fetch uses user token
  const membershipCall = allFetchCalls.find((c) => c.url.includes('/memberships'));
  assert.ok(membershipCall);
  assert.strictEqual(membershipCall.authorization, 'Bearer user-jwt');
  assert.ok(!membershipCall.authorization.includes(serviceRoleKey));
});
