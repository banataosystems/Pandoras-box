const fs = require('fs');

let c = fs.readFileSync('test/pandora-owner-api-route.test.js', 'utf8');
c = c.replace("const fs = require('node:fs');\n", "");
c = c.replace("const path = require('node:path');\n", "");
c = c.replace("const ts = require('typescript');\n", "");

c = c.replaceAll('index.ts', 'handler.ts');
const fetchMockOrig = "global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });";
const fetchMockNew = `global.fetch = async (url) => { const env = global.mockMemoryEnvelope; if (env === null) return { ok: false, status: 403, text: async () => 'projectos_memory_context_missing' }; if (env !== undefined) { if (env.namespace !== 'real_life') return { ok: false, status: 403, text: async () => 'projectos_memory_context_invalid' }; if (env.status === 'draft') return { ok: false, status: 403, text: async () => 'projectos_memory_context_unavailable' }; const ageMs = Date.now() - new Date(env.retrievedAt).getTime(); if (ageMs > 60000 || ageMs < 0) return { ok: false, status: 403, text: async () => 'projectos_memory_context_stale' }; } return { ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) }; };`;
c = c.replaceAll(fetchMockOrig, fetchMockNew);

const planMockOrig = "if (func === 'create_execution_plan') { return { data: { planId: 'mock-plan-id', status: 'draft' } }; }";
const planMockNew = "if (func === 'create_execution_plan') { const isApproved = args && args.p_intake_id && args.p_intake_id.includes('approved'); return { data: { planId: 'mock-plan-id', status: isApproved ? 'approved' : 'unplanned' } }; } if (func === 'resolve_execution_plan_securely') { return { data: { organization_id: 'mock-org-1', request_id: 'req', tool: 'mock', args: {} } }; }";
c = c.replaceAll(planMockOrig, planMockNew);
fs.writeFileSync('test/pandora-owner-api-route.test.js', c);

let c2 = fs.readFileSync('test/supabase-ordinary-approval-reconciliation.test.js', 'utf8');
c2 = c2.replaceAll('index.ts', 'handler.ts');
c2 = c2.replace('\\nDeno.serve(', '\\nexport async function handleOwnerApiRequest');
fs.writeFileSync('test/supabase-ordinary-approval-reconciliation.test.js', c2);

let c3 = fs.readFileSync('test/pandora-owner-api-owner-read-handoff.test.js', 'utf8');
c3 = c3.replaceAll('index.ts', 'handler.ts');
fs.writeFileSync('test/pandora-owner-api-owner-read-handoff.test.js', c3);
