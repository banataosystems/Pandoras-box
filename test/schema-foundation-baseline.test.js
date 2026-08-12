const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const repositoryRoot = join(__dirname, '..');
const candidateRoot =
  'docs/supabase/recovery/jcyqixttuebxqqfkjonq/inactive-source/' +
  'schema-baseline-candidates/';
const manifest = JSON.parse(
  readFileSync(join(repositoryRoot, candidateRoot, 'schema-baseline-manifest.json'), 'utf8'),
);

function repositoryFile(path) {
  return readFileSync(join(repositoryRoot, path));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('schema foundation candidates are content-addressed and inactive', () => {
  assert.equal(manifest.status, 'inactive_review_candidate');
  assert.equal(manifest.production_mutation_performed, false);
  assert.equal(manifest.active_migration_directory_modified, false);
  assert.equal(manifest.foundations.length, 2);

  for (const foundation of manifest.foundations) {
    assert.match(foundation.path, /\/inactive-source\/schema-baseline-candidates\//);
    assert.doesNotMatch(foundation.path, /^supabase\/migrations\//);
    const payload = repositoryFile(foundation.path);
    assert.equal(payload.length, foundation.bytes, foundation.identity);
    assert.equal(sha256(payload), foundation.sha256, foundation.identity);
  }

  assert.equal(manifest.foundations[0].original_byte_equivalence, true);
  assert.equal(manifest.foundations[0].live_schema_equivalence, false);
  assert.equal(manifest.foundations[1].original_byte_equivalence, false);
  assert.equal(manifest.foundations[1].live_schema_equivalence, false);

  assert.equal(manifest.replay_fixtures.length, 2);
  for (const fixture of manifest.replay_fixtures) {
    assert.match(fixture.path, /\/inactive-source\/schema-baseline-candidates\/replay-fixtures\//);
    const payload = repositoryFile(fixture.path);
    assert.equal(payload.length, fixture.bytes, fixture.checkpoint);
    assert.equal(sha256(payload), fixture.sha256, fixture.checkpoint);
  }
});

test('Meta schema reconstruction encodes the observed catalog boundary', () => {
  const source = repositoryFile(manifest.foundations[1].path).toString('utf8');

  const requiredFragments = [
    'drop constraint webhook_events_provider_delivery_id_key',
    'add column expires_at timestamptz',
    'constraint webhook_events_org_provider_delivery_unique',
    'create table public.meta_drafts',
    'create table public.meta_webhook_health',
    'create policy meta_drafts_insert_staff',
    'create policy meta_drafts_select_member',
    'create or replace function public.claim_meta_webhook_delivery',
    'create or replace function public.record_meta_webhook_health',
    "set search_path = ''",
    'grant select, insert on table public.meta_drafts to authenticated',
    'grant all on table public.meta_webhook_health to service_role',
  ];
  for (const fragment of requiredFragments) {
    assert.ok(source.includes(fragment), fragment);
  }

  assert.deepEqual(manifest.live_catalog_contract.captured_rows, {
    meta_drafts: 0,
    meta_webhook_health: 0,
    webhook_events: 0,
  });
  assert.deepEqual(
    manifest.live_catalog_contract.tables.meta_drafts.authenticated_privileges,
    ['INSERT', 'SELECT'],
  );
  assert.deepEqual(
    manifest.live_catalog_contract.tables.meta_webhook_health.authenticated_privileges,
    [],
  );
  assert.equal(
    manifest.live_catalog_contract.functions[
      'claim_meta_webhook_delivery(uuid,uuid,text,text,timestamptz)'
    ].normalized_definition_sha256,
    'b6ac6f8de7d9dc73b5710eed0e8a795148d23c422b7ba44ff780e30358f171a0',
  );
  assert.equal(
    manifest.live_catalog_contract.functions[
      'record_meta_webhook_health(uuid,text,boolean,timestamptz)'
    ].normalized_definition_sha256,
    '8819fcb068647307172b91717561279e559bf953e7ea2653f5feaf878a5d4444',
  );
  assert.equal(manifest.validation.portable_foundation_replay.status, 'passed');
  assert.equal(
    manifest.validation.extension_stubbed_full_chain_replay.later_migration_count,
    48,
  );
});

test('recovery candidates contain no credential-shaped literals', () => {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  ];

  for (const item of [...manifest.foundations, ...manifest.replay_fixtures]) {
    const source = repositoryFile(item.path).toString('utf8');
    for (const pattern of patterns) assert.doesNotMatch(source, pattern);
  }
});
