const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
let provider;
let bootstrap;
let mergePath;

test.before(async () => {
  provider = await import(pathToFileURL(path.join(ROOT, "scripts/check-github-governance-provider.mjs")));
  bootstrap = await import(pathToFileURL(path.join(ROOT, "scripts/check-github-governance-bootstrap-provider.mjs")));
  mergePath = await import(pathToFileURL(path.join(ROOT, "scripts/evaluate-github-normal-merge-path.mjs")));
});

const HEAD = "b".repeat(40);
const BASE = "a".repeat(40);
const NOW = "2026-08-19T00:00:00.000Z";

function urls(headSha) {
  const base = "https://api.github.com/repos/banataosystems/Pandoras-box";
  return {
    repository: base,
    branch: `${base}/branches/main`,
    branch_protection: `${base}/branches/main/protection`,
    pull_request_review_protection: `${base}/branches/main/protection/required_pull_request_reviews`,
    actions_permissions: `${base}/actions/permissions`,
    workflow_permissions: `${base}/actions/permissions/workflow`,
    rulesets: `${base}/rulesets?includes_parents=true`,
    collaborators: `${base}/collaborators?affiliation=all&per_page=100`,
    candidate_workflow: `${base}/actions/workflows/protected-main-governance-candidate.yml`,
    trusted_workflow: `${base}/actions/workflows/protected-main-governance.yml`,
    check_runs: `${base}/commits/${headSha}/check-runs?per_page=100`,
  };
}

function realProviderEnvelope() {
  const endpointUrls = urls(HEAD);
  const endpoint = (name, body, status = 200) => ({
    request: { method: "GET", url: endpointUrls[name] },
    response: { status, body },
  });
  return provider.buildCaptureEnvelope({
    observed_at: NOW,
    api_version: "2026-03-10",
    repository: "banataosystems/Pandoras-box",
    head_sha: HEAD,
    endpoints: {
      repository: endpoint("repository", {
        id: 1326729533,
        full_name: "banataosystems/Pandoras-box",
        owner: { login: "banataosystems", type: "User" },
        default_branch: "main",
        allow_merge_commit: false,
        allow_squash_merge: true,
        allow_rebase_merge: false,
        allow_auto_merge: false,
        allow_update_branch: true,
        delete_branch_on_merge: false,
      }),
      branch: endpoint("branch", { name: "main", commit: { sha: BASE }, protected: true }),
      branch_protection: endpoint("branch_protection", {
        required_status_checks: { strict: true, checks: [{ context: "node24", app_id: 15368 }] },
        enforce_admins: { enabled: true },
        required_pull_request_reviews: {},
        restrictions: null,
        required_linear_history: { enabled: true },
        allow_force_pushes: { enabled: false },
        allow_deletions: { enabled: false },
        block_creations: { enabled: false },
        required_conversation_resolution: { enabled: true },
        lock_branch: { enabled: false },
        allow_fork_syncing: { enabled: false },
      }),
      pull_request_review_protection: endpoint("pull_request_review_protection", {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
        required_approving_review_count: 1,
        require_last_push_approval: true,
        bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
      }),
      actions_permissions: endpoint("actions_permissions", { enabled: true, allowed_actions: "all" }),
      workflow_permissions: endpoint("workflow_permissions", {
        default_workflow_permissions: "read",
        can_approve_pull_request_reviews: false,
      }),
      rulesets: endpoint("rulesets", []),
      collaborators: endpoint("collaborators", [
        { login: "banataosystems", role_name: "admin", permissions: { admin: true, push: true } },
      ]),
      candidate_workflow: endpoint("candidate_workflow", {
        id: 10, name: "Protected main governance candidate",
        path: ".github/workflows/protected-main-governance-candidate.yml", state: "active",
      }),
      trusted_workflow: endpoint("trusted_workflow", { message: "Not Found" }, 404),
      check_runs: endpoint("check_runs", {
        check_runs: [{
          id: 30, name: "node24", head_sha: HEAD, status: "completed", conclusion: "success",
          app: { id: 15368, slug: "github-actions" }, external_id: null,
        }],
      }),
    },
  });
}

function mutateEnvelope(fn) {
  const original = realProviderEnvelope();
  const payload = structuredClone(original.payload);
  fn(payload.endpoints);
  return provider.buildCaptureEnvelope(payload);
}

function validate(envelope = realProviderEnvelope()) {
  return bootstrap.validateBootstrapProviderCapture(envelope, { nowMs: Date.parse(NOW) });
}

test("bootstrap validator consumes real GitHub response wrappers and passes provider controls without conflating reviewer readiness", () => {
  const result = validate();
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.protection.enforce_admins, true);
  assert.equal(result.normalized.protection.required_linear_history, true);
  assert.deepEqual(result.normalized.protection.required_pull_request_reviews.bypass_pull_request_allowances.actors, {
    users: [], teams: [], apps: [],
  });
  const steady = provider.validateProviderCapture(realProviderEnvelope(), bootstrap.buildBootstrapValidationPolicy(), {
    nowMs: Date.parse(NOW), phase: "steady_state",
  });
  assert.ok(steady.errors.includes("no provider-verified non-owner qualifying reviewer exists"));
  assert.ok(steady.errors.includes("trusted workflow state drifted"));
  assert.ok(steady.errors.includes("trusted check external_id lacks the protected-main provenance prefix"));
});

test("primitive and object enforce_admins true are accepted, while false and missing values fail", () => {
  const primitive = mutateEnvelope((endpoints) => { endpoints.branch_protection.response.body.enforce_admins = true; });
  assert.deepEqual(validate(primitive).errors, []);
  for (const value of [false, { enabled: false }, null]) {
    const result = validate(mutateEnvelope((endpoints) => { endpoints.branch_protection.response.body.enforce_admins = value; }));
    assert.ok(result.errors.includes("administrator enforcement drifted"));
  }
});

test("missing, malformed, and nonempty bypass_pull_request_allowances fail closed", () => {
  const cases = [
    (body) => { delete body.bypass_pull_request_allowances; },
    (body) => { body.bypass_pull_request_allowances = { users: [], teams: [] }; },
    (body) => { body.bypass_pull_request_allowances.users = [{ login: "owner" }]; },
    (body) => { body.bypass_pull_request_allowances.teams = [{ slug: "admins" }]; },
    (body) => { body.bypass_pull_request_allowances.apps = [{ slug: "release-bot" }]; },
  ];
  for (const alter of cases) {
    const result = validate(mutateEnvelope((endpoints) => alter(endpoints.pull_request_review_protection.response.body)));
    assert.ok(result.errors.some((error) => error.includes("bypass_pull_request_allowances")));
  }
});

test("context-only and wrong-app required checks are rejected", () => {
  const contextOnly = mutateEnvelope((endpoints) => {
    endpoints.branch_protection.response.body.required_status_checks = { strict: true, contexts: ["node24"] };
  });
  const wrongApp = mutateEnvelope((endpoints) => {
    endpoints.branch_protection.response.body.required_status_checks.checks[0].app_id = -1;
  });
  for (const envelope of [contextOnly, wrongApp]) {
    assert.ok(validate(envelope).errors.includes("app-bound required checks drifted"));
  }
});

test("every destructive branch-control drift is rejected", () => {
  const cases = [
    ["required_linear_history", { enabled: false }, "linear history drifted"],
    ["allow_force_pushes", { enabled: true }, "force-push policy drifted"],
    ["allow_deletions", { enabled: true }, "branch-deletion policy drifted"],
    ["required_conversation_resolution", { enabled: false }, "conversation resolution drifted"],
    ["lock_branch", { enabled: true }, "lock_branch drifted"],
    ["allow_fork_syncing", { enabled: true }, "allow_fork_syncing drifted"],
  ];
  for (const [field, value, expected] of cases) {
    const result = validate(mutateEnvelope((endpoints) => { endpoints.branch_protection.response.body[field] = value; }));
    assert.ok(result.errors.includes(expected));
  }
});

function validMergeInput() {
  return {
    expected_base_sha: BASE,
    pull_request: {
      head: { sha: HEAD }, base: { sha: BASE }, draft: false, mergeable: true, mergeable_state: "clean",
      user: { login: "author" },
    },
    protection: {
      enforce_admins: { enabled: true },
      required_conversation_resolution: { enabled: true },
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_last_push_approval: true,
        bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
      },
    },
    required_check: { context: "node24", app_id: 15368 },
    check_runs: [{
      name: "node24", head_sha: HEAD, status: "completed", conclusion: "success",
      app: { id: 15368, slug: "github-actions" },
    }],
    latest_push: { user: { login: "pusher" }, pushed_at: "2026-08-19T00:01:00.000Z" },
    reviews: [{
      state: "APPROVED", commit_id: HEAD, user: { login: "reviewer" }, submitted_at: "2026-08-19T00:02:00.000Z",
    }],
    eligible_reviewer_logins: ["reviewer"],
    unresolved_conversation_count: 0,
  };
}

function alterMergeInput(fn) {
  const input = structuredClone(validMergeInput());
  fn(input);
  return mergePath.evaluateNormalMergePath(input);
}

test("a legitimate independently reviewed exact-head PR is merge-eligible without bypass", () => {
  const result = mergePath.evaluateNormalMergePath(validMergeInput());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.qualifying_approval.user.login, "reviewer");
});

test("self-review, latest-pusher review, stale-head review, and pre-push review all fail", () => {
  const cases = [
    (input) => { input.reviews[0].user.login = "author"; input.eligible_reviewer_logins = ["author"]; },
    (input) => { input.reviews[0].user.login = "pusher"; input.eligible_reviewer_logins = ["pusher"]; },
    (input) => { input.reviews[0].commit_id = "c".repeat(40); },
    (input) => { input.reviews[0].submitted_at = "2026-08-19T00:00:30.000Z"; },
  ];
  for (const alter of cases) {
    const result = alterMergeInput(alter);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("qualifying independent current-head post-push approval is absent"));
  }
});

test("normal path fails if bypass is absent, malformed, or nonempty", () => {
  const cases = [
    (input) => { delete input.protection.required_pull_request_reviews.bypass_pull_request_allowances; },
    (input) => { input.protection.required_pull_request_reviews.bypass_pull_request_allowances = { users: [], teams: [] }; },
    (input) => { input.protection.required_pull_request_reviews.bypass_pull_request_allowances.apps.push({ slug: "bot" }); },
  ];
  for (const alter of cases) {
    const result = alterMergeInput(alter);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("bypass")));
  }
});

test("wrong check head, app, status, or conclusion cannot authorize merge", () => {
  const cases = [
    (input) => { input.check_runs[0].head_sha = "c".repeat(40); },
    (input) => { input.check_runs[0].app.id = -1; },
    (input) => { input.check_runs[0].status = "in_progress"; },
    (input) => { input.check_runs[0].conclusion = "failure"; },
  ];
  for (const alter of cases) {
    const result = alterMergeInput(alter);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("required exact-head app-bound check is absent"));
  }
});

test("drafts, stale bases, unresolved conversations, and disabled native gates cannot pass", () => {
  const cases = [
    (input) => { input.pull_request.draft = true; },
    (input) => { input.pull_request.base.sha = "c".repeat(40); },
    (input) => { input.unresolved_conversation_count = 1; },
    (input) => { input.protection.enforce_admins.enabled = false; },
    (input) => { input.protection.required_conversation_resolution.enabled = false; },
    (input) => { input.protection.required_pull_request_reviews.dismiss_stale_reviews = false; },
    (input) => { input.protection.required_pull_request_reviews.require_last_push_approval = false; },
  ];
  for (const alter of cases) assert.equal(alterMergeInput(alter).ok, false);
});
