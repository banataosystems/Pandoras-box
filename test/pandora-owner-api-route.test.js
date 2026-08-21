'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('Real Route Acceptance: POST /ask equivalent request traverses full handler seam', async () => {
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
      'const { executeOwnerCommand } = require("../../dist/projectos/owner-command-pipeline.js");'
    )
    .replace(/Deno\.serve\(/g, 'global.edgeHandler = (');
    
  const transpiled = ts.transpileModule(stripped, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  // Set up the mocked Deno environment
  global.Deno = { env: { get: () => 'mock' } };
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: () => ({ 
      select: () => ({ 
        eq: () => ({ 
          eq: () => ({ 
            limit: () => Promise.resolve({ data: [{ organization_id: 'mock-org-1', role: 'owner' }] }) 
          }) 
        }) 
      }) 
    }),
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
      }
      if (func === 'projectos_accept_intake') {
        return { 
          data: { 
            is_new: true,
            intake: { id: 'intake-mock-99', status: 'accepted' } 
          } 
        };
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
  const responseBody = JSON.parse(await response.text());
  
  // 3. Verify owner-readable result from pipeline
  assert.strictEqual(responseBody.needsApproval, false, 'Should not require approval for read operations');
  assert.ok(responseBody.reply, 'Must contain a porcelain reply');
  assert.strictEqual(responseBody.proof.stage, 'production_verified', 'Must reach verified stage');
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
      'const { executeOwnerCommand } = require("../../dist/projectos/owner-command-pipeline.js");'
    )
    .replace(/Deno\.serve\(/g, 'global.edgeHandler = (');
    
  const transpiled = ts.transpileModule(stripped, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  
  global.Deno = { env: { get: () => 'mock' } };
  global.mockCreateClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'mock-user-1' } } }) },
    from: () => ({ 
      select: () => ({ 
        eq: () => ({ 
          eq: () => ({ 
            limit: () => Promise.resolve({ data: [{ organization_id: 'mock-org-1', role: 'owner' }] }) 
          }) 
        }) 
      }) 
    }),
    rpc: async (func, args) => {
      if (func === 'consume_runtime_rate_limit') {
        return { data: { allowed: true } };
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
  
  assert.strictEqual(response.status, 202);
  const responseBody = JSON.parse(await response.text());
  
  assert.strictEqual(responseBody.needsApproval, true, 'Dangerous commands MUST pause for approval');
  assert.ok(responseBody.approvalId, 'Must issue an approval ID');
  assert.strictEqual(responseBody.status.whatIsStoppingUs, 'Pending approval.', 'Must stop execution');
});
