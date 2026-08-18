const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const policy = require(path.join(ROOT, ".github/governance/main-policy.json"));
let evaluator;

test.before(async () => {
  evaluator = await import(pathToFileURL(path.join(ROOT, "scripts/evaluate-protected-main.mjs")));
});

const HEAD = "c".repeat(40);

function registry(open = true) {
  return {
    application_gate: open ? "open" : "blocked",
    reviewers: [{
      login: "governance-reviewer",
      roles: ["governance"],
      provider_verified: true,
    }],
  };
}

function fixture(overrides = {}) {
  const pullRequest = {
    number: 57,
    user: { login: "author" },
    base: { ref: "main", repo: { full_name: "banataosystems/Pandoras-box" } },
    head: { sha: HEAD, repo: { full_name: "banataosystems/Pandoras-box" } },
  };
  const candidateWorkflow = {
    id: 10,
    path: ".github/workflows/protected-main-governance-candidate.yml",
    state: "active",
  };
  const candidateWorkflowRun = {
    id: 123,
    workflow_id: 10,
    head_sha: HEAD,
    event: "pull_request",
    status: "completed",
    conclusion: "success",
  };
  const checkRuns = [{
    id: 30,
    name: "Governance candidate exact-head proof",
    head_sha: HEAD,
    status: "completed",
    conclusion: "success",
    app: { id: 15368, slug: "github-actions" },
    details_url: "https://github.com/banataosystems/Pandoras-box/actions/runs/123",
  }];
  return {
    policy,
    reviewerRegistry: registry(),
    pullRequest,
    changedFiles: [{ filename: "src/safe.js" }],
    reviews: [],
    checkRuns,
    candidateWorkflow,
    candidateWorkflowRun,
    ...overrides,
  };
}

test("module is import-safe", () => {
  assert.equal(typeof evaluator.evaluateTrustedGate, "function");
});

test("normal source passes trusted metadata evaluation when exact-head candidate proof is valid", () => {
  const result = evaluator.evaluateTrustedGate(fixture());
  assert.equal(result.state, "success");
  assert.deepEqual(result.errors, []);
});

test("governance-critical source requires a registered exact-head non-author approval", () => {
  const approved = fixture({
    changedFiles: [{ filename: ".github/governance/main-policy.json" }],
    reviews: [{
      state: "APPROVED",
      commit_id: HEAD,
      submitted_at: "2026-08-19T00:00:00Z",
      user: { login: "governance-reviewer" },
    }],
  });
  assert.equal(evaluator.evaluateTrustedGate(approved).state, "success");

  const missing = fixture({
    changedFiles: [{ filename: ".github/governance/main-policy.json" }],
  });
  assert.equal(evaluator.evaluateTrustedGate(missing).state, "failure");
});

test("self, stale-head, unregistered, and superseded approvals fail", () => {
  const base = {
    changedFiles: [{ filename: "scripts/evaluate-protected-main.mjs" }],
  };
  const cases = [
    [{ state: "APPROVED", commit_id: HEAD, submitted_at: "2026-08-19T00:00:00Z", user: { login: "author" } }],
    [{ state: "APPROVED", commit_id: "d".repeat(40), submitted_at: "2026-08-19T00:00:00Z", user: { login: "governance-reviewer" } }],
    [{ state: "APPROVED", commit_id: HEAD, submitted_at: "2026-08-19T00:00:00Z", user: { login: "unknown" } }],
    [
      { state: "APPROVED", commit_id: HEAD, submitted_at: "2026-08-19T00:00:00Z", user: { login: "governance-reviewer" } },
      { state: "CHANGES_REQUESTED", commit_id: HEAD, submitted_at: "2026-08-19T00:01:00Z", user: { login: "governance-reviewer" } },
    ],
  ];
  for (const reviews of cases) {
    const result = evaluator.evaluateTrustedGate(fixture({ ...base, reviews }));
    assert.equal(result.state, "failure");
  }
});

test("closed reviewer registry fails governance changes even with an approval", () => {
  const result = evaluator.evaluateTrustedGate(fixture({
    reviewerRegistry: registry(false),
    changedFiles: [{ filename: ".github/branch-protection/main.json" }],
    reviews: [{
      state: "APPROVED",
      commit_id: HEAD,
      submitted_at: "2026-08-19T00:00:00Z",
      user: { login: "governance-reviewer" },
    }],
  }));
  assert.equal(result.state, "failure");
  assert.ok(result.errors.includes("governance reviewer registry is not open"));
});

test("candidate proof is bound to app, exact head, workflow identity, run id, and pull_request event", () => {
  const failureMutations = [
    (input) => { input.checkRuns[0].app.id = 1; },
    (input) => { input.checkRuns[0].details_url = "https://github.com/banataosystems/Pandoras-box/actions/runs/999"; },
    (input) => { input.candidateWorkflowRun.workflow_id = 11; },
    (input) => { input.candidateWorkflowRun.head_sha = "f".repeat(40); },
    (input) => { input.candidateWorkflowRun.event = "push"; },
  ];
  for (const mutate of failureMutations) {
    const input = fixture();
    mutate(input);
    assert.equal(evaluator.evaluateTrustedGate(input).state, "failure");
  }

  const oldHeadOnly = fixture();
  oldHeadOnly.checkRuns[0].head_sha = "e".repeat(40);
  assert.equal(evaluator.evaluateTrustedGate(oldHeadOnly).state, "pending");
});

test("missing or in-progress candidate proof remains pending rather than succeeding", () => {
  const missing = fixture({ checkRuns: [], candidateWorkflowRun: null });
  assert.equal(evaluator.evaluateTrustedGate(missing).state, "pending");

  const inProgress = fixture();
  inProgress.checkRuns[0].status = "in_progress";
  inProgress.checkRuns[0].conclusion = null;
  inProgress.candidateWorkflowRun.status = "in_progress";
  inProgress.candidateWorkflowRun.conclusion = null;
  assert.equal(evaluator.evaluateTrustedGate(inProgress).state, "pending");
});

test("fork source and wrong base fail closed", () => {
  const fork = fixture();
  fork.pullRequest.head.repo.full_name = "attacker/fork";
  assert.equal(evaluator.evaluateTrustedGate(fork).state, "failure");

  const wrongBase = fixture();
  wrongBase.pullRequest.base.ref = "release";
  assert.equal(evaluator.evaluateTrustedGate(wrongBase).state, "failure");
});
