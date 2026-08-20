const assert = require('node:assert/strict');
const test = require('node:test');

const { executeMemoryTool } = require('../dist/tools/memory.js');

const CONFIG = {
  baseUrl: 'https://memory.example.test',
  oidcToken: 'o'.repeat(64),
  allowedNamespaces: ['real_life'],
  grantedScopes: ['memory:read'],
  timeoutMs: 8000,
  maxResponseBytes: 500000,
};

function responseFor(updatedAt) {
  const payload = {
    ok: true,
    namespace: 'real_life',
    canonical_records: [{
      id: 'canon-1',
      namespace: 'real_life',
      title: 'Canonical state',
      body: 'Approved project state',
      canon_status: 'hard_canon',
      approved: true,
      updated_at: updatedAt,
    }],
    warnings: [],
  };
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(payload),
  };
}

test('canonicalContext defaults to a 24-hour fail-closed freshness gate', async () => {
  const stale = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString();
  const result = await executeMemoryTool(
    'memory.canonicalContext',
    { namespace: 'real_life', query: 'current state' },
    CONFIG,
    async () => responseFor(stale),
  );
  assert.equal(result.degraded, true);
  assert.deepEqual(result.canonical, []);
  assert.match(result.degradedReasons.join(' '), /older than the configured freshness window/);
  assert.equal(result.freshnessScope, 'query_approved_records');
});

test('explicit wider freshness window still works and remains query-scoped', async () => {
  const recentEnough = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString();
  const result = await executeMemoryTool(
    'memory.canonicalContext',
    { namespace: 'real_life', query: 'current state', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
    CONFIG,
    async () => responseFor(recentEnough),
  );
  assert.equal(result.degraded, false);
  assert.equal(result.canonical.length, 1);
  assert.equal(result.freshnessScope, 'query_approved_records');
});
