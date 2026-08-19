"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { createHash } = require("node:crypto");

const FIXTURE = path.join(
  __dirname,
  "fixtures",
  "w1-r5-base",
  "projectos-memory-supabase-contract-regression.source.txt",
);
const EXPECTED_GIT_BLOB = "c370b2e16b01f17b7db498e0cf85d0f8142dbd59";

function gitBlobSha(content) {
  const header = Buffer.from(`blob ${content.length}\0`, "utf8");
  return createHash("sha1").update(header).update(content).digest("hex");
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  assert.notEqual(first, -1, `${label}: source block not found`);
  assert.equal(source.indexOf(before, first + before.length), -1, `${label}: source block is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const fixtureBytes = fs.readFileSync(FIXTURE);
assert.equal(gitBlobSha(fixtureBytes), EXPECTED_GIT_BLOB, "base regression fixture drifted");
let transformed = fixtureBytes.toString("utf8");

transformed = replaceExactlyOnce(
  transformed,
`  assert.deepEqual(finishInput.resultSummary, {
    type: "memory_evidence_candidate",
    candidateId: "22222222-2222-4222-8222-222222222222",
    reviewItemId: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",
    deduplicated: false,
    idempotencyKey: args.idempotencyKey,
    namespace: args.namespace,
    projectId: "33333333-3333-4333-8333-333333333333",
    projectKey: args.projectKey,
    proofStage: args.proofStage,
    canonicalPromoted: false,
    privacyScanVersion: "evidence_privacy_v2",
  });`,
`  const summary = finishInput.resultSummary;
  assert.equal(summary.type, "memory_evidence_candidate");
  assert.equal(summary.candidateId, "22222222-2222-4222-8222-222222222222");
  assert.equal(summary.reviewItemId, "66666666-6666-4666-8666-666666666666");
  assert.equal(summary.status, "pending_review");
  assert.equal(summary.deduplicated, false);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, "idempotencyKey"), false);
  assert.match(summary.idempotencyIdentityHash, /^[a-f0-9]{64}$/);
  assert.equal(summary.namespace, args.namespace);
  assert.equal(summary.projectId, "33333333-3333-4333-8333-333333333333");
  assert.equal(summary.projectKey, args.projectKey);
  assert.equal(summary.proofStage, args.proofStage);
  assert.equal(summary.canonicalPromoted, false);
  assert.equal(summary.privacyScanVersion, "evidence_privacy_v2");
  assert.equal(summary.providerOutcome, "succeeded");
  assert.equal(summary.mutationState, "PROVIDER_SUCCEEDED");
  assert.equal(summary.retryable, false);
  assert.equal(summary.automaticRetryAllowed, false);
  assert.equal(summary.retryContract, "do_not_repeat_provider_mutation");
  assert.equal(summary.reconciliationRequired, false);
  assert.equal(summary.evidencePolicy, "privacy_safe_summary_only_v1");`,
  "privacy-safe durable Memory summary",
);

transformed = replaceExactlyOnce(
  transformed,
`      throw Object.assign(new Error("private provider detail credential=must-not-leak"), { status: 400 });`,
`      throw Object.assign(new Error("private provider detail credential=must-not-leak"), {
        status: 400,
        providerOutcome: "failed_before_side_effects",
      });`,
  "proven pre-side-effect provider rejection",
);

const generatedFilename = path.join(
  __dirname,
  "projectos-memory-supabase-contract-regression.generated.js",
);
const generated = new Module(generatedFilename, module);
generated.filename = generatedFilename;
generated.paths = Module._nodeModulePaths(__dirname);
generated._compile(transformed, generatedFilename);
