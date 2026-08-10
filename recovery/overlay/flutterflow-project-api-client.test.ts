import assert from 'node:assert/strict';
import test from 'node:test';
import { FlutterFlowProjectApiClient } from './flutterflow-project-api-client.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('listProjects uses bearer auth without exposing token in URL/body', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new FlutterFlowProjectApiClient({
    getToken: () => 'secret-token',
    fetchImpl: (async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ success: true, value: [] });
    }) as typeof fetch,
  });
  await client.listProjects();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.flutterflow.io/v2/l/listProjects');
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('authorization'), 'Bearer secret-token');
  assert.ok(!calls[0].url.includes('secret-token'));
  assert.ok(!String(calls[0].init.body).includes('secret-token'));
});

test('writes fail closed without explicit approval', async () => {
  const client = new FlutterFlowProjectApiClient({
    getToken: () => 'secret-token',
    fetchImpl: (async () => jsonResponse({ success: true })) as typeof fetch,
  });
  await assert.rejects(
    () => client.updateProjectByYaml('p1', { 'app-state': 'fields: []' }, { approvalGranted: false }),
    /flutterflow_write_approval_required/,
  );
});

test('write validates every file before update', async () => {
  const paths: string[] = [];
  const client = new FlutterFlowProjectApiClient({
    getToken: () => 'secret-token',
    fetchImpl: (async (url) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path.endsWith('/validateProjectYaml')) return jsonResponse({ success: true, reason: null, value: '' });
      if (path.endsWith('/updateProjectByYaml')) return jsonResponse({ success: true, reason: null, value: '' });
      return jsonResponse({ success: false }, 404);
    }) as typeof fetch,
  });
  await client.updateProjectByYaml(
    'p1',
    { 'app-state': 'fields: []', 'app-details': 'name: Pandora' },
    { approvalGranted: true, approvalRef: 'approval-123' },
  );
  assert.deepEqual(paths, [
    '/v2/validateProjectYaml',
    '/v2/validateProjectYaml',
    '/v2/updateProjectByYaml',
  ]);
});

test('validation failure prevents update', async () => {
  const paths: string[] = [];
  const client = new FlutterFlowProjectApiClient({
    getToken: () => 'secret-token',
    fetchImpl: (async (url) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      return jsonResponse({ success: false, validationErrors: [{ message: 'bad yaml' }] });
    }) as typeof fetch,
  });
  await assert.rejects(
    () => client.updateProjectByYaml('p1', { 'app-state': 'bad:' }, { approvalGranted: true }),
    /flutterflow_validation_failed:app-state/,
  );
  assert.deepEqual(paths, ['/v2/validateProjectYaml']);
});

test('missing token fails before network', async () => {
  let called = false;
  const client = new FlutterFlowProjectApiClient({
    getToken: () => '',
    fetchImpl: (async () => { called = true; return jsonResponse({}); }) as typeof fetch,
  });
  await assert.rejects(() => client.listProjects(), /flutterflow_api_token_unavailable/);
  assert.equal(called, false);
});
