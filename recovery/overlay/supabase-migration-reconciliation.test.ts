import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const repositoryRoot = new URL("../../", import.meta.url);
const manifestPath = new URL(
  "../../docs/supabase/recovery/jcyqixttuebxqqfkjonq/migration-reconciliation-manifest.json",
  import.meta.url,
);
const ivmvManifestPath = new URL(
  "../../docs/supabase/recovery/ivmvufhcsezyhczzondn/migration-provenance-manifest.json",
  import.meta.url,
);

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function repositoryFile(path: string): Buffer {
  return readFileSync(new URL(path, repositoryRoot));
}

test("recorded Supabase migration evidence is content-addressed and inactive", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.evidence.live_history.migration_count, 50);
  assert.equal(manifest.migrations.length, 50);

  let exactPayloads = 0;
  let nonReplayableFoundations = 0;
  for (const migration of manifest.migrations) {
    const recovery = migration.recovery_payload;
    if (recovery === null) {
      nonReplayableFoundations += 1;
      assert.equal(
        migration.replayability,
        "not_replayable_non_sql_placeholder",
      );
      continue;
    }

    exactPayloads += 1;
    assert.equal(recovery.active_migration, false);
    const encoded = repositoryFile(recovery.path).toString("utf8");
    assert.match(encoded, /^(?:[A-Za-z0-9+/]{4}|\s)*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\s*$/);
    const exact = Buffer.from(encoded.replace(/\s/g, ""), "base64");
    assert.equal(exact.length, recovery.decoded_bytes, migration.identity);
    assert.equal(sha256(exact), recovery.decoded_sha256, migration.identity);
    assert.equal(
      recovery.decoded_sha256,
      migration.live_record.statement_sha256,
      migration.identity,
    );

    const preview = repositoryFile(recovery.replay_preview.path);
    assert.equal(recovery.replay_preview.active_migration, false);
    assert.equal(preview.length, recovery.replay_preview.bytes, migration.identity);
    assert.equal(
      sha256(preview),
      recovery.replay_preview.sha256,
      migration.identity,
    );
    let contentEnd = exact.length;
    while (
      contentEnd > 0 &&
      (exact[contentEnd - 1] === 10 || exact[contentEnd - 1] === 13)
    ) {
      contentEnd -= 1;
    }
    assert.deepEqual(
      preview,
      Buffer.concat([exact.subarray(0, contentEnd), Buffer.from("\n")]),
    );
  }

  assert.equal(exactPayloads, 48);
  assert.equal(nonReplayableFoundations, 2);
  assert.equal(manifest.validation.decoded_payload_hash_matches, 48);
  assert.equal(manifest.validation.preview_normalization_matches, 48);

  for (const item of manifest.wrong_timestamp_exact_content_duplicates) {
    assert.equal(existsSync(new URL(item.local_path, repositoryRoot)), false);
    const inactive = repositoryFile(item.inactive_path);
    assert.equal(inactive.length, item.payload_bytes);
    assert.equal(sha256(inactive), item.payload_sha256);
  }

  for (const item of manifest.foreign_flutterflow_oidc_migrations) {
    assert.equal(existsSync(new URL(item.path, repositoryRoot)), false);
    const inactive = repositoryFile(item.inactive_path);
    assert.equal(inactive.length, item.bytes);
    assert.equal(sha256(inactive), item.sha256);
    assert.equal(item.must_remain_segregated_from_project_ref, manifest.project_ref);
  }
});

test("FlutterFlow migration evidence is mapped to exact live identities and stays incomplete", () => {
  const manifest = JSON.parse(readFileSync(ivmvManifestPath, "utf8"));
  assert.equal(manifest.projectRef, "ivmvufhcsezyhczzondn");
  assert.equal(manifest.activeMigrationStream, false);
  assert.equal(manifest.completeLiveHistory, false);
  assert.equal(manifest.productionMutationPerformed, false);

  const expected = [
    {
      archivedIdentity: "20260810032703_flutterflow_secure_credential_handoff_v1",
      liveIdentity: "20260810032703_flutterflow_secure_credential_handoff_v1",
      archiveSha256: "71db50e7754f0daa7c6c48b9249be7915351ad11f1d4e63a653c0de860146136",
      liveStatementSha256: "22421201fa795bc4573711bcdc78d7e4d07a6ec34bcea05d27753df16c6fc464",
      relationship: "live_payload_plus_one_terminal_lf_equals_archive",
    },
    {
      archivedIdentity: "20260810101500_flutterflow_github_oidc_broker",
      liveIdentity: "20260810102152_flutterflow_github_oidc_broker",
      archiveSha256: "c597e5fdc19a681124460625825c637eb07e05e4c63a51db153df27c73301759",
      liveStatementSha256: "c597e5fdc19a681124460625825c637eb07e05e4c63a51db153df27c73301759",
      relationship: "byte_identical",
    },
    {
      archivedIdentity: "20260810104000_fix_flutterflow_oidc_service_role_gate",
      liveIdentity: "20260810103038_fix_flutterflow_oidc_service_role_gate",
      archiveSha256: "8b820c5faee9abca8b47d316589d853d924184081363c5d89ace39d2a53f07bd",
      liveStatementSha256: "8b820c5faee9abca8b47d316589d853d924184081363c5d89ace39d2a53f07bd",
      relationship: "byte_identical",
    },
    {
      archivedIdentity: "20260810113000_record_flutterflow_oidc_attempts",
      liveIdentity: "20260810115547_record_flutterflow_oidc_attempts",
      archiveSha256: "9e1babfb9f17360a59a639c4b752a18b32ac0edd1fd0e57de35663b075e5caf3",
      liveStatementSha256: "9e1babfb9f17360a59a639c4b752a18b32ac0edd1fd0e57de35663b075e5caf3",
      relationship: "byte_identical",
    },
  ];
  assert.deepEqual(
    manifest.archivedSources.map((item: any) => ({
      archivedIdentity: item.archivedIdentity,
      liveIdentity: item.liveIdentity,
      archiveSha256: item.archiveSha256,
      liveStatementSha256: item.liveStatementSha256,
      relationship: item.relationship,
    })),
    expected,
  );

  for (const item of manifest.archivedSources) {
    const archive = repositoryFile(item.archivePath);
    assert.equal(archive.length, item.archiveBytes, item.archivedIdentity);
    assert.equal(sha256(archive), item.archiveSha256, item.archivedIdentity);
    if (item.relationship === "byte_identical") {
      assert.equal(item.archiveBytes, item.liveStatementBytes);
      assert.equal(item.archiveSha256, item.liveStatementSha256);
    } else {
      assert.equal(archive.at(-1), 10);
      assert.equal(archive.length - 1, item.liveStatementBytes);
      assert.equal(sha256(archive.subarray(0, -1)), item.liveStatementSha256);
    }
  }

  assert.deepEqual(manifest.interveningLiveIdentitiesNotPresentInArchive, [
    "20260810044812_flutterflow_manual_vault_secret_lookup_v1",
    "20260810045632_flutterflow_private_yaml_snapshot_cache_v1",
    "20260810052850_flutterflow_private_snapshot_writer_v1",
    "20260810055928_flutterflow_private_snapshot_reader_v1",
    "20260810060747_flutterflow_private_snapshot_files_reader_v1",
  ]);
});
