const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const root = join(__dirname, '..');
const migrationPath = join(root, 'supabase', 'migrations', '20260820042000_pandora_supabase_oauth_connection.sql');
const callbackPath = join(root, 'supabase', 'functions', 'connect-supabase', 'index.ts');
const ownerApiPath = join(root, 'supabase', 'functions', 'pandora-owner-api', 'index.ts');
const controlPath = join(root, 'supabase', 'functions', 'mcpmaster-supabase-control', 'index.ts');
const mobileConnectionsPath = join(root, 'apps', 'pandora-mobile', 'lib', 'features', 'connections', 'connections_screen.dart');

test('Supabase OAuth connection keeps credentials in Vault and uses PKCE', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const callback = readFileSync(callbackPath, 'utf8');
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /pandora_supabase_oauth_client_secret/);
  assert.match(migration, /extensions\.digest\(convert_to\(raw_state/);
  assert.match(migration, /codeChallenge/);
  assert.match(migration, /'auth_mode', 'oauth'/);
  assert.match(migration, /'allow_mutations', false/);
  assert.match(migration, /get_supabase_oauth_refresh_accounts/);
  assert.match(migration, /rotate_supabase_oauth_tokens/);
  assert.match(callback, /code_verifier: verifier/);
  assert.match(callback, /grant_type: "authorization_code"/);
  assert.match(callback, /get_supabase_oauth_client_secret/);
  assert.match(callback, /complete_supabase_oauth_installation/);
  assert.doesNotMatch(callback, /sba_[A-Za-z0-9_-]{20,}/);
});

test('owner and control surfaces use OAuth without exposing the client secret', () => {
  const ownerApi = readFileSync(ownerApiPath, 'utf8');
  const control = readFileSync(controlPath, 'utf8');
  const mobile = readFileSync(mobileConnectionsPath, 'utf8');
  assert.match(ownerApi, /connections\/supabase\/oauth\/start/);
  assert.match(ownerApi, /begin_supabase_oauth_session/);
  assert.match(ownerApi, /code_challenge_method/);
  assert.doesNotMatch(ownerApi, /pandora_supabase_oauth_client_secret/);
  assert.match(control, /get_supabase_oauth_refresh_accounts/);
  assert.match(control, /rotate_supabase_oauth_tokens/);
  assert.match(control, /grant_type: "refresh_token"/);
  assert.doesNotMatch(control, /sba_[A-Za-z0-9_-]{20,}/);
  assert.match(mobile, /Connect Supabase/);
  assert.match(mobile, /OAuth \+ PKCE/);
  assert.match(mobile, /LaunchMode\.externalApplication/);
  assert.doesNotMatch(mobile, /client_secret|pandora_supabase_oauth_client_secret/i);
});
