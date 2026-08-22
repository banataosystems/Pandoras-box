const fs = require('fs');
let c = fs.readFileSync('test/pandora-owner-api-route.test.js', 'utf8');
c = c.replaceAll('index.ts', 'handler.ts');
const fetchMockOrig = "global.fetch = async (url) => ({ ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) });";
const fetchMockNew = `global.fetch = async (url) => { const env = global.mockMemoryEnvelope; if (env === null) return { ok: false, status: 403, text: async () => 'projectos_memory_context_missing' }; if (env !== undefined) { if (env.namespace !== 'real_life') return { ok: false, status: 403, text: async () => 'projectos_memory_context_invalid' }; if (env.status === 'draft') return { ok: false, status: 403, text: async () => 'projectos_memory_context_unavailable' }; const ageMs = Date.now() - new Date(env.retrievedAt).getTime(); if (ageMs > 60000 || ageMs < 0) return { ok: false, status: 403, text: async () => 'projectos_memory_context_stale' }; } return { ok: true, json: async () => ({ contextHash: 'fake-context-hash-that-satisfies-the-broker' }) }; };`;
c = c.replaceAll(fetchMockOrig, fetchMockNew);
fs.writeFileSync('test/pandora-owner-api-route.test.js', c);

let c2 = fs.readFileSync('test/supabase-ordinary-approval-reconciliation.test.js', 'utf8');
c2 = c2.replaceAll('index.ts', 'handler.ts');
fs.writeFileSync('test/supabase-ordinary-approval-reconciliation.test.js', c2);

let c3 = fs.readFileSync('test/pandora-owner-api-owner-read-handoff.test.js', 'utf8');
c3 = c3.replaceAll('index.ts', 'handler.ts');
fs.writeFileSync('test/pandora-owner-api-owner-read-handoff.test.js', c3);
