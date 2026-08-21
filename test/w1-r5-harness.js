"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "..");

function compileHistorical(relativePath, mappings = {}) {
  const filename = path.join(__dirname, "fixtures", "w1-r5-old-85327", relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const fixture = new Module(filename, module);
  fixture.filename = filename;
  fixture.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = fixture.require.bind(fixture);
  fixture.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(mappings, request)) {
      const mapped = mappings[request];
      return typeof mapped === "function" ? mapped() : mapped;
    }
    return originalRequire(request);
  };
  fixture._compile(source, filename);
  return fixture.exports;
}

function current(relativePath) {
  return require(path.join(ROOT, "dist", relativePath));
}

let currentImplementation;
function loadCurrentImplementation() {
  if (!currentImplementation) {
    currentImplementation = Object.freeze({
      ...current("http-app.js"),
      ...current("projectos-mcp-handler.js"),
      ...current("tools/memory-evidence-intake.js"),
      historical: false,
    });
  }
  return currentImplementation;
}

let historicalImplementation;
function loadHistoricalImplementation() {
  if (historicalImplementation) return historicalImplementation;
  const historicalHttp = compileHistorical("src/http-app.js", {
    "./tools/index.js": () => current("tools/index.js"),
    "./runtime/service-config.js": () => current("runtime/service-config.js"),
    "./runtime/tool-policy.js": () => current("runtime/tool-policy.js"),
    "./runtime/runtime-security-resolver.js": () => current("runtime/runtime-security-resolver.js"),
    "./runtime/execution-ledger-client.js": () => current("runtime/execution-ledger-client.js"),
    "./runtime/runtime-rate-limit-client.js": () => current("runtime/runtime-rate-limit-client.js"),
  });
  const historicalStateMachine = compileHistorical(
    "src/runtime/provider-execution-state-machine.js",
    { "../http-app.js": historicalHttp },
  );
  const historicalMcp = compileHistorical("src/projectos-mcp-handler.js", {
    "./projectos-mcp-handler-core.js": () => current("projectos-mcp-handler-core.js"),
    "./runtime/execution-ledger-client.js": () => current("runtime/execution-ledger-client.js"),
    "./runtime/provider-execution-state-machine.js": historicalStateMachine,
    "./tools/index.js": () => current("tools/index.js"),
  });
  const historicalMemory = compileHistorical("src/tools/memory-evidence-intake.js", {
    "./memory-evidence-intake-core.js": () => current("tools/memory-evidence-intake-core.js"),
  });
  historicalImplementation = Object.freeze({
    ...historicalHttp,
    ...historicalMcp,
    ...historicalMemory,
    historical: true,
  });
  return historicalImplementation;
}

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
  grantedScopes: ["memory:read", "memory:evidence-candidate:submit"],
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

function mcpRequest(planId = PLAN_ID) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
    body: {
      jsonrpc: "2.0",
      id: 91,
      method: "tools/call",
      params: { name: "projectos_execute_plan", arguments: { planId } },
    },
  };
}

function createLedger(args, options = {}, implementation = loadCurrentImplementation()) {
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
        payloadHash: implementation.executionPayloadHash(TOOL, args),
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

async function invokeMcpWith(
  implementation,
  { args = evidenceArgs(), execute, scopes, ledgerOptions } = {},
) {
  const ledger = createLedger(args, ledgerOptions, implementation);
  const handler = implementation.createProjectOsMcpHandler(mcpDependencies(
    ledger,
    execute || (async () => ({ ok: true })),
    scopes,
  ));
  const request = mcpRequest(ledgerOptions?.planId || PLAN_ID);
  const response = responseRecorder();
  await handler(request, response);
  return { handler, ledger, request, response };
}

function invokeMcp(options) {
  return invokeMcpWith(loadCurrentImplementation(), options);
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

async function invokeHttpWith(
  implementation,
  {
    args = evidenceArgs(),
    execute,
    ledgerOptions,
    authorization = `Bearer ${ADMIN_TOKEN}`,
    path: requestPath = "/tools/execute",
  } = {},
) {
  const ledger = createLedger(args, ledgerOptions, implementation);
  let providerCalls = 0;
  const app = implementation.createHttpApp(
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
      return execute ? execute(tool, receivedArgs, context) : { ok: true };
    },
  );
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}${requestPath}`, {
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

function invokeHttp(options) {
  return invokeHttpWith(loadCurrentImplementation(), options);
}

function parseHttpProviderFailure(result) {
  const message = result.body?.error?.message;
  assert.equal(typeof message, "string");
  return JSON.parse(message);
}

function assertReconciliationSummary(summary, expectedOutcome, expectedRetryable = false) {
  assert.equal(summary.type, "provider_execution_reconciliation");
  assert.equal(summary.providerOutcome, expectedOutcome);
  assert.equal(summary.reconciliationRequired, true);
  assert.equal(summary.retryable, expectedRetryable);
  assert.equal(summary.automaticRetryAllowed, false);
  assert.match(summary.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(summary.evidencePolicy, "privacy_safe_summary_only_v1");
}

module.exports = {
  ADMIN_TOKEN,
  PLAN_ID,
  PLAN_ID_TWO,
  TOOL,
  assertReconciliationSummary,
  createLedger,
  evidenceArgs,
  invokeHttp,
  invokeHttpWith,
  invokeMcp,
  invokeMcpWith,
  loadCurrentImplementation,
  loadHistoricalImplementation,
  memoryConfig,
  parseHttpProviderFailure,
  parseMcpFailure,
  pendingReviewResponse,
};
