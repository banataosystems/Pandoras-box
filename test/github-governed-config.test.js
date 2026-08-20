const assert = require('node:assert/strict');
const test = require('node:test');

const { buildToolConfiguration } = require('../dist/runtime/service-config.js');

const ENV_NAMES = [
  'GITHUB_TOKEN',
  'GITHUB_ACCOUNT_LABEL',
  'GITHUB_ALLOW_MUTATIONS',
  'GITHUB_LOGIN',
  'GITHUB_ALLOWED_REPOSITORIES',
  'GITHUB_GRANTED_SCOPES',
  'MCPMASTER_GITHUB_ACCOUNT_ID',
  'VERCEL_OIDC_TOKEN',
];

function captureEnvironment() {
  return Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(snapshot) {
  for (const name of ENV_NAMES) {
    const value = snapshot[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test('OIDC-backed GitHub catalog takes precedence over legacy GITHUB_TOKEN', async () => {
  const previous = captureEnvironment();
  const originalFetch = globalThis.fetch;
  const oidcToken = 'v'.repeat(80);
  let controlCalls = 0;

  process.env.GITHUB_TOKEN = 'stale-environment-token';
  process.env.GITHUB_ALLOWED_REPOSITORIES = 'banataosystems/legacy';
  process.env.GITHUB_GRANTED_SCOPES = 'identity:read';
  process.env.MCPMASTER_GITHUB_ACCOUNT_ID = 'github-primary';
  delete process.env.VERCEL_OIDC_TOKEN;

  globalThis.fetch = async (url, init) => {
    controlCalls += 1;
    assert.equal(url, 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/mcpmaster-supabase-control');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.authorization, `Bearer ${oidcToken}`);
    assert.deepEqual(JSON.parse(init.body), { action: 'github_catalog' });
    return {
      ok: true,
      status: 200,
      headers: { get() { return null; } },
      async text() {
        return JSON.stringify({
          ok: true,
          accounts: [{
            id: 'github-primary',
            label: 'Vault GitHub account',
            authMode: 'pat',
            token: 'catalog-token-not-a-real-secret',
            allowMutations: true,
            baseUrl: 'https://api.github.com',
            login: 'banataosystems',
            allowedRepositories: ['banataosystems/Pandoras-box'],
            grantedScopes: ['identity:read', 'repositories:read'],
          }],
        });
      },
    };
  };

  try {
    const configuration = await buildToolConfiguration('github.get-me', { vercelOidcToken: oidcToken });
    assert.equal(controlCalls, 1);
    assert.equal(configuration.github.id, 'github-primary');
    assert.equal(configuration.github.login, 'banataosystems');
    assert.equal(configuration.github.token, 'catalog-token-not-a-real-secret');
    assert.notEqual(configuration.github.token, process.env.GITHUB_TOKEN);
    assert.deepEqual(configuration.github.allowedRepositories, ['banataosystems/Pandoras-box']);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(previous);
  }
});

test('legacy GITHUB_TOKEN remains a fallback when workload identity is unavailable', async () => {
  const previous = captureEnvironment();
  process.env.GITHUB_TOKEN = 'fallback-token-not-a-real-secret';
  process.env.GITHUB_ACCOUNT_LABEL = 'Fallback GitHub';
  process.env.GITHUB_LOGIN = 'fallback-user';
  process.env.GITHUB_ALLOWED_REPOSITORIES = 'banataosystems/Pandoras-box';
  process.env.GITHUB_GRANTED_SCOPES = 'identity:read,repositories:read';
  delete process.env.MCPMASTER_GITHUB_ACCOUNT_ID;
  delete process.env.VERCEL_OIDC_TOKEN;

  try {
    const configuration = await buildToolConfiguration('github.get-me', {});
    assert.equal(configuration.github.id, 'environment');
    assert.equal(configuration.github.label, 'Fallback GitHub');
    assert.equal(configuration.github.login, 'fallback-user');
    assert.equal(configuration.github.token, 'fallback-token-not-a-real-secret');
    assert.deepEqual(configuration.github.allowedRepositories, ['banataosystems/Pandoras-box']);
    assert.deepEqual(configuration.github.grantedScopes, ['identity:read', 'repositories:read']);
  } finally {
    restoreEnvironment(previous);
  }
});
