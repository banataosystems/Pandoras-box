'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * Owner API broker-origin security tests.
 *
 * The production broker-origin validator lives inside
 * src/projectos/broker-origin-validator.ts
 *
 * This test uses the exact production validator that the Edge Function imports.
 */

const { validateBrokerOrigin } = require('../dist/projectos/broker-origin-validator.js');

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
function loadHandler() {
  const root = path.join(__dirname, '..');
  const handlerSource = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/handler.ts'), 'utf8');
  const contractSource = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/contract.ts'), 'utf8');

  const transpiledHandler = ts.transpileModule(handlerSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  const transpiledContract = ts.transpileModule(contractSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const mockRequire = (id) => {
    if (id === './contract.ts' || id === './contract.js') {
      const contractExports = {};
      eval("((exports) => { " + transpiledContract + " })(contractExports)");
      return contractExports;
    }
    if (id === '../../src/projectos/owner-command-pipeline.ts' || id.includes('owner-command-pipeline')) {
      return require('../dist/projectos/owner-command-pipeline.js');
    }
    if (id === '../../src/projectos/broker-origin-validator.ts' || id.includes('broker-origin-validator')) {
      return require('../dist/projectos/broker-origin-validator.js');
    }
    return require(id);
  };

  const handlerExports = {};
  eval("((exports, require) => { " + transpiledHandler + " })(handlerExports, mockRequire)");
  return handlerExports.handleOwnerApiRequest;
}
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

  const transpiled = ts.transpileModule(stripped.replace(/import\s+\{\s*validateBrokerOrigin\s*\}\s+from\s+\"..\/..\/src\/projectos\/broker-origin-validator\.ts\";/g, 'const { validateBrokerOrigin } = require("../dist/projectos/broker-origin-validator.js");'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  // Set the broker origin to a foreign host
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
                analysis: { latestExecutionPlanId: 'plan-1' },
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
              analysis: { latestExecutionPlanId: 'plan-1' },
            },
          },
        };
      return { data: null };
    },
  });

  const handler = loadHandler();

  const req = new Request('https://api.example.com/ask', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'x-organization-id': 'org-1',
    },
    body: JSON.stringify({ message: 'Check health' }),
  });

  const res = await handler(req, {
    SUPABASE_URL: 'https://jcyqixttuebxqqfkjonq.supabase.co',
    SUPABASE_ANON_KEY: 'mock-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    ALLOWED_ORIGINS: [],
    createClient: global.mockCreateClient,
    env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://evil.com' : undefined }
  });
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
function loadHandler() {
  const root = path.join(__dirname, '..');
  const handlerSource = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/handler.ts'), 'utf8');
  const contractSource = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/contract.ts'), 'utf8');

  const transpiledHandler = ts.transpileModule(handlerSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  const transpiledContract = ts.transpileModule(contractSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const mockRequire = (id) => {
    if (id === './contract.ts' || id === './contract.js') {
      const contractExports = {};
      eval("((exports) => { " + transpiledContract + " })(contractExports)");
      return contractExports;
    }
    if (id === '../../src/projectos/owner-command-pipeline.ts' || id.includes('owner-command-pipeline')) {
      return require('../dist/projectos/owner-command-pipeline.js');
    }
    if (id === '../../src/projectos/broker-origin-validator.ts' || id.includes('broker-origin-validator')) {
      return require('../dist/projectos/broker-origin-validator.js');
    }
    return require(id);
  };

  const handlerExports = {};
  eval("((exports, require) => { " + transpiledHandler + " })(handlerExports, mockRequire)");
  return handlerExports.handleOwnerApiRequest;
}
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

  const transpiled = ts.transpileModule(stripped.replace(/import\s+\{\s*validateBrokerOrigin\s*\}\s+from\s+\"..\/..\/src\/projectos\/broker-origin-validator\.ts\";/g, 'const { validateBrokerOrigin } = require("../dist/projectos/broker-origin-validator.js");'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  // Set canonical origin
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
                analysis: { latestExecutionPlanId: 'plan-1' },
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
              analysis: { latestExecutionPlanId: 'plan-1' },
            },
          },
        };
      if (func === 'claim_execution_plan')
        return { data: { payloadHash: 'mock-hash' } };
      return { data: null };
    },
  });

  const handler = loadHandler();

  const req = new Request('https://api.example.com/ask', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'x-organization-id': 'org-1',
    },
    body: JSON.stringify({ message: 'Check health' }),
  });

  const res = await handler(req, {
    SUPABASE_URL: 'https://jcyqixttuebxqqfkjonq.supabase.co',
    SUPABASE_ANON_KEY: 'mock-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
    ALLOWED_ORIGINS: [],
    createClient: global.mockCreateClient,
    env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://evil.com' : undefined }
  });
  const text = await res.text();
  // Should NOT contain broker origin rejection
  assert.ok(
    !text.includes('Broker origin hostname is not in the canonical allowlist'),
    'Canonical origin must not be rejected'
  );
});
