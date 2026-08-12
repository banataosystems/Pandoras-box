const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { crc32, inflateRawSync } = require('node:zlib');

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

function gitBlobSha(value) {
  return createHash('sha1')
    .update(Buffer.from(`blob ${value.length}\0`))
    .update(value)
    .digest('hex');
}

function extractZipMemberFromShard(shard, expectedName) {
  const localHeaderSignature = 0x04034b50;
  for (let offset = 0; offset + 30 <= shard.length; offset += 1) {
    if (shard.readUInt32LE(offset) !== localHeaderSignature) continue;
    const flags = shard.readUInt16LE(offset + 6);
    const method = shard.readUInt16LE(offset + 8);
    const expectedCrc32 = shard.readUInt32LE(offset + 14);
    const compressedBytes = shard.readUInt32LE(offset + 18);
    const uncompressedBytes = shard.readUInt32LE(offset + 22);
    const nameBytes = shard.readUInt16LE(offset + 26);
    const extraBytes = shard.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameBytes + extraBytes;
    const dataEnd = dataStart + compressedBytes;
    if (dataEnd > shard.length) continue;
    const name = shard.subarray(nameStart, nameStart + nameBytes).toString('utf8');
    if (name !== expectedName) continue;
    assert.equal(flags & 0x08, 0, 'ZIP data descriptors are not supported');
    const compressed = shard.subarray(dataStart, dataEnd);
    const payload = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    assert.ok(payload, `unsupported ZIP method ${method}`);
    assert.equal(payload.length, uncompressedBytes);
    assert.equal(crc32(payload) >>> 0, expectedCrc32);
    return {
      payload,
      metadata: { offset, flags, method, expectedCrc32, compressedBytes, uncompressedBytes },
    };
  }
  throw new Error(`ZIP member not found in recovery shard: ${expectedName}`);
}

function hasZipEndOfCentralDirectory(value) {
  const signature = 0x06054b50;
  const earliestOffset = Math.max(0, value.length - 65557);
  for (let offset = value.length - 22; offset >= earliestOffset; offset -= 1) {
    if (value.readUInt32LE(offset) === signature) return true;
  }
  return false;
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

  assert.equal(
    manifest.foundations[0].recovered_archive_member_byte_equivalence,
    'verified_by_committed_test',
  );
  assert.equal(
    manifest.foundations[0].recovery_container_path,
    'recovery/mcpmaster-source.part-02',
  );
  assert.equal(
    manifest.foundations[0].recovery_container_commit,
    'cb811a30cc325567ce1ecbbc01cbf03a5715085c',
  );
  const recoveryShard = repositoryFile(manifest.foundations[0].recovery_container_path);
  assert.equal(gitBlobSha(recoveryShard), 'dbc9b03511423e2eba4defe7b6d2fd051dab9cda');
  assert.equal(manifest.foundations[0].recovery_container_blob, 'dbc9b03511423e2eba4defe7b6d2fd051dab9cda');
  const recovered = extractZipMemberFromShard(
    recoveryShard,
    'source/supabase/migrations/20260724010000_control_plane_foundation.sql',
  );
  assert.deepEqual(recovered.metadata, {
    offset: 2129,
    flags: 0,
    method: 8,
    expectedCrc32: 0x90b2694f,
    compressedBytes: 4548,
    uncompressedBytes: 27160,
  });
  const recoveredMember = recovered.payload;
  const recoveredCandidate = repositoryFile(manifest.foundations[0].path);
  assert.equal(recoveredMember.length, manifest.foundations[0].bytes);
  assert.equal(sha256(recoveredMember), '15733a9714e81fb0689438b8c92eec1490310c7476a45d5144902c09c9ec3fd5');
  assert.equal(manifest.foundations[0].sha256, '15733a9714e81fb0689438b8c92eec1490310c7476a45d5144902c09c9ec3fd5');
  assert.equal(gitBlobSha(recoveredMember), 'fe15cc45125984b388ec47d5a4c0bf5f0bed2b4c');
  assert.deepEqual(recoveredMember, recoveredCandidate);
  const recoveryParts = Buffer.concat(
    ['00', '01', '02', '03'].map((part) => repositoryFile(`recovery/mcpmaster-source.part-${part}`)),
  );
  assert.equal(recoveryParts.length, manifest.complete_archive_reassembly.observed_bytes);
  assert.equal(
    sha256(recoveryParts),
    manifest.complete_archive_reassembly.observed_lexicographic_concat_sha256,
  );
  assert.notEqual(
    sha256(recoveryParts),
    manifest.complete_archive_reassembly.documented_sha256,
  );
  assert.equal(hasZipEndOfCentralDirectory(recoveryParts), false);
  assert.equal(manifest.complete_archive_reassembly.zip_eocd_present, false);
  assert.equal(manifest.foundations[0].live_applied_migration_byte_equivalence, 'unproven');
  assert.equal(manifest.foundations[0].live_schema_equivalence, 'unproven');
  assert.equal(
    manifest.foundations[1].recovered_archive_member_byte_equivalence,
    'not_applicable_no_source_member',
  );
  assert.equal(manifest.foundations[1].live_applied_migration_byte_equivalence, 'unproven');
  assert.equal(manifest.foundations[1].live_schema_equivalence, 'unproven');

  assert.equal(manifest.replay_fixtures.length, 2);
  for (const fixture of manifest.replay_fixtures) {
    assert.match(fixture.path, /\/inactive-source\/schema-baseline-candidates\/replay-fixtures\//);
    const payload = repositoryFile(fixture.path);
    assert.equal(payload.length, fixture.bytes, fixture.checkpoint);
    assert.equal(sha256(payload), fixture.sha256, fixture.checkpoint);
  }
});

test('Meta schema hypothesis statically encodes shape without backdating positive ACLs', () => {
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
    'REPLAY-SAFETY INVARIANT, NOT RECOVERED HISTORICAL DDL',
    'revoke all on table public.meta_drafts from public, anon, authenticated, service_role',
    'revoke all on table public.meta_webhook_health from public, anon, authenticated, service_role',
    'revoke execute on function public.claim_meta_webhook_delivery',
  ];
  for (const fragment of requiredFragments) {
    assert.ok(source.includes(fragment), fragment);
  }

  const executableSource = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(executableSource, /(^|;)\s*grant\s+/i);
  assert.equal(
    manifest.uncommitted_catalog_capture_attestation.status,
    'historical_attestation_not_reproduced_by_this_candidate',
  );
  assert.equal(manifest.uncommitted_catalog_capture_attestation.query_bundle_committed, false);
  assert.equal(
    manifest.uncommitted_catalog_capture_attestation.machine_readable_result_committed,
    false,
  );
  assert.equal(
    manifest.validation.portable_foundation_replay.status,
    'historical_attestation_not_reproduced_by_this_candidate',
  );
  assert.equal(manifest.validation.portable_foundation_replay.replay_runner_committed, false);
  assert.equal(
    manifest.validation.portable_catalog_contract_parity.machine_readable_diff_committed,
    false,
  );
  assert.equal(
    manifest.validation.extension_stubbed_full_chain_replay.status,
    'historical_attestation_not_reproduced_by_this_candidate',
  );
  assert.equal(
    manifest.validation.extension_stubbed_full_chain_replay.machine_readable_result_committed,
    false,
  );
  assert.equal(
    manifest.validation.extension_stubbed_full_chain_replay.later_migration_count,
    48,
  );
});

test('post-chain ACL overlay is content-addressed and later chronology is unattached metadata', () => {
  const overlay = manifest.acl_chronology.post_chain_overlay;
  const payload = repositoryFile(overlay.path);
  assert.match(overlay.path, /\/inactive-source\/schema-baseline-candidates\//);
  assert.doesNotMatch(overlay.path, /^supabase\/migrations\//);
  assert.equal(payload.length, overlay.bytes);
  assert.equal(sha256(payload), overlay.sha256);
  assert.match(
    payload.toString('utf8'),
    /not recovered migration source/i,
  );
  assert.equal(manifest.acl_chronology.historical_foundation_acl_status, 'unproven');
  assert.equal(
    manifest.acl_chronology.later_payload_verification,
    'unattached_remote_metadata_not_reproduced_by_this_candidate',
  );
  const [globalSelect, healthRevoke] = manifest.acl_chronology.exact_later_events;
  assert.equal(globalSelect.decoded_sha256, 'c3baca57e1813f3b3989ef8723e4581a7731d596d38a071d7ad5d39d815ea8f7');
  assert.equal(globalSelect.decoded_bytes, 22820);
  assert.equal(
    globalSelect.relevant_statement,
    'grant select on all tables in schema public to authenticated;',
  );
  assert.equal(healthRevoke.decoded_sha256, '72bdbc6f8e2b66b0c83edba455e1766ae72f618b7d3a956261ef546206af9415');
  assert.equal(healthRevoke.decoded_bytes, 844);
  assert.equal(
    healthRevoke.relevant_statement,
    'revoke select on table public.meta_webhook_health from authenticated;',
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

  for (const item of [
    ...manifest.foundations,
    ...manifest.replay_fixtures,
    manifest.acl_chronology.post_chain_overlay,
  ]) {
    const source = repositoryFile(item.path).toString('utf8');
    for (const pattern of patterns) assert.doesNotMatch(source, pattern);
  }
});
