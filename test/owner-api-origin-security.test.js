import test from 'node:test';
import assert from 'node:assert';
import { handler } from '../supabase/functions/pandora-owner-api/index.js';

test('Owner API origin security tests', async (t) => {
  const originalEnv = process.env.PROJECTOS_MCP_RESOURCE_ORIGIN;
  
  await t.test('Foreign origin is rejected before Authorization is transmitted', async () => {
    process.env.PROJECTOS_MCP_RESOURCE_ORIGIN = 'https://evil.com';
    const req = new Request('https://api.example.com/owner/memory', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'hydrate', payload: { planId: 'plan-123' } })
    });
    const res = await handler(req);
    const text = await res.text();
    assert.match(text, /Broker origin hostname is not in the canonical allowlist/);
  });

  await t.test('URLs with query, fragment, or credentials are rejected', async () => {
    process.env.PROJECTOS_MCP_RESOURCE_ORIGIN = 'https://user:pass@mcpmaster.vercel.app?attack=1#hash';
    const req = new Request('https://api.example.com/owner/memory', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'hydrate', payload: { planId: 'plan-123' } })
    });
    const res = await handler(req);
    const text = await res.text();
    assert.match(text, /Broker URL must not contain credentials/);
  });
  
  process.env.PROJECTOS_MCP_RESOURCE_ORIGIN = originalEnv;
});
