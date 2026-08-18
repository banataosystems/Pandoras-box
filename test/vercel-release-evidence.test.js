import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  sha256,
  validateManifestObject,
  validateWorkflowText,
  verifyEvidenceFiles,
} from "../scripts/verify-vercel-release-evidence.mjs";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(
  root,
  "docs/releases/vercel/2026-08-19-current-production-observation.json",
);
const workflowPath = resolve(root, ".github/workflows/vercel-release-evidence.yml");

const freshManifest = () => JSON.parse(readFileSync(manifestPath, "utf8"));

test("canonical release evidence and sidecar validate", () => {
  const { errors } = verifyEvidenceFiles({ root });
  assert.deepEqual(errors, []);
});

test("manifest hash is deterministic and content-addressed", () => {
  const text = readFileSync(manifestPath, "utf8");
  const sidecar = readFileSync(
    resolve(
      root,
      "docs/releases/vercel/2026-08-19-current-production-observation.sha256",
    ),
    "utf8",
  ).trim();
  assert.equal(sidecar.split("  ")[0], sha256(text));
});

test("staging and production must bind to the exact source SHA", () => {
  const manifest = freshManifest();
  manifest.projects[0].staging_deployment.source_sha =
    "0000000000000000000000000000000000000000";
  const errors = validateManifestObject(manifest);
  assert.ok(errors.some((error) => error.includes("staging_deployment.source_sha")));
});

test("rollback cannot qualify without every proof gate", () => {
  const manifest = freshManifest();
  manifest.projects[0].rollback_qualification.status = "QUALIFIED";
  manifest.projects[0].rollback_qualification.database_qualified = false;
  const errors = validateManifestObject(manifest);
  assert.ok(errors.some((error) => error.includes("QUALIFIED requires every gate")));
});

test("release readiness cannot outrun review, staging, and database gates", () => {
  const manifest = freshManifest();
  manifest.release_candidates[0].release_verdict =
    "READY_FOR_PRODUCTION_AUTHORIZATION";
  const errors = validateManifestObject(manifest);
  assert.ok(errors.some((error) => error.includes("readiness requires review")));
});

test("credential-shaped material is rejected", () => {
  const manifest = freshManifest();
  manifest.projects[0].environment_fingerprint.accidental_value =
    "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
  const errors = validateManifestObject(manifest);
  assert.ok(errors.some((error) => error.includes("GitHub credential shape")));
});

test("workflow is exact-head, read-only, and non-promoting", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.deepEqual(validateWorkflowText(workflow), []);
});

test("workflow push triggers and production commands fail closed", () => {
  const workflow = readFileSync(workflowPath, "utf8")
    .replace("  pull_request:", "  push:\n  pull_request:")
    .concat("\n# vercel deploy --prod\n");
  const errors = validateWorkflowText(workflow);
  assert.ok(errors.some((error) => error.includes("push trigger is forbidden")));
  assert.ok(errors.some((error) => error.includes("mutation command is forbidden")));
});
