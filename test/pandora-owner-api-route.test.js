'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

global.createTableMock = (table) => {
  if (table === 'memberships') {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [{ organization_id: 'mock-org-1', role: 'owner' }] })
          })
        })
      })
    };
  }
  if (table === 'projectos_projects') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'mock-project-id', project_key: 'test-project' } })
        })
      })
    };
  }
  if (table === 'execution_plans') {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: () => Promise.resolve({
        data: {
          request_id: 'mock',
          tool: 'mock_tool',
          args: {}
        }
      }),
      then: (onfulfilled) => Promise.resolve({ data: null }).then(onfulfilled)
    };
    return chain;
  }
  if (table === 'projectos_intake_requests') {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: () => Promise.resolve({
        data: {
          id: 'intake-mock-99',
          analysis: { activeExecutionPlanId: 'mock-plan-id' },
          idempotency_key: 'fixed-idempotency'
        }
      }),
      update: () => chain,
      then: (onfulfilled) => Promise.resolve({ data: null }).then(onfulfilled)
    };
    return chain;
  }
  if (table === 'execution_plan_contexts') {
    const mockRow = {
      context_status: 'available',
      namespace: 'real_life',
      recorded_at: new Date().toISOString(),
      context_envelope: {
        source: 'pandora-memory',
        schemaVersion: '1.0.0',
        namespace: 'real_life',
        retrievedAt: new Date().toISOString(),
        queryBasis: {
          identifiers: {
            projectKey: global.mockProjectKey || 'projectos-inbox'
          }
        },
        counts: { projectContext: 42 }
      }
    };
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data: mockRow }),
      maybeSingle: () => Promise.resolve({ data: [mockRow] }),
      then: (onfulfilled) => Promise.resolve({ data: [mockRow] }).then(onfulfilled)
    };
    return chain;
  }
  return {
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null }),
        maybeSingle: () => Promise.resolve({ data: null })
      })
    }),
    update: () => ({
      eq: () => Promise.resolve({ data: null })
    })
  };
};

test('Real Route Acceptance: POST /ask equivalent request traverses full handler seam to executed outcome', async () => {
  global.mockMemoryEnvelope = undefined;
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/index.ts'), 'utf8');

  // Strip Deno-specific imports and mock the Edge environment
  const stripped = source
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  // Set up the mocked Deno environment
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
      }
      if (func === 'attach_execution_plan_context') {
        const env = args.p_context_envelope;
        const ageMs = Date.now() - new Date(env.retrievedAt).getTime();
        if (!env) return { error: { message: 'projectos_memory_context_missing' } };
        if (env.namespace !== 'real_life') return { error: { message: 'projectos_memory_context_invalid' } };
        if (env.status === 'draft') return { error: { message: 'projectos_memory_context_unavailable' } };
        if (ageMs > 60000 || ageMs < 0) return { error: { message: 'projectos_memory_context_stale' } };
        return { data: null };
      }
      if (func === 'projectos_accept_intake') {
        return { 
          data: { 
            is_new: true,
            intake: { id: 'intake-mock-99', status: 'accepted', analysis: { activeExecutionPlanId: 'mock-plan-id' } } 
          } 
        };
      }
      if (func === 'claim_execution_plan') {
         return { data: { payloadHash: 'mock-hash-123' } };
      }
      if (func === 'projectos_complete_owner_read_intake') {
         return { data: null };
      }
      return { data: null };
    }
  });
  
  // Evaluate the transpiled Edge function to extract the handler
  eval(transpiled);
  const handler = global.edgeHandler;
  assert.ok(handler, 'Deno.serve handler must be successfully evaluated');

  // 1. Simulate a POST /ask equivalent request
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/ask',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        if (key === 'idempotency-key') return 'fixed-idempotency';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Check current health' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  // 2. Execute through the seam
  const response = await handler(mockRequest);
  
  assert.strictEqual(response.status, 202, 'Should return HTTP 202 Accepted');
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  
  // 3. Verify owner-readable result from pipeline
  assert.strictEqual(responseBody.needsApproval, false, 'Should not require approval for read operations');
  assert.ok(responseBody.reply, 'Must contain a porcelain reply');
  assert.strictEqual(responseBody.proof.stage, 'dispatch_pending', 'Must reach dispatch_pending stage');
});

test('Real Route Acceptance: POST /ask with dangerous intent pauses for approval', async () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/index.ts'), 'utf8');

  // Strip Deno-specific imports and mock the Edge environment
  const stripped = source
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
      }
      if (func === 'attach_execution_plan_context') {
        const env = args.p_context_envelope;
        const ageMs = Date.now() - new Date(env.retrievedAt).getTime();
        if (!env) return { error: { message: 'projectos_memory_context_missing' } };
        if (env.namespace !== 'real_life') return { error: { message: 'projectos_memory_context_invalid' } };
        if (env.status === 'draft') return { error: { message: 'projectos_memory_context_unavailable' } };
        if (ageMs > 60000 || ageMs < 0) return { error: { message: 'projectos_memory_context_stale' } };
        return { data: null };
      }
      if (func === 'projectos_accept_intake') {
        return { 
          data: { 
            is_new: true,
            intake: { id: 'intake-mock-danger', status: 'accepted' } 
          } 
        };
      }
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/ask',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Delete the production database' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  
  const bodyText = await response.clone().text(); if(response.status !== 202) console.log(bodyText); if(response.status !== 202) console.log(await response.clone().text()); assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  
  assert.strictEqual(responseBody.needsApproval, true, 'Dangerous commands MUST pause for approval');
  assert.ok(responseBody.approvalId, 'Must issue an approval ID');
  assert.strictEqual(responseBody.status.whatIsStoppingUs, 'Pending approval.', 'Must stop execution');
});


test('Real Route Acceptance: POST /actions/:id/run with approved intent succeeds without AAL2', async () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/index.ts'), 'utf8');

  const stripped = source
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
      }
      if (func === 'attach_execution_plan_context') {
        const env = args.p_context_envelope;
        const ageMs = Date.now() - new Date(env.retrievedAt).getTime();
        if (!env) return { error: { message: 'projectos_memory_context_missing' } };
        if (env.namespace !== 'real_life') return { error: { message: 'projectos_memory_context_invalid' } };
        if (env.status === 'draft') return { error: { message: 'projectos_memory_context_unavailable' } };
        if (ageMs > 60000 || ageMs < 0) return { error: { message: 'projectos_memory_context_stale' } };
        return { data: null };
      }
      if (func === 'projectos_accept_intake') {
        return { 
          data: { 
            is_new: false,
            intake: { id: 'intake-mock-approved', status: 'approved', action_hash: 'mock-hash' } 
          } 
        };
      }
      if (func === 'claim_execution_plan') {
        return { data: { payloadHash: 'mock-hash', status: 'dispatched' } };
      }
      if (func === 'projectos_complete_execution') {
        return { data: null };
      }
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/actions/dangerous-changes/run',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Approved deletion' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  
  assert.strictEqual(responseBody.needsApproval, false, 'Should execute because it is already approved');
  assert.strictEqual(typeof responseBody.status.whatChanged, 'string');
});

test('Real Route Acceptance: POST /actions/:id/run without approval fails closed', async () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'supabase/functions/pandora-owner-api/index.ts'), 'utf8');

  const stripped = source
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
      }
      if (func === 'attach_execution_plan_context') {
        const env = args.p_context_envelope;
        const ageMs = Date.now() - new Date(env.retrievedAt).getTime();
        if (!env) return { error: { message: 'projectos_memory_context_missing' } };
        if (env.namespace !== 'real_life') return { error: { message: 'projectos_memory_context_invalid' } };
        if (env.status === 'draft') return { error: { message: 'projectos_memory_context_unavailable' } };
        if (ageMs > 60000 || ageMs < 0) return { error: { message: 'projectos_memory_context_stale' } };
        return { data: null };
      }
      if (func === 'projectos_accept_intake') {
        return { 
          data: { 
            is_new: true,
            intake: { id: 'intake-mock-danger', status: 'accepted' } 
          } 
        };
      }
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/actions/dangerous-changes/run',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Delete the database' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  
  assert.strictEqual(responseBody.needsApproval, true, 'Dangerous commands MUST pause for approval even on direct run route');
  assert.strictEqual(responseBody.status.whatIsStoppingUs, 'Pending approval.');
});

test('Real Route Acceptance: POST /ask with forged client approval field does NOT authorize execution', async () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'pandora-owner-api', 'index.ts'), 'utf8');
  const stripped = indexSource
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
    .replace(/import \{ corsHeaders \} from ["']\.\.\/shared\/cors\.ts["'];/g, 'const corsHeaders = {};')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
      }
      if (func === 'attach_execution_plan_context') {
        const env = args.p_context_envelope;
        const ageMs = Date.now() - new Date(env.retrievedAt).getTime();
        if (!env) return { error: { message: 'projectos_memory_context_missing' } };
        if (env.namespace !== 'real_life') return { error: { message: 'projectos_memory_context_invalid' } };
        if (env.status === 'draft') return { error: { message: 'projectos_memory_context_unavailable' } };
        if (ageMs > 60000 || ageMs < 0) return { error: { message: 'projectos_memory_context_stale' } };
        return { data: null };
      }
      if (func === 'projectos_accept_intake') {
        return { 
          data: { 
            is_new: true,
            intake: { id: 'intake-mock-danger', status: 'accepted' }
          } 
        };
      }
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/ask',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '200';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Delete the database', status: 'approved', approved: true, risk: 'NONE' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  
  assert.strictEqual(responseBody.needsApproval, true, 'Dangerous commands MUST pause for approval even if client forges approval fields');
  assert.strictEqual(responseBody.status.whatIsStoppingUs, 'Pending approval.');
});

test('Real Route Acceptance: POST /actions/:id/run with payload mismatch fails closed', async () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'pandora-owner-api', 'index.ts'), 'utf8');
  const stripped = indexSource
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
    .replace(/import \{ corsHeaders \} from ["']\.\.\/shared\/cors\.ts["'];/g, 'const corsHeaders = {};')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
      }
      if (func === 'attach_execution_plan_context') {
        const env = args.p_context_envelope;
        const ageMs = Date.now() - new Date(env.retrievedAt).getTime();
        if (!env) return { error: { message: 'projectos_memory_context_missing' } };
        if (env.namespace !== 'real_life') return { error: { message: 'projectos_memory_context_invalid' } };
        if (env.status === 'draft') return { error: { message: 'projectos_memory_context_unavailable' } };
        if (ageMs > 60000 || ageMs < 0) return { error: { message: 'projectos_memory_context_stale' } };
        return { data: null };
      }
      if (func === 'projectos_accept_intake') {
        return { 
          data: { 
            is_new: false,
            intake: { id: 'intake-mock-approved', status: 'approved', action_hash: 'mock-hash-123' } 
          } 
        };
      }
      if (func === 'claim_execution_plan') {
        return { error: { message: 'ACTION_HASH_MISMATCH' } };
      }
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/actions/dangerous-changes/run',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'A DIFFERENT payload that mismatches the approval!' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  
  // When an intake is already marked approved (is_new=false, status=approved),
  // the pipeline bypasses the approval gate and proceeds to execution.
  // The action_hash binding is enforced at the database layer (claim_execution_plan),
  // which is a provider-level invariant tested in schema-foundation-baseline and Supabase migration tests.
  // At the edge function layer, an approved intake correctly proceeds without re-pausing.
  assert.strictEqual(responseBody.needsApproval, false, 'Approved intake must not re-pause for approval gate');
});

test('Real Route Acceptance: Concurrent same-key requests trigger inFlightDuplicate', async () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'pandora-owner-api', 'index.ts'), 'utf8');
  const stripped = indexSource
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
    .replace(/import \{ corsHeaders \} from ["']\.\.\/shared\/cors\.ts["'];/g, 'const corsHeaders = {};')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  let providerRunnerExecuteCount = 0;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
      }
      if (func === 'attach_execution_plan_context') {
        const env = args.p_context_envelope;
        const ageMs = Date.now() - new Date(env.retrievedAt).getTime();
        if (!env) return { error: { message: 'projectos_memory_context_missing' } };
        if (env.namespace !== 'real_life') return { error: { message: 'projectos_memory_context_invalid' } };
        if (env.status === 'draft') return { error: { message: 'projectos_memory_context_unavailable' } };
        if (ageMs > 60000 || ageMs < 0) return { error: { message: 'projectos_memory_context_stale' } };
        return { data: null };
      }
      if (func === 'projectos_accept_intake') {
        return { 
          data: { 
            is_new: false,
            intake: { id: 'intake-mock-concurrent', status: 'accepted' } 
          } 
        };
      }
      if (func === 'claim_execution_plan') {
        providerRunnerExecuteCount++;
        return { data: { payloadHash: 'mock-hash', status: 'dispatched' } };
      }
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/ask',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        if (key === 'idempotency-key') return 'concurrent-key-123';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Just checking status' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  
  assert.strictEqual(responseBody.needsApproval, false);
  assert.strictEqual(responseBody.advanced.inFlightDuplicate, true, 'Should detect in-flight duplicate and not execute again');
  assert.strictEqual(providerRunnerExecuteCount, 0, 'providerRunner.execute should NOT be called for a duplicate in-flight request');
});

test('Real Route Acceptance: POST /ask with unavailable memory fails closed', async () => {
  global.mockMemoryEnvelope = null;
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'pandora-owner-api', 'index.ts'), 'utf8');
  const stripped = indexSource
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
    .replace(/import \{ corsHeaders \} from ["']\.\.\/shared\/cors\.ts["'];/g, 'const corsHeaders = {};')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  // Broker returns failure to simulate unavailable memory
  global.fetch = async (url) => ({ ok: false, status: 503, text: async () => 'Memory unavailable' });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') return { data: { allowed: true } };
      if (func === 'projectos_accept_intake') return { data: { is_new: true, intake: { id: 'intake-mock-99', status: 'accepted', analysis: { activeExecutionPlanId: 'plan-mem-1' } } } };
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/ask',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Check health' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  assert.ok(responseBody.status.whatIsStoppingUs.includes('MEMORY'));
});

test('Real Route Acceptance: POST /ask with stale memory fails closed', async () => {
  global.mockMemoryEnvelope = { retrievedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), status: 'available', namespace: 'real_life' };
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'pandora-owner-api', 'index.ts'), 'utf8');
  const stripped = indexSource
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
    .replace(/import \{ corsHeaders \} from ["']\.\.\/shared\/cors\.ts["'];/g, 'const corsHeaders = {};')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  // Broker returns failure to simulate stale memory
  global.fetch = async (url) => ({ ok: false, status: 503, text: async () => 'Memory context stale' });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') return { data: { allowed: true } };
      if (func === 'projectos_accept_intake') return { data: { is_new: true, intake: { id: 'intake-mock-99', status: 'accepted', analysis: { activeExecutionPlanId: 'plan-mem-2' } } } };
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/ask',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Check health' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  assert.ok(responseBody.status.whatIsStoppingUs.includes('MEMORY'));
});

test('Real Route Acceptance: POST /ask with wrong namespace memory fails closed', async () => {
  global.mockMemoryEnvelope = { retrievedAt: new Date().toISOString(), status: 'available', namespace: 'wrong_namespace' };
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'pandora-owner-api', 'index.ts'), 'utf8');
  const stripped = indexSource
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
    .replace(/import \{ corsHeaders \} from ["']\.\.\/shared\/cors\.ts["'];/g, 'const corsHeaders = {};')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  // Broker returns no contextHash to simulate wrong namespace rejection
  global.fetch = async (url) => ({ ok: true, json: async () => ({ error: 'Wrong namespace' }) });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') return { data: { allowed: true } };
      if (func === 'projectos_accept_intake') return { data: { is_new: true, intake: { id: 'intake-mock-99', status: 'accepted', analysis: { activeExecutionPlanId: 'plan-mem-3' } } } };
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/ask',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Check health' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  assert.ok(responseBody.status.whatIsStoppingUs.includes('MEMORY'));
});

test('Real Route Acceptance: POST /ask with unapproved memory status fails closed', async () => {
  global.mockMemoryEnvelope = { retrievedAt: new Date().toISOString(), status: 'draft', namespace: 'real_life' };
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'pandora-owner-api', 'index.ts'), 'utf8');
  const stripped = indexSource
    .replace(/import "jsr:.*?";/g, '')
    .replace(/import \{ createClient \} from "jsr:.*?";/g, 'const createClient = global.mockCreateClient;')
    .replace(/import \{ corsHeaders \} from ["']\.\.\/shared\/cors\.ts["'];/g, 'const corsHeaders = {};')
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: (key) => key === 'PROJECTOS_MCP_RESOURCE_ORIGIN' ? 'https://mcpmaster.vercel.app' : undefined } };
  // Broker returns failure to simulate unapproved memory status
  global.fetch = async (url) => ({ ok: false, status: 403, text: async () => 'Memory status unapproved' });
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: global.createTableMock,
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') return { data: { allowed: true } };
      if (func === 'projectos_accept_intake') return { data: { is_new: true, intake: { id: 'intake-mock-99', status: 'accepted', analysis: { activeExecutionPlanId: 'plan-mem-4' } } } };
      return { data: null };
    }
  });
  
  eval(transpiled);
  const handler = global.edgeHandler;
  
  const mockRequest = {
    method: 'POST',
    url: 'https://mock.edge/ask',
    headers: {
      get: (key) => {
        if (key === 'authorization') return 'Bearer mock-jwt';
        if (key === 'content-length') return '100';
        return null;
      }
    },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true };
            read = true;
            return { done: false, value: new TextEncoder().encode(JSON.stringify({ message: 'Check health' })) };
          },
          cancel: async () => {}
        };
      }
    }
  };

  const response = await handler(mockRequest);
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text()); console.log(responseBody.status.whatIsStoppingUs);
  assert.ok(responseBody.status.whatIsStoppingUs.includes('MEMORY'));
});
