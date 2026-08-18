const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));
const policy = readJson(".github/governance/main-policy.json");
const protection = readJson(".github/branch-protection/main.json");
const reviewers = readJson(".github/governance/reviewer-registry.json");
const exceptions = readJson(".github/governance/actions-write-exceptions.json");
const trustedWorkflow = read(".github/workflows/protected-main-governance.yml");
const candidateWorkflow = read(".github/workflows/protected-main-governance-candidate.yml");

function gitBlobSha(content) {
  return crypto
    .createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest("hex");
}

function actionRefs(workflow) {
  return [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
}

test("policy is bound to the canonical personal repository and remains fail-closed", () => {
  assert.equal(policy.schema_version, "2.0.0");
  assert.deepEqual(policy.repository, {
    full_name: "banataosystems/Pandoras-box",
    repository_id: 1326729533,
    owner_type: "User",
    default_branch: "main",
  });
  assert.equal(policy.bootstrap.provider_application_allowed, false);
  assert.equal(policy.bootstrap.release_authorized, false);
  assert.ok(policy.bootstrap.blockers.includes("SECOND_QUALIFYING_REVIEWER_NOT_PROVIDER_VERIFIED"));
  assert.ok(policy.bootstrap.blockers.includes("TRUSTED_GATE_NOT_YET_ON_DEFAULT_BRANCH"));
  assert.ok(policy.bootstrap.blockers.includes("CURRENT_MAIN_ACTIONS_WRITE_EXCEPTIONS_NOT_RECONCILED"));
  assert.ok(policy.bootstrap.blockers.includes("MERGE_TO_MAIN_IS_PRODUCTION_SENSITIVE"));
});

test("provider payload pins the required check to GitHub Actions and has no context-only fallback", () => {
  assert.equal(protection.required_status_checks.strict, true);
  assert.deepEqual(protection.required_status_checks.checks, [
    { context: "Trusted protected-main exact-head gate", app_id: 15368 },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(protection.required_status_checks, "contexts"), false);
  assert.deepEqual(
    policy.status_checks.required_checks.map(({ context, app_id }) => ({ context, app_id })),
    protection.required_status_checks.checks,
  );
  assert.equal(policy.status_checks.required_checks[0].provider_identity_verification_required_before_apply, true);
});

test("review policy fails closed without bypasses and respects personal-repository capabilities", () => {
  assert.deepEqual(protection.required_pull_request_reviews, {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    required_approving_review_count: 1,
    require_last_push_approval: true,
    bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(protection.required_pull_request_reviews, "dismissal_restrictions"),
    false,
  );
  assert.equal(policy.main_branch.personal_repository_capabilities.dismissal_restrictions_supported, false);
  assert.equal(protection.restrictions, null);
  assert.deepEqual(policy.bypass.bypass_users, []);
  assert.deepEqual(policy.bypass.bypass_teams, []);
  assert.deepEqual(policy.bypass.bypass_apps, []);
});

test("main controls apply to administrators and reject destructive ref operations", () => {
  assert.equal(protection.enforce_admins, true);
  assert.equal(protection.required_linear_history, true);
  assert.equal(protection.allow_force_pushes, false);
  assert.equal(protection.allow_deletions, false);
  assert.equal(protection.block_creations, false);
  assert.equal(protection.required_conversation_resolution, true);
  assert.equal(protection.lock_branch, false);
  assert.equal(protection.allow_fork_syncing, false);
});

test("repository and Actions policy is squash-only and least-privilege by default", () => {
  assert.deepEqual(policy.repository_settings, {
    allow_merge_commit: false,
    allow_squash_merge: true,
    allow_rebase_merge: false,
    allow_auto_merge: false,
    allow_update_branch: true,
    delete_branch_on_merge: false,
  });
  assert.equal(policy.actions.repository_enabled, true);
  assert.equal(policy.actions.default_workflow_permissions, "read");
  assert.equal(policy.actions.can_approve_pull_request_reviews, false);
  assert.equal(policy.actions.immutable_action_pin_required, true);
});

test("trusted workflow is default-branch code and never executes candidate source", () => {
  assert.match(trustedWorkflow, /pull_request_target:/);
  assert.match(trustedWorkflow, /pull_request_review:/);
  assert.match(trustedWorkflow, /workflow_run:/);
  assert.doesNotMatch(trustedWorkflow, /^\s{2}pull_request:\s*$/m);
  assert.match(trustedWorkflow, /contents: read/);
  assert.match(trustedWorkflow, /pull-requests: read/);
  assert.match(trustedWorkflow, /checks: write/);
  assert.match(trustedWorkflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(trustedWorkflow, /Refusing to evaluate with candidate source as trusted source/);
  assert.doesNotMatch(trustedWorkflow, /npm (ci|test|run)/);
  assert.doesNotMatch(trustedWorkflow, /flutter/);
  assert.doesNotMatch(trustedWorkflow, /secrets\./);
  assert.match(trustedWorkflow, /evaluate-protected-main\.mjs --github-event/);
  assert.equal(actionRefs(trustedWorkflow).length, 1);
  assert.match(actionRefs(trustedWorkflow)[0], /@[0-9a-f]{40}$/);
});

test("candidate workflow reports on every pull request with exact-head read-only proofs", () => {
  assert.match(candidateWorkflow, /\non:\n  pull_request:\n  push:\n/);
  assert.doesNotMatch(candidateWorkflow, /pull_request_target/);
  assert.doesNotMatch(candidateWorkflow, /^\s+paths:/m);
  assert.match(candidateWorkflow, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(candidateWorkflow, /checks: write/);
  assert.doesNotMatch(candidateWorkflow, /contents: write/);
  assert.doesNotMatch(candidateWorkflow, /secrets\./);
  assert.match(candidateWorkflow, /name: Governance candidate exact-head proof/);
  assert.equal((candidateWorkflow.match(/ref: \$\{\{ env\.EXPECTED_HEAD \}\}/g) || []).length, 4);
  assert.equal((candidateWorkflow.match(/persist-credentials: false/g) || []).length, 4);
  assert.equal(
    (candidateWorkflow.match(/test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_HEAD"/g) || []).length,
    3,
  );
  for (const action of actionRefs(candidateWorkflow)) assert.match(action, /@[0-9a-f]{40}$/);
});

test("dependency advisories remain visible but do not control the required candidate aggregate", () => {
  assert.match(candidateWorkflow, /dependency-advisory:/);
  assert.match(candidateWorkflow, /continue-on-error: true/);
  assert.match(candidateWorkflow, /npm audit --omit=dev --audit-level=high/);
  const requiredSection = candidateWorkflow.split("\n  required:\n")[1];
  assert.ok(requiredSection);
  assert.doesNotMatch(requiredSection, /dependency-advisory/);
  for (const job of ["governance-contract", "core-proof", "mobile-proof"]) {
    assert.match(requiredSection, new RegExp(`- ${job}`));
  }
});

test("reviewer registry is truthfully empty and prevents provider application", () => {
  assert.equal(reviewers.provider_verified_at, null);
  assert.deepEqual(reviewers.reviewers, []);
  assert.equal(reviewers.application_gate, "blocked");
  assert.match(reviewers.blocker, /Do not invent or self-assign/);
});

test("current-main write-capable workflows are inventoried and block application", () => {
  assert.equal(exceptions.observed_main.sha, "c2cc635383b78d457d1731294a6f5b306d85f6be");
  assert.equal(exceptions.observed_main.application_gate, "blocked");
  assert.equal(exceptions.active_lane_dependency.must_not_be_modified_by_worker_3, true);
  assert.equal(exceptions.active_lane_dependency.status, "unmerged_unreviewed_dependency");
  assert.equal(exceptions.current_main_findings.length, 3);
  assert.ok(exceptions.prohibited.includes("pull_request-triggered repository writes"));
  assert.ok(exceptions.prohibited.includes("pushes to main"));
  assert.ok(exceptions.prohibited.includes("floating third-party or GitHub Action refs"));
});

test("write-workflow evidence binds to exact inherited Git blobs when those files are present", () => {
  for (const finding of exceptions.current_main_findings) {
    const absolute = path.join(ROOT, finding.path);
    if (!fs.existsSync(absolute)) continue;
    assert.equal(gitBlobSha(fs.readFileSync(absolute)), finding.blob_sha, finding.path);
  }
});

test("provider capture contract requires raw authenticated endpoints rather than hand normalization", () => {
  assert.equal(policy.provider_capture.raw_responses_required, true);
  assert.equal(policy.provider_capture.manual_normalization_is_not_accepted, true);
  assert.equal(policy.provider_capture.api_version, "2026-03-10");
  for (const endpoint of [
    "branch_protection",
    "pull_request_review_protection",
    "actions_permissions",
    "workflow_permissions",
    "rulesets",
    "collaborators",
    "candidate_workflow",
    "trusted_workflow",
    "check_runs",
  ]) {
    assert.ok(policy.provider_capture.required_endpoints.includes(endpoint));
  }
});

test("governance-critical paths require registered exact-head review", () => {
  const protectedPaths = policy.pull_request.high_risk_governance_review.protected_paths;
  for (const expected of [
    ".github/branch-protection/",
    ".github/governance/",
    ".github/workflows/protected-main-governance.yml",
    "docs/governance/",
    "scripts/check-github-governance-provider.mjs",
    "scripts/github-governance-provider-model.mjs",
    "scripts/github-governance-provider-validation.mjs",
    "scripts/evaluate-protected-main.mjs",
  ]) {
    assert.ok(protectedPaths.includes(expected));
  }
  assert.equal(policy.pull_request.high_risk_governance_review.bind_to_current_head, true);
  assert.equal(policy.pull_request.high_risk_governance_review.reviewer_must_be_registered, true);
});
test("trusted evaluator targets the GitHub REST API explicitly", () => {
  const evaluatorSource = read("scripts/evaluate-protected-main.mjs");
  assert.match(evaluatorSource, /const API_BASE = "https:\/\/api\.github\.com"/);
  assert.match(evaluatorSource, /const baseUrl = `\$\{API_BASE\}\/repos\/\$\{repository\}`/);
});

