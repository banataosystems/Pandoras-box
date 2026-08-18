const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const policy = require(path.join(ROOT, ".github/governance/main-policy.json"));
let provider;

test.before(async () => {
  provider = await import(pathToFileURL(path.join(ROOT, "scripts/check-github-governance-provider.mjs")));
});

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

function goodEnvelope(observedAt = "2026-08-19T00:00:00.000Z") {
  const headSha = "b".repeat(40);
  const endpointUrls = urls(headSha);
  const endpoint = (name, body) => ({
    request: { method: "GET", url: endpointUrls[name] },
    response: { status: 200, body },
  });
  return provider.buildCaptureEnvelope({
    observed_at: observedAt,
    api_version: "2026-03-10",
    repository: "banataosystems/Pandoras-box",
    head_sha: headSha,
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
      branch: endpoint("branch", { name: "main", commit: { sha: headSha }, protected: true }),
      branch_protection: endpoint("branch_protection", {
        required_status_checks: {
          strict: true,
          checks: [{ context: "Trusted protected-main exact-head gate", app_id: 15368 }],
        },
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
        { login: "reviewer", role_name: "write", permissions: { push: true } },
      ]),
      candidate_workflow: endpoint("candidate_workflow", {
        id: 10,
        name: "Protected main governance candidate",
        path: ".github/workflows/protected-main-governance-candidate.yml",
        state: "active",
      }),
      trusted_workflow: endpoint("trusted_workflow", {
        id: 20,
        name: "Trusted protected main governance",
        path: ".github/workflows/protected-main-governance.yml",
        state: "active",
      }),
      check_runs: endpoint("check_runs", {
        check_runs: [{
          id: 30,
          name: "Trusted protected-main exact-head gate",
          head_sha: headSha,
          status: "completed",
          conclusion: "success",
          app: { id: 15368, slug: "github-actions" },
          external_id: `protected-main:1:${headSha}`,
          details_url: "https://github.com/banataosystems/Pandoras-box/actions/runs/30",
        }],
      }),
    },
  });
}


function validationOptions(nowMs = Date.parse("2026-08-19T00:00:00.000Z")) {
  return {
    nowMs,
    reviewerRegistry: {
      application_gate: "open",
      provider_verified_at: "2026-08-18T23:55:00.000Z",
      reviewers: [{ login: "reviewer", roles: ["governance"], provider_verified: true }],
    },
  };
}

function openPolicy() {
  const clone = structuredClone(policy);
  clone.bootstrap.provider_application_allowed = true;
  return clone;
}

function mutate(envelope, fn) {
  const clone = structuredClone(envelope);
  fn(clone.payload.endpoints);
  return provider.buildCaptureEnvelope(clone.payload);
}

test("module is import-safe and exports raw capture operations", () => {
  assert.equal(typeof provider.normalizeProviderCapture, "function");
  assert.equal(typeof provider.validateProviderCapture, "function");
  assert.equal(typeof provider.fetchProviderCapture, "function");
});

test("real GitHub enabled wrappers normalize and validate", () => {
  const result = provider.validateProviderCapture(goodEnvelope(), openPolicy(), validationOptions());
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.protection.enforce_admins, true);
  assert.equal(result.normalized.protection.required_linear_history, true);
  assert.equal(result.normalized.protection.allow_force_pushes, false);
  assert.equal(result.normalized.main.sha, "b".repeat(40));
  assert.equal(result.normalized.check_runs.trusted.head_sha, result.normalized.requested_head_sha);
});

test("test-PR check head is independent from current main SHA", () => {
  const envelope = mutate(goodEnvelope(), (endpoints) => {
    endpoints.branch.response.body.commit.sha = "a".repeat(40);
  });
  const result = provider.validateProviderCapture(envelope, openPolicy(), validationOptions());
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.main.sha, "a".repeat(40));
  assert.equal(result.normalized.requested_head_sha, "b".repeat(40));
});

test("current bootstrap policy refuses an otherwise correct provider state", () => {
  const result = provider.validateProviderCapture(goodEnvelope(), policy, validationOptions());
  assert.ok(result.errors.includes("source policy blocks provider application during bootstrap"));
});

test("absent and nonempty bypass allowances both fail closed", () => {
  for (const envelope of [
    mutate(goodEnvelope(), (endpoints) => {
      delete endpoints.pull_request_review_protection.response.body.bypass_pull_request_allowances;
    }),
    mutate(goodEnvelope(), (endpoints) => {
      endpoints.pull_request_review_protection.response.body.bypass_pull_request_allowances.apps = [{ slug: "bypass" }];
    }),
  ]) {
    const result = provider.validateProviderCapture(envelope, openPolicy(), {
      nowMs: Date.parse("2026-08-19T00:00:00.000Z"),
    });
    assert.ok(result.errors.length > 0);
  }
});

test("personal repositories allow provider-unsupported dismissal restrictions to be absent, but never nonempty", () => {
  const absent = provider.validateProviderCapture(goodEnvelope(), openPolicy(), validationOptions());
  assert.deepEqual(absent.errors, []);

  const nonempty = mutate(goodEnvelope(), (endpoints) => {
    endpoints.pull_request_review_protection.response.body.dismissal_restrictions = {
      users: [{ login: "banataosystems" }], teams: [], apps: [],
    };
  });
  assert.ok(provider.validateProviderCapture(nonempty, openPolicy(), validationOptions()).errors.some((error) => error.includes("dismissal")));
});

test("organization capability requires dismissal restrictions to be explicitly present", () => {
  const orgPolicy = openPolicy();
  orgPolicy.repository.owner_type = "Organization";
  orgPolicy.main_branch.personal_repository_capabilities.dismissal_restrictions_supported = true;
  orgPolicy.main_branch.personal_repository_capabilities.push_restrictions_supported = true;
  const envelope = mutate(goodEnvelope(), (endpoints) => {
    endpoints.repository.response.body.owner.type = "Organization";
    endpoints.branch_protection.response.body.restrictions = { users: [], teams: [], apps: [] };
  });
  const result = provider.validateProviderCapture(envelope, orgPolicy, validationOptions());
  assert.ok(result.errors.includes("dismissal_restrictions is absent"));
});

test("context-only or wrong-app required checks are rejected", () => {
  const contextsOnly = mutate(goodEnvelope(), (endpoints) => {
    endpoints.branch_protection.response.body.required_status_checks = {
      strict: true,
      contexts: ["Trusted protected-main exact-head gate"],
    };
  });
  const wrongApp = mutate(goodEnvelope(), (endpoints) => {
    endpoints.branch_protection.response.body.required_status_checks.checks[0].app_id = -1;
  });
  for (const envelope of [contextsOnly, wrongApp]) {
    assert.ok(provider.validateProviderCapture(envelope, openPolicy(), {
      nowMs: Date.parse("2026-08-19T00:00:00.000Z"),
    }).errors.some((error) => error.includes("required checks")));
  }
});

test("raw payload tampering and endpoint substitution are rejected before normalization", () => {
  const tampered = goodEnvelope();
  tampered.payload.endpoints.branch.response.body.protected = false;
  assert.ok(provider.validateCaptureIntegrity(tampered).includes("raw provider capture integrity mismatch"));

  const wrongUrl = mutate(goodEnvelope(), (endpoints) => {
    endpoints.branch.request.url += "?forged=true";
  });
  assert.ok(provider.validateProviderCapture(wrongUrl, openPolicy(), validationOptions()).errors.includes("raw endpoint URL drifted: branch"));
});

test("manual normalized documents are not accepted as raw provider captures", () => {
  const normalized = provider.normalizeProviderCapture(goodEnvelope(), openPolicy());
  const result = provider.validateProviderCapture(normalized, openPolicy());
  assert.ok(result.errors.some((error) => error.includes("capture")));
});

test("stale captures, active rulesets, and missing reviewer capacity fail", () => {
  const cases = [
    goodEnvelope("2026-08-18T20:00:00.000Z"),
    mutate(goodEnvelope(), (endpoints) => {
      endpoints.rulesets.response.body = [{ id: 1, name: "conflict", enforcement: "active" }];
    }),
    mutate(goodEnvelope(), (endpoints) => {
      endpoints.collaborators.response.body = [endpoints.collaborators.response.body[0]];
    }),
  ];
  for (const envelope of cases) {
    assert.ok(provider.validateProviderCapture(envelope, openPolicy(), {
      nowMs: Date.parse("2026-08-19T00:00:00.000Z"),
    }).errors.length > 0);
  }
});
test("reviewer registry must be open and match a qualifying non-owner collaborator", () => {
  const closed = validationOptions();
  closed.reviewerRegistry.application_gate = "blocked";
  assert.ok(provider.validateProviderCapture(goodEnvelope(), openPolicy(), closed).errors.includes(
    "reviewer registry application gate is not open",
  ));

  const mismatch = validationOptions();
  mismatch.reviewerRegistry.reviewers[0].login = "not-a-collaborator";
  assert.ok(provider.validateProviderCapture(goodEnvelope(), openPolicy(), mismatch).errors.includes(
    "registered reviewer lacks provider-verified qualifying access: not-a-collaborator",
  ));
});

