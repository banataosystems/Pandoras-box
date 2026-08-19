"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createHttpApp, executionPayloadHash } = require("../dist/http-app.js");
const { createProjectOsMcpHandler } = require("../dist/projectos-mcp-handler.js");
const {
  submitEvidenceCandidate,
} = require("../dist/tools/memory-evidence-intake.js");

const ADMIN_TOKEN = "worker-one-http-admin-token-material-long-enough";
const ACCESS_TOKEN = "worker-one-mcp-access-token-material-long-enough";
const OIDC_TOKEN = "worker-one-server-oidc-token-material-long-enough";
const ORGANIZATION_ID = "2270b266-59da-4c39-bfd9-9f8d08352af0";
const USER_ID = "e5f5744e-554b-4f92-aad2-3f58ae6a33ad";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID_TWO = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const TOOL = "memory.submitEvidenceCandidate";

function evidenceArgs(overrides = {}) {
  const sourceSha = "85327f360976c87b385a93289ea71c7b6ce587d2";
  return {
    namespace: "real_life",
    projectKey: "mcpmaster-pandoras-box",
    title: "Worker 1 W1-R5 contract fixture",
    summary: "Privacy-safe mutation outcome fixture for exact behavioral verification.",
    proofStage: "tested",
    claim: "Provider outcome truth is preserved across all governed entrypoints.",
    evidenceRefs: [{
      type: "github_commit",
      ref: `banataosystems/Pandoras-box@${sourceSha}`,
      observed_at: "2026-08-19T19:30:00+08:00",
    }],
    provenance: {
      source_type: "github_commit",
      source_locator: "banataosystems/Pandoras-box",
      source_sha: sourceSha,
      observed_at: "2026-08-19T19:30:00+08:00",
    },
    idempotencyKey: `worker1-w1-r5:${sourceSha}`,
    ...overrides,
  };
}

const memoryConfig = {
  baseUrl: "https://pandorasbox-memory.vercel.app",
  oidcToken: "test-oidc-token-material-long-enough-for-contract-tests",
  allowedNamespaces: ["real_life"],
  grantedScopes: ["memory:read", "memory:write"],
  allowMutations: true,
  timeoutMs: 1000,
  maxResponseBytes: 100000,
};

function pendingReviewResponse(args, deduplicated = false) {
  return {
    ok: true,
    candidate_id: "44444444-4444-4444-8444-444444444444",
    review_item_id: "55555555-5555-4555-8555-555555555555",
    status: "pending_review",
    deduplicated,
    idempotency_key: args.idempotencyKey,
    namespace: args.namespace,
    project_id: "66666666-6666-4666-8666-666666666666",
    project_key: args.projectKey,
    proof_stage: args.proofStage,
    privacy_scan_version: "evidence_privacy_v2",
    created_at: "2026-08-19T11:30:00.000Z",
  };
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    writableEnded: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) {
      this.body = value;
      this.ended = true;
      this.writableEnded = true;
      return this;
    },
    end() {
      this.ended = true;
      this.writableEnded = true;
      return this;
    },
  };
}

function mcpRequest(planId = PLAN_ID, scopes = ["openid", "projectos:execute"]) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
    body: {
      jsonrpc: "2.0",
      id: 91,
      method: "tools/call",
      params: {
        name: "projectos_execute_plan",
        arguments: { planId },
      },
    },
    fixtureScopes: scopes,
  };
}

function createLedger(args, options = {}) {
  const planId = options.planId || PLAN_ID;
  let claimed = false;
  let status = "approved";
  const finishInputs = [];
  return {
    finishInputs,
    get status() { return status; },
    get claimCount() { return claimed ? 1 : 0; },
    async claimPlan(_token, requestedPlanId) {
      assert.equal(requestedPlanId, planId);
      if (claimed) throw Object.assign(new Error("Plan is no longer claimable"), { status: 409 });
      claimed = true;
      status = "executing";
      return {
        planId,
        requestId: REQUEST_ID,
        tool: TOOL,
        risk: "write",
        args,
        payloadHash: executionPayloadHash(TOOL, args),
        status,
      };
    },
    async finishPlan(_token, input) {
      finishInputs.push(structuredClone(input));
      if (options.failCompleted && input.status === "completed") {
        throw new Error("private durable completion transport detail");
      }
      status = input.status;
      return { planId, requestId: REQUEST_ID, status };
    },
  };
}

function mcpDependencies(ledger, execute, scopes = ["openid", "projectos:execute"]) {
  return {
    organizationId: ORGANIZATION_ID,
    authenticator: {
      async authenticate() {
        return {
          userId: USER_ID,
          accessToken: ACCESS_TOKEN,
          scopes,
          scopeClaimsPresent: true,
          aal: "aal1",
        };
      },
    },
    membershipResolver: {
      async resolve() {
        return { organizationId: ORGANIZATION_ID, userId: USER_ID, role: "owner" };
      },
    },
    workloadToken: () => OIDC_TOKEN,
    toolConfiguration: () => ({ fixture: true }),
    ledger,
    execute,
  };
}

async function invokeMcp({ args = evidenceArgs(), execute, scopes, ledgerOptions } = {}) {
  const ledger = createLedger(args, ledgerOptions);
  const handler = createProjectOsMcpHandler(mcpDependencies(
    ledger,
    execute || (async () => ({ ok: true })),
    scopes,
  ));
  const request = mcpRequest(ledgerOptions?.planId || PLAN_ID, scopes);
  const response = responseRecorder();
  await handler(request, response);
  return { handler, ledger, request, response };
}

function parseMcpFailure(response) {
  assert.ok(response.statusCode >= 400, `expected MCP failure, received ${response.statusCode}`);
  assert.equal(typeof response.body?.error?.message, "string");
  return JSON.parse(response.body.error.message);
}

function runtimeConfig() {
  return {
    port: 3000,
    adminToken: ADMIN_TOKEN,
    approvalToken: "worker-one-http-approval-token-material-long-enough",
    allowedOrigins: "https://mcpmaster.vercel.app",
    rateLimitRequests: 1000,
    rateLimitWindowMs: 60_000,
  };
}

async function invokeHttp({
  args = evidenceArgs(),
  execute,
  ledgerOptions,
  authorization = `Bearer ${ADMIN_TOKEN}`,
  path = "/tools/execute",
} = {}) {
  const ledger = createLedger(args, ledgerOptions);
  let providerCalls = 0;
  const app = createHttpApp(
    runtimeConfig(),
    { async resolve() { return {}; } },
    ledger,
    {
      async consume() {
        return {
          allowed: true,
          limit: 1000,
          remaining: 999,
          count: 1,
          resetAt: new Date(Date.now() + 60_000).toISOString(),
          windowSeconds: 60,
        };
      },
    },
    async () => [],
    async (tool, receivedArgs, context) => {
      providerCalls += 1;
      return execute
        ? execute(tool, receivedArgs, context)
        : { ok: true };
    },
  );
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json",
        "x-vercel-oidc-token": OIDC_TOKEN,
      },
      body: JSON.stringify({ planId: ledgerOptions?.planId || PLAN_ID }),
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    return { body, ledger, providerCalls, response };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function parseHttpProviderFailure(result) {
  const message = result.body?.error?.message;
  assert.equal(typeof message, "string");
  return JSON.parse(message);
}

function assertReconciliationSummary(summary, expectedOutcome) {
  assert.equal(summary.type, "provider_execution_reconciliation");
  assert.equal(summary.providerOutcome, expectedOutcome);
  assert.equal(summary.reconciliationRequired, true);
  assert.equal(summary.retryable, false);
  assert.match(summary.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(summary.evidencePolicy, "privacy_safe_summary_only_v2");
}

test("W1-R5 write-then-409 is ambiguous, never pre-side-effect failure", async () => {
  const args = evidenceArgs();
  let sideEffects = 0;
  await assert.rejects(
    () => submitEvidenceCandidate(args, memoryConfig, async () => {
      sideEffects += 1;
      return new Response(JSON.stringify({ ok: false, error: "idempotency_conflict" }), {
        status: 409,
      });
    }),
    (error) => {
      assert.equal(error.providerOutcome, "ambiguous");
      assert.notEqual(error.providerOutcome, "failed_before_side_effects");
      return true;
    },
  );
  assert.equal(sideEffects, 1);
});

test("W1-R5 proven Memory validation rejection remains pre-side-effect", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "evidence_candidate_invalid" }), {
        status: 400,
      })),
    (error) => {
      assert.equal(error.providerOutcome, "failed_before_side_effects");
      return true;
    },
  );
});

test("W1-R5 MCP outer-envelope overflow preserves confirmed provider success", async () => {
  const nearBoundaryResult = {
    left: "x".repeat(262100),
    right: "y".repeat(262100),
  };
  let providerCalls = 0;
  const { ledger, response } = await invokeMcp({
    execute: async () => {
      providerCalls += 1;
      return nearBoundaryResult;
    },
  });
  assert.equal(providerCalls, 1);
  const failure = parseMcpFailure(response);
  assert.equal(failure.providerOutcome, "succeeded");
  assert.equal(failure.mutationState, "PROVIDER_SUCCEEDED_LOCAL_FINALIZATION_FAILED");
  assert.equal(failure.retryable, false);
  assert.equal(failure.reconciliationRequired, true);
  assert.equal(ledger.finishInputs.length, 1);
  assert.equal(ledger.finishInputs[0].status, "completed");
  assertReconciliationSummary(ledger.finishInputs[0].resultSummary, "succeeded");
});

test("W1-R5 MCP generic 409 after dispatch is ambiguous and reconciled", async () => {
  let sideEffects = 0;
  const { ledger, response } = await invokeMcp({
    execute: async () => {
      sideEffects += 1;
      throw Object.assign(new Error("private conflict detail after write"), {
        status: 409,
        code: "provider_conflict",
      });
    },
  });
  assert.equal(sideEffects, 1);
  const failure = parseMcpFailure(response);
  assert.equal(failure.providerOutcome, "ambiguous");
  assert.equal(failure.retryable, false);
  assert.doesNotMatch(response.body.error.message, /private conflict detail/);
  assert.equal(ledger.finishInputs.length, 1);
  assert.equal(ledger.finishInputs[0].status, "completed");
  assertReconciliationSummary(ledger.finishInputs[0].resultSummary, "ambiguous");
});

for (const [label, resultFactory] of [
  ["cyclic serialization", () => { const value = { safe: true }; value.self = value; return value; }],
  ["non-plain result validation", () => new Date("2026-08-19T00:00:00.000Z")],
  ["oversize result", () => Array.from({ length: 401 }, (_, index) => ({ index, value: "x".repeat(1200) }))],
]) {
  test(`W1-R5 HTTP provider success plus ${label} completes reconciliation`, async () => {
    const result = await invokeHttp({ execute: async () => resultFactory() });
    assert.equal(result.providerCalls, 1);
    assert.ok(result.response.status >= 400);
    const failure = parseHttpProviderFailure(result);
    assert.equal(failure.providerOutcome, "succeeded");
    assert.equal(failure.retryable, false);
    assert.equal(failure.reconciliationRequired, true);
    assert.equal(result.ledger.finishInputs.length, 1);
    assert.equal(result.ledger.finishInputs[0].status, "completed");
    assertReconciliationSummary(result.ledger.finishInputs[0].resultSummary, "succeeded");
  });
}

test("W1-R5 HTTP durable completion failure does not fall back to failed", async () => {
  const result = await invokeHttp({
    execute: async () => ({ ok: true, receipt: "bounded" }),
    ledgerOptions: { failCompleted: true },
  });
  assert.equal(result.providerCalls, 1);
  assert.ok(result.response.status >= 400);
  assert.equal(result.ledger.finishInputs.some((input) => input.status === "failed"), false);
  assert.ok(result.ledger.finishInputs.length >= 1);
  const failure = parseHttpProviderFailure(result);
  assert.equal(failure.providerOutcome, "succeeded");
  assert.equal(failure.downstreamProcessingOutcome, "durable_completion_unknown");
  assert.equal(failure.retryable, false);
  assert.equal(failure.reconciliationRequired, true);
  assert.doesNotMatch(JSON.stringify(result.body), /private durable completion transport detail/);
});

test("W1-R5 HTTP generic 409 after write is ambiguous and not durably failed", async () => {
  let sideEffects = 0;
  const result = await invokeHttp({
    execute: async () => {
      sideEffects += 1;
      throw Object.assign(new Error("private HTTP conflict after write"), {
        status: 409,
        code: "provider_conflict",
      });
    },
  });
  assert.equal(sideEffects, 1);
  const failure = parseHttpProviderFailure(result);
  assert.equal(failure.providerOutcome, "ambiguous");
  assert.equal(failure.retryable, false);
  assert.doesNotMatch(JSON.stringify(result.body), /private HTTP conflict/);
  assert.equal(result.ledger.finishInputs.length, 1);
  assert.equal(result.ledger.finishInputs[0].status, "completed");
  assertReconciliationSummary(result.ledger.finishInputs[0].resultSummary, "ambiguous");
});

test("W1-R5 HTTP connection-like failure after dispatch is ambiguous and redacted", async () => {
  const secret = "private-provider-socket-detail-after-dispatch";
  const result = await invokeHttp({
    execute: async () => {
      throw new Error(secret);
    },
  });
  const failure = parseHttpProviderFailure(result);
  assert.equal(failure.providerOutcome, "ambiguous");
  assert.equal(failure.retryable, false);
  assert.equal(failure.reconciliationRequired, true);
  assert.doesNotMatch(JSON.stringify(result.body), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(result.ledger.finishInputs), new RegExp(secret));
  assertReconciliationSummary(result.ledger.finishInputs[0].resultSummary, "ambiguous");
});

for (const expected of [
  { status: 408, code: "provider_timeout" },
  { status: 429, code: "provider_rate_limited" },
]) {
  test(`W1-R5 explicit pre-dispatch ${expected.status} remains safely retryable`, async () => {
    const { ledger, response } = await invokeMcp({
      execute: async () => {
        throw Object.assign(new Error("sanitized transient rejection"), {
          status: expected.status,
          code: expected.code,
          providerOutcome: "not_executed",
          retryable: true,
        });
      },
    });
    assert.equal(response.statusCode, expected.status);
    const failure = parseMcpFailure(response);
    assert.equal(failure.providerOutcome, "not_executed");
    assert.equal(failure.retryable, true);
    assert.equal(failure.reconciliationRequired, false);
    assert.equal(ledger.finishInputs[0].status, "failed");
  });
}

test("W1-R5 non-idempotent ambiguity cannot be blindly retried", async () => {
  const args = { namespace: "real_life" };
  const { ledger, response } = await invokeMcp({
    args,
    execute: async () => { throw new Error("unknown after dispatch"); },
  });
  const failure = parseMcpFailure(response);
  assert.equal(failure.providerOutcome, "ambiguous");
  assert.equal(failure.providerIdempotencySupported, false);
  assert.equal(failure.idempotencyIdentityHash, null);
  assert.equal(failure.retryable, false);
  assert.equal(failure.retryContract, "reconcile_before_retry");
  assertReconciliationSummary(ledger.finishInputs[0].resultSummary, "ambiguous");
});

test("W1-R5 confirmed idempotent replay reuses one immutable identity and one side effect", async () => {
  const args = evidenceArgs({ idempotencyKey: "worker1-w1-r5-stable-idempotency" });
  const applied = new Set();
  let sideEffects = 0;
  const execute = async (_tool, receivedArgs) => {
    if (!applied.has(receivedArgs.idempotencyKey)) {
      applied.add(receivedArgs.idempotencyKey);
      sideEffects += 1;
      throw new Error("response lost after idempotent provider acceptance");
    }
    return pendingReviewResponse(receivedArgs, true);
  };

  const first = await invokeMcp({ args, execute });
  const firstFailure = parseMcpFailure(first.response);
  assert.equal(firstFailure.providerOutcome, "ambiguous");
  assert.equal(firstFailure.providerIdempotencySupported, true);
  assert.equal(firstFailure.retryable, false);
  assert.equal(
    firstFailure.retryContract,
    "reconcile_then_same_immutable_provider_identity_only",
  );
  assert.match(firstFailure.idempotencyIdentityHash, /^[a-f0-9]{64}$/);

  const second = await invokeMcp({
    args,
    execute,
    ledgerOptions: { planId: PLAN_ID_TWO },
  });
  assert.equal(second.response.statusCode, 200);
  assert.equal(sideEffects, 1);
  assert.equal(
    first.ledger.finishInputs[0].resultSummary.idempotencyIdentityHash,
    second.ledger.finishInputs[0].resultSummary.idempotencyIdentityHash,
  );
  assert.doesNotMatch(
    JSON.stringify(second.ledger.finishInputs),
    new RegExp(args.idempotencyKey),
  );
});

test("W1-R5 request correlation never becomes provider idempotency", async () => {
  const { response } = await invokeMcp({
    args: { namespace: "real_life", requestId: "correlation-is-not-idempotency" },
    execute: async () => { throw new Error("unknown after dispatch"); },
  });
  const failure = parseMcpFailure(response);
  assert.equal(failure.providerIdempotencySupported, false);
  assert.equal(failure.idempotencyIdentityHash, null);
  assert.equal(failure.retryable, false);
});

test("W1-R5 HTTP authorization fails before claim and provider dispatch", async () => {
  const result = await invokeHttp({ authorization: "Bearer wrong-admin-token-material-long-enough" });
  assert.equal(result.response.status, 401);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.ledger.claimCount, 0);
  assert.equal(result.ledger.finishInputs.length, 0);
});

test("W1-R5 MCP authorization fails before claim and provider dispatch", async () => {
  let providerCalls = 0;
  const { ledger, response } = await invokeMcp({
    scopes: ["openid", "projectos:read"],
    execute: async () => { providerCalls += 1; return { ok: true }; },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(providerCalls, 0);
  assert.equal(ledger.claimCount, 0);
  assert.equal(ledger.finishInputs.length, 0);
});

test("W1-R5 sensitive successful result cannot enter reconciliation evidence", async () => {
  const secret = "super-secret-provider-token-material";
  const value = { secret };
  value.self = value;
  const result = await invokeHttp({ execute: async () => value });
  assert.doesNotMatch(JSON.stringify(result.body), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(result.ledger.finishInputs), new RegExp(secret));
  assert.equal(
    result.ledger.finishInputs[0].resultSummary.evidencePolicy,
    "privacy_safe_summary_only_v2",
  );
});
