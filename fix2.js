const fs = require('fs');
let c = fs.readFileSync('test/pandora-owner-api-route.test.js', 'utf8');

// Remove the injected 'use strict' block if present
c = c.replace(/function loadHandler\(\) \{[\s\S]*?'use strict';\n\n/, '');

// Fix index.ts to handler.ts
c = c.replaceAll('index.ts', 'handler.ts');

// Fix global.fetch
const fetchMockOrig = "global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });";
const fetchMockNew = `global.fetch = async (url) => { const env = global.mockMemoryEnvelope; if (env === null) return { ok: false, status: 403, text: async () => 'projectos_memory_context_missing' }; if (env !== undefined) { if (env.namespace !== 'real_life') return { ok: false, status: 403, text: async () => 'projectos_memory_context_invalid' }; if (env.status === 'draft') return { ok: false, status: 403, text: async () => 'projectos_memory_context_unavailable' }; const ageMs = Date.now() - new Date(env.retrievedAt).getTime(); if (ageMs > 60000 || ageMs < 0) return { ok: false, status: 403, text: async () => 'projectos_memory_context_stale' }; } return { ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) }; };`;
c = c.replaceAll(fetchMockOrig, fetchMockNew);

// Fix create_execution_plan
const planMockOrig = "if (func === 'create_execution_plan') { return { data: { planId: 'mock-plan-id', status: 'draft' } }; }";
const planMockNew = "if (func === 'create_execution_plan') { const isApproved = args && args.p_intake_id && args.p_intake_id.includes('approved'); return { data: { planId: 'mock-plan-id', status: isApproved ? 'approved' : 'unplanned' } }; } if (func === 'resolve_execution_plan_securely') { return { data: { organization_id: 'mock-org-1', request_id: 'req', tool: 'mock', args: {} } }; }";
c = c.replaceAll(planMockOrig, planMockNew);

// Handle route tests where Deno.serve was replaced
c = c.replaceAll(".replace(/Deno\\.serve\\(/g, 'global.edgeHandler = require(\"./handler.ts\").handleOwnerApiRequest;');", "");

fs.writeFileSync('test/pandora-owner-api-route.test.js', c);
