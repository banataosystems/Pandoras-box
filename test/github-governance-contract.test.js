const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const policy = JSON.parse(read(".github/governance/main-policy.json"));
const protection = JSON.parse(read(".github/branch-protection/main.json"));
const workflow = read(".github/workflows/protected-main-governance.yml");

test("governance policy binds the canonical repository and provider mechanism", () => {
  assert.equal(policy.schema_version, "1.0.0");
  assert.deepEqual(policy.repository, {
    full_name: "banataosystems/Pandoras-box",
    repository_id: 1326729533,
    default_branch: "main",
  });
  assert.equal(policy.authority.provider_mechanism, "classic_branch_protection");
  assert.equal(
    policy.authority.provider_payload_path,
    ".github/branch-protection/main.json",
  );
  assert.equal(
    policy.authority.drift_validator_path,
    "scripts/check-github-governance-provider.mjs",
  );
});

test("provider payload and policy require the same exact-head status context", () => {
  const policyContexts = policy.status_checks.required_contexts.map(
    ({ context }) => context,
  );
  assert.deepEqual(policyContexts, ["Protected main exact-head gate"]);
  assert.deepEqual(protection.required_status_checks, {
    strict: true,
    contexts: policyContexts,
  });

  const gate = policy.status_checks.required_contexts[0];
  assert.equal(gate.runs_on_every_pull_request, true);
  assert.equal(gate.binds_exact_head, true);
  assert.equal(gate.workflow, ".github/workflows/protected-main-governance.yml");
  assert.equal(gate.job, "required");
});

test("pull-request review, stale-head, and conversation gates fail closed", () => {
  assert.equal(policy.pull_request.required, true);
  assert.equal(policy.pull_request.required_approving_review_count, 1);
  assert.equal(policy.pull_request.dismiss_stale_reviews, true);
  assert.equal(policy.pull_request.require_last_push_approval, true);
  assert.equal(policy.pull_request.require_conversation_resolution, true);
  assert.equal(policy.pull_request.require_code_owner_reviews, false);
  assert.deepEqual(protection.required_pull_request_reviews, {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    require_last_push_approval: true,
  });
  assert.deepEqual(policy.pull_request.independent_review, {
    required: true,
    bind_to_current_head: true,
    author_or_last_pusher_cannot_supply: true,
  });
});

test("main protection applies to administrators and forbids destructive ref operations", () => {
  assert.equal(protection.enforce_admins, true);
  assert.equal(protection.required_linear_history, true);
  assert.equal(protection.allow_force_pushes, false);
  assert.equal(protection.allow_deletions, false);
  assert.equal(protection.required_conversation_resolution, true);
  assert.equal(protection.lock_branch, false);
  assert.equal(protection.restrictions, null);
  assert.deepEqual(policy.bypass.actors, []);
  assert.equal(policy.bypass.normal_bypass_allowed, false);
});

test("repository and Actions settings are least-privilege and squash-only", () => {
  assert.deepEqual(policy.repository_settings, {
    allow_merge_commit: false,
    allow_squash_merge: true,
    allow_rebase_merge: false,
    allow_auto_merge: false,
    allow_update_branch: true,
    delete_branch_on_merge: false,
  });
  assert.deepEqual(policy.actions, {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: false,
  });
});

test("required workflow runs on every PR, uses exact-head checkout, and has no write token", () => {
  assert.match(workflow, /\non:\n  pull_request:\n  push:\n/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /^\s+paths:/m);
  assert.match(workflow, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.match(workflow, /name: Protected main exact-head gate/);

  assert.equal(
    (workflow.match(/ref: \$\{\{ env\.EXPECTED_HEAD \}\}/g) || []).length,
    3,
  );
  assert.equal(
    (workflow.match(/persist-credentials: false/g) || []).length,
    3,
  );
  assert.equal(
    (workflow.match(/test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_HEAD"/g) || [])
      .length,
    3,
  );

  const uses = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map(
    (match) => match[1],
  );
  assert.ok(uses.length >= 4);
  for (const action of uses) {
    assert.match(action, /@[0-9a-f]{40}$/);
  }
});

test("required workflow covers core and mobile source without path-filtering the gate", () => {
  for (const command of [
    "npm ci --no-fund",
    "npm run check",
    "npm test",
    "npm audit --omit=dev --audit-level=high",
    "flutter pub get --enforce-lockfile",
    "dart format --output=none --set-exit-if-changed lib test",
    "flutter analyze",
    "flutter test --reporter expanded",
    "flutter build web --release",
    "flutter build apk --debug",
  ]) {
    assert.ok(workflow.includes(command), `missing required command: ${command}`);
  }

  for (const dependency of [
    "governance-contract",
    "core-proof",
    "mobile-proof",
  ]) {
    assert.ok(workflow.includes(`- ${dependency}`));
    assert.ok(workflow.includes(`needs.${dependency}.result`));
  }
  assert.match(workflow, /if: always\(\)/);
});

test("provider drift validator is part of the exact-head governance proof", () => {
  assert.match(
    workflow,
    /node scripts\/check-github-governance-provider\.mjs --self-test/,
  );
});
