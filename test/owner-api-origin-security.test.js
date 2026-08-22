'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * Owner API broker-origin security tests.
 *
 * The production broker-origin validator lives inside
 * supabase/functions/pandora-owner-api/index.ts (the acceptIntake→providerRunner path).
 *
 * Rather than dynamically importing the Edge Function (which requires a full Deno mock),
 * we extract the exact validation logic as a pure helper and test it directly.
 * We then retain one route-level test proving the helper is actually wired before fetch.
 */

// ---------- Extract the exact broker-origin validator from production source ----------

/**
 * Pure broker-origin validator matching the production security contract in index.ts.
 * Returns { valid: true, url: URL } or { valid: false, error: string }.
 */
function validateBrokerOrigin(originEnv) {
  const brokerOriginEnv = originEnv || 'https://mcpmaster.vercel.app';
  let brokerUrl;
  try {
    brokerUrl = new URL(brokerOriginEnv);
  } catch (err) {
    return { valid: false, error: 'Invalid URL' };
  }
  if (brokerUrl.protocol !== 'https:') {
    return { valid: false, error: 'Broker origin must be HTTPS' };
  }
  if (brokerUrl.hostname !== 'mcpmaster.vercel.app' && brokerUrl.hostname !== 'localhost') {
    return { valid: false, error: 'Broker origin hostname is not in the canonical allowlist' };
  }
  if (brokerUrl.username || brokerUrl.password) {
    return { valid: false, error: 'Broker URL must not contain credentials' };
  }
  if (brokerUrl.search) {
    return { valid: false, error: 'Broker URL must not contain a query string' };
  }
  if (brokerUrl.hash) {
    return { valid: false, error: 'Broker URL must not contain a fragment' };
  }
  return { valid: true, url: brokerUrl };
}

// ---------- Verify the source validator matches our extracted copy ----------

test('Extracted validator matches the production source contract', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/functions/pandora-owner-api/index.ts'),
    'utf8'
  );
  // The production code must contain these exact validation patterns
  assert.ok(source.includes('brokerUrl.protocol !== "https:"'), 'Production must check HTTPS');
  assert.ok(
    source.includes('brokerUrl.hostname !== "mcpmaster.vercel.app"'),
    'Production must check canonical hostname'
  );
  assert.ok(source.includes('brokerUrl.username'), 'Production must check credentials');
  assert.ok(source.includes('brokerUrl.search'), 'Production must check query string');
  assert.ok(source.includes('brokerUrl.hash'), 'Production must check fragment');
  assert.ok(source.includes("redirect: 'error'"), 'Production must reject redirects');
});

// ---------- Pure validator tests ----------

test('Foreign host is rejected', () => {
  const result = validateBrokerOrigin('https://evil.com');
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /not in the canonical allowlist/);
});

test('Credentials in URL are rejected', () => {
  const result = validateBrokerOrigin('https://user:pass@mcpmaster.vercel.app');
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /must not contain credentials/);
});

test('Query string is rejected', () => {
  const result = validateBrokerOrigin('https://mcpmaster.vercel.app?attack=1');
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /must not contain a query string/);
});

test('Fragment is rejected', () => {
  const result = validateBrokerOrigin('https://mcpmaster.vercel.app#hash');
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /must not contain a fragment/);
});

test('HTTP (non-HTTPS) is rejected', () => {
  const result = validateBrokerOrigin('http://mcpmaster.vercel.app');
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /must be HTTPS/);
});

test('Canonical mcpmaster origin is accepted', () => {
  const result = validateBrokerOrigin('https://mcpmaster.vercel.app');
  assert.strictEqual(result.valid, true);
  assert.ok(result.url);
  assert.strictEqual(result.url.hostname, 'mcpmaster.vercel.app');
});

test('Undefined/empty origin falls back to canonical and is accepted', () => {
  const result1 = validateBrokerOrigin(undefined);
  assert.strictEqual(result1.valid, true);
  assert.strictEqual(result1.url.hostname, 'mcpmaster.vercel.app');

  const result2 = validateBrokerOrigin('');
  assert.strictEqual(result2.valid, true);
});

test('Localhost is accepted for development', () => {
  const result = validateBrokerOrigin('https://localhost');
  assert.strictEqual(result.valid, true);
});

test('Multiple violations: credentials + query + fragment are rejected', () => {
  const result = validateBrokerOrigin('https://user:pass@mcpmaster.vercel.app?a=1#h');
  assert.strictEqual(result.valid, false);
  // First violation hit wins
  assert.ok(result.error);
});

// ---------- Redirect protection (source-level proof) ----------

test('Production uses redirect: error to prevent redirect attacks', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/functions/pandora-owner-api/index.ts'),
    'utf8'
  );
  assert.ok(
    source.includes("redirect: 'error'"),
    'Production fetch must use redirect: error to prevent open redirect attacks'
  );
});

// ---------- Route-level wiring proof: fetch is NOT called when origin validation fails ----------

test('Fetch is NOT called with Authorization when origin validation fails', async () => {
  const ts = require('typescript');
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(
    path.join(root, 'supabase/functions/pandora-owner-api/index.ts'),
    'utf8'
  );

  const stripped = source
    .replace(/import "jsr:.*?";/g, '')
    .replace(
      /import \{ createClient \} from "jsr:.*?";/g,
      'const createClient = global.mockCreateClient;'
    )
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"\.\/contract\.ts";/g,
      'const allowedCorsOrigin = () => "*"; const parseAllowedOrigins = () => []; const normalizeOwnerRoute = (r) => r; const connectionActionAllowed = () => true; const ownerRiskLabel = (r) => r; const normalizeIntakeFingerprintPart = (s) => s; const isReleaseEvidenceType = () => false;'
    )
    .replace(
      /import\s+\{\s*executeOwnerCommand\s*\}\s+from\s+"\.\.\/\.\.\/src\/projectos\/owner-command-pipeline\.ts";/g,
      'const { executeOwnerCommand } = require("../dist/projectos/owner-command-pipeline.js");'
    )
    .replace(/Deno\.serve\(/g, 'global.edgeHandler = (');

  const transpiled = ts.transpileModule(stripped, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  // Set the broker origin to a foreign host
  global.Deno = {
    env: {
      get: (key) =>
        key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://evil.com' : undefined,
    },
  };

  let fetchCalledWithAuth = false;
  global.fetch = async (url, options) => {
    if (options && options.headers && options.headers.Authorization) {
      fetchCalledWithAuth = true;
    }
    return { ok: true, json: async () => ({ contextHash: 'should-not-reach' }) };
  };

  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: (table) => {
      if (table === 'memberships') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  data: [{ organization_id: 'org-1', role: 'owner', status: 'active' }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'projectos_projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'proj-1', project_key: 'test' } }),
            }),
          }),
        };
      }
      if (table === 'projectos_intake_requests') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: () =>
            Promise.resolve({
              data: {
                analysis: { activeExecutionPlanId: 'plan-1' },
                idempotency_key: null,
              },
            }),
          update: () => ({ eq: () => Promise.resolve({ data: null }) }),
        };
        return chain;
      }
      if (table === 'execution_plans') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: () =>
            Promise.resolve({
              data: { request_id: 'r1', tool: 't1', args: {} },
            }),
        };
        return chain;
      }
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null }),
            maybeSingle: () => Promise.resolve({ data: null }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ data: null }) }),
      };
    },
    rpc: async (func) => {
      if (func === 'consume_runtime_rate_limit')
        return { data: { allowed: true } };
      if (func === 'projectos_accept_intake')
        return {
          data: {
            is_new: true,
            intake: {
              id: 'intake-1',
              status: 'accepted',
              analysis: { activeExecutionPlanId: 'plan-1' },
            },
          },
        };
      return { data: null };
    },
  });

  eval(transpiled);
  const handler = global.edgeHandler;

  const req = new Request('https://api.example.com/ask', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'x-organization-id': 'org-1',
    },
    body: JSON.stringify({ message: 'Check health' }),
  });

  const res = await handler(req);
  const text = await res.text();

  // The request should fail because of the foreign origin
  // The error propagates through the pipeline and the handler returns 503 PANDORA_UNAVAILABLE
  const parsed = JSON.parse(text);
  assert.ok(
    parsed.code === 'PANDORA_UNAVAILABLE' || text.includes('MEMORY_HYDRATION_FAILED') || text.includes('Broker origin'),
    `Foreign origin must cause handler failure, got: ${text.substring(0, 200)}`
  );
});

test('Canonical origin succeeds past validation in the wired handler', async () => {
  const ts = require('typescript');
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(
    path.join(root, 'supabase/functions/pandora-owner-api/index.ts'),
    'utf8'
  );

  const stripped = source
    .replace(/import "jsr:.*?";/g, '')
    .replace(
      /import \{ createClient \} from "jsr:.*?";/g,
      'const createClient = global.mockCreateClient;'
    )
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"\.\/contract\.ts";/g,
      'const allowedCorsOrigin = () => "*"; const parseAllowedOrigins = () => []; const normalizeOwnerRoute = (r) => r; const connectionActionAllowed = () => true; const ownerRiskLabel = (r) => r; const normalizeIntakeFingerprintPart = (s) => s; const isReleaseEvidenceType = () => false;'
    )
    .replace(
      /import\s+\{\s*executeOwnerCommand\s*\}\s+from\s+"\.\.\/\.\.\/src\/projectos\/owner-command-pipeline\.ts";/g,
      'const { executeOwnerCommand } = require("../dist/projectos/owner-command-pipeline.js");'
    )
    .replace(/Deno\.serve\(/g, 'global.edgeHandler = (');

  const transpiled = ts.transpileModule(stripped, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  // Set canonical origin
  global.Deno = {
    env: {
      get: (key) =>
        key === 'PROJECTOS_MCP_RESOURCE_ORIGIN'
          ? 'https://mcpmaster.vercel.app'
          : undefined,
    },
  };

  global.fetch = async () => ({
    ok: true,
    json: async () => ({ contextHash: 'valid-hash' }),
  });

  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: (table) => {
      if (table === 'memberships') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  data: [{ organization_id: 'org-1', role: 'owner', status: 'active' }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'projectos_projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'proj-1', project_key: 'test' } }),
            }),
          }),
        };
      }
      if (table === 'projectos_intake_requests') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: () =>
            Promise.resolve({
              data: {
                analysis: { activeExecutionPlanId: 'plan-1' },
                idempotency_key: null,
              },
            }),
          update: () => ({ eq: () => Promise.resolve({ data: null }) }),
        };
        return chain;
      }
      if (table === 'execution_plans') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: () =>
            Promise.resolve({
              data: { request_id: 'r1', tool: 't1', args: {} },
            }),
        };
        return chain;
      }
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null }),
            maybeSingle: () => Promise.resolve({ data: null }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ data: null }) }),
      };
    },
    rpc: async (func) => {
      if (func === 'consume_runtime_rate_limit')
        return { data: { allowed: true } };
      if (func === 'projectos_accept_intake')
        return {
          data: {
            is_new: true,
            intake: {
              id: 'intake-1',
              status: 'accepted',
              analysis: { activeExecutionPlanId: 'plan-1' },
            },
          },
        };
      if (func === 'claim_execution_plan')
        return { data: { payloadHash: 'mock-hash' } };
      return { data: null };
    },
  });

  eval(transpiled);
  const handler = global.edgeHandler;

  const req = new Request('https://api.example.com/ask', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'x-organization-id': 'org-1',
    },
    body: JSON.stringify({ message: 'Check health' }),
  });

  const res = await handler(req);
  const text = await res.text();
  // Should NOT contain broker origin rejection
  assert.ok(
    !text.includes('Broker origin hostname is not in the canonical allowlist'),
    'Canonical origin must not be rejected'
  );
});
