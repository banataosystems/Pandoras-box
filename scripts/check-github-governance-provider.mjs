#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(
  fs.readFileSync(path.join(ROOT, ".github/governance/main-policy.json"), "utf8"),
);

function requireEqual(actual, expected, label, errors) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label} drifted`);
  }
}

export function validateProviderCapture(capture, options = {}) {
  const errors = [];
  const maxAgeMs = options.maxAgeMs ?? 60 * 60 * 1000;
  const nowMs = options.nowMs ?? Date.now();

  if (capture.schema_version !== "1.0.0") {
    errors.push("capture schema_version must be 1.0.0");
  }
  requireEqual(capture.repository?.full_name, policy.repository.full_name, "repository", errors);
  requireEqual(capture.repository?.repository_id, policy.repository.repository_id, "repository_id", errors);
  requireEqual(capture.repository?.default_branch, policy.repository.default_branch, "default_branch", errors);

  const observedMs = Date.parse(capture.observed_at ?? "");
  if (!Number.isFinite(observedMs)) {
    errors.push("observed_at is invalid");
  } else if (observedMs > nowMs + 5 * 60 * 1000) {
    errors.push("observed_at is in the future");
  } else if (nowMs - observedMs > maxAgeMs) {
    errors.push("provider capture is stale");
  }

  if (capture.main?.protected !== true) {
    errors.push("main is not provider-protected");
  }

  const expectedContexts = policy.status_checks.required_contexts.map(
    ({ context }) => context,
  );
  requireEqual(capture.protection?.required_status_checks?.strict, true, "strict status checks", errors);
  requireEqual(
    capture.protection?.required_status_checks?.contexts,
    expectedContexts,
    "required status contexts",
    errors,
  );
  requireEqual(capture.protection?.enforce_admins, true, "administrator enforcement", errors);
  requireEqual(
    capture.protection?.required_pull_request_reviews?.required_approving_review_count,
    1,
    "approval count",
    errors,
  );
  requireEqual(
    capture.protection?.required_pull_request_reviews?.dismiss_stale_reviews,
    true,
    "stale review dismissal",
    errors,
  );
  requireEqual(
    capture.protection?.required_pull_request_reviews?.require_last_push_approval,
    true,
    "latest-push approval",
    errors,
  );
  requireEqual(
    capture.protection?.required_conversation_resolution,
    true,
    "conversation resolution",
    errors,
  );
  requireEqual(capture.protection?.required_linear_history, true, "linear history", errors);
  requireEqual(capture.protection?.allow_force_pushes, false, "force-push policy", errors);
  requireEqual(capture.protection?.allow_deletions, false, "branch-deletion policy", errors);
  requireEqual(capture.protection?.bypass_actors ?? [], [], "bypass actors", errors);

  requireEqual(
    capture.repository_settings,
    policy.repository_settings,
    "repository merge settings",
    errors,
  );
  requireEqual(capture.actions, policy.actions, "Actions default permissions", errors);

  return errors;
}

function goodCapture(now) {
  return {
    schema_version: "1.0.0",
    observed_at: now,
    repository: {
      full_name: policy.repository.full_name,
      repository_id: policy.repository.repository_id,
      default_branch: policy.repository.default_branch,
    },
    main: { protected: true },
    protection: {
      required_status_checks: {
        strict: true,
        contexts: policy.status_checks.required_contexts.map(({ context }) => context),
      },
      enforce_admins: true,
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        dismiss_stale_reviews: true,
        require_last_push_approval: true,
      },
      required_conversation_resolution: true,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
      bypass_actors: [],
    },
    repository_settings: policy.repository_settings,
    actions: policy.actions,
  };
}

function runSelfTest() {
  const nowMs = Date.parse("2026-08-18T21:36:19Z");
  const now = new Date(nowMs).toISOString();
  assert.deepEqual(validateProviderCapture(goodCapture(now), { nowMs }), []);

  const mutations = [
    ["unprotected main", (capture) => { capture.main.protected = false; }],
    ["missing check", (capture) => { capture.protection.required_status_checks.contexts = []; }],
    ["non-strict checks", (capture) => { capture.protection.required_status_checks.strict = false; }],
    ["zero approvals", (capture) => { capture.protection.required_pull_request_reviews.required_approving_review_count = 0; }],
    ["stale approvals retained", (capture) => { capture.protection.required_pull_request_reviews.dismiss_stale_reviews = false; }],
    ["last-push approval disabled", (capture) => { capture.protection.required_pull_request_reviews.require_last_push_approval = false; }],
    ["admin bypass", (capture) => { capture.protection.enforce_admins = false; }],
    ["force pushes", (capture) => { capture.protection.allow_force_pushes = true; }],
    ["branch deletion", (capture) => { capture.protection.allow_deletions = true; }],
    ["merge commit enabled", (capture) => { capture.repository_settings.allow_merge_commit = true; }],
    ["Actions write default", (capture) => { capture.actions.default_workflow_permissions = "write"; }],
    ["bypass actor added", (capture) => { capture.protection.bypass_actors = ["RepositoryRole:admin"]; }],
  ];

  for (const [name, mutate] of mutations) {
    const capture = structuredClone(goodCapture(now));
    mutate(capture);
    assert.ok(
      validateProviderCapture(capture, { nowMs }).length > 0,
      `${name} must be rejected`,
    );
  }

  const stale = goodCapture("2026-08-18T19:00:00Z");
  assert.ok(validateProviderCapture(stale, { nowMs }).includes("provider capture is stale"));
  console.log(`Provider-drift self-test passed: ${mutations.length + 2} cases`);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  const capturePath = process.argv[2];
  if (!capturePath) {
    console.error(
      "Usage: node scripts/check-github-governance-provider.mjs <fresh-provider-capture.json>",
    );
    process.exit(2);
  }

  const capture = JSON.parse(fs.readFileSync(path.resolve(capturePath), "utf8"));
  const errors = validateProviderCapture(capture);
  if (errors.length) {
    console.error("GitHub governance provider drift detected:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log("GitHub governance provider capture matches policy.");
}
