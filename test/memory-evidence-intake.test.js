"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EvidenceCandidateArgsSchema,
  submitEvidenceCandidate,
} = require("../src/tools/memory-evidence-intake.js");
const { memoryTools } = require("../src/tools/memory.js");
const { getToolManifest } = require("../src/runtime/tool-manifest.js");

const SHA40 = "0b6d32b9135e2050c4f819a8d7ac3c78e6bc1117";
const SHA256 = "4a10f26ebe4e760c984b89ecc741ba77ba0213dcad6205f3d1851a887f624545";

function validArgs() {
  return {
    namespace: "real_life",
    projectKey: "mcpmaster-pandoras-box",
    title: "Pandora Mobile owner-device read-only journey",
    summary: "Owner-operated Android journey verified installation, authentication, live reads, and primary read-only navigation.",
    proofStage: "tested",
    claim: "Physical Android authenticated read-only foundation is tested; merge, deployment, and production remain unverified.",
    evidenceRefs: [
      { type: "video_sha256", ref: SHA256, sha256: SHA256, artifact_class: "private-raw-evidence" },
      { type: "github_source", ref: "banataosystems/Pandoras-box#37@" + SHA40 },
    ],
    provenance: {
      source_type: "owner_device_recording",
      source_locator: "conversation-attachment:2908.mp4",
      source_sha: SHA40,
      observed_at: "2026-08-14T10:00:00+08:00",
    },
    idempotencyKey: "pandora-mobile:" + SHA40 + ":owner-device-readonly",
  };
}

const config = {
  baseUrl: "https://pandorasbox-memory.vercel.app",
  oidcToken: "header.payload.signature",
  allowedNamespaces: ["real_life"],
  grantedScopes: ["memory:read", "memory:write"],
  timeoutMs: 1000,
  maxResponseBytes: 100000,
};

test("candidate schema requires a project identity and exact proof stage", () => {
  const parsed = EvidenceCandidateArgsSchema.parse(validArgs());
  assert.equal(parsed.proofStage, "tested");
  assert.throws(() => EvidenceCandidateArgsSchema.parse({ ...validArgs(), projectKey: undefined }));
  assert.throws(() => EvidenceCandidateArgsSchema.parse({ ...validArgs(), proofStage: "done" }));
  assert.throws(() => EvidenceCandidateArgsSchema.parse({ ...validArgs(), summary: "x".repeat(1801) }));
});

test("memory tool and manifest expose governed write semantics", () => {
  assert.ok(memoryTools["memory.submitEvidenceCandidate"]);
  const manifest = getToolManifest("memory.submitEvidenceCandidate");
  assert.equal(manifest.provider, "memory");
  assert.equal(manifest.risk, "write");
  assert.equal(manifest.mutation, true);
  assert.deepEqual(manifest.requiredProviderScopes, ["memory:write"]);
});

test("submission is bounded, OIDC-authenticated, and remains pending review", async () => {
  let observed;
  const result = await submitEvidenceCandidate(validArgs(), config, async (url, init) => {
    observed = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      ok: true,
      candidate_id: "11111111-1111-4111-8111-111111111111",
      status: "pending_review",
      idempotency_key: validArgs().idempotencyKey,
      namespace: "real_life",
      project_key: "mcpmaster-pandoras-box",
      proof_stage: "tested",
      deduplicated: false,
      created_at: "2026-08-14T11:00:00Z",
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(observed.url, "https://pandorasbox-memory.vercel.app/api/projectos/memory/evidence-candidates");
  assert.equal(observed.init.method, "POST");
  assert.equal(observed.init.headers["x-pandora-vercel-oidc"], config.oidcToken);
  assert.equal(observed.body.proof_stage, "tested");
  assert.equal(result.status, "pending_review");
  assert.equal(result.canonicalPromoted, false);
});

test("direct identifiers and credential signatures are rejected before network I/O", async () => {
  let called = false;
  const fetchFn = async () => { called = true; throw new Error("must not call"); };
  await assert.rejects(
    () => submitEvidenceCandidate({ ...validArgs(), summary: "owner email owner@example.com" }, config, fetchFn),
    /direct_identifier_email/,
  );
  await assert.rejects(
    () => submitEvidenceCandidate({ ...validArgs(), summary: "token sk_example123456789012345" }, config, fetchFn),
    /credential_signature/,
  );
  assert.equal(called, false);
});

test("write scope is fail-closed and non-pending responses are rejected", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(validArgs(), { ...config, grantedScopes: ["memory:read"] }, async () => {
      throw new Error("must not call");
    }),
    /write scope is not granted/,
  );

  await assert.rejects(
    () => submitEvidenceCandidate(validArgs(), config, async () =>
      new Response(JSON.stringify({ ok: true, status: "hard_canon" }), { status: 200 })),
    /did not remain pending review/,
  );
});
