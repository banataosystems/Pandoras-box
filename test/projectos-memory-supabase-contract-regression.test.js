"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createProjectOsMcpHandler } = require("../dist/projectos-mcp-handler.js");
const { executionPayloadHash } = require("../dist/http-app.js");
const {
  EvidenceCandidateArgsSchema,
  MemoryEvidenceIdempotencyConflictError,
  MemoryEvidenceSubmissionError,
  submitEvidenceCandidate,
} = require("../src/tools/memory-evidence-intake.js");

const TOKEN = "verified-contract-regression-token-material-long-enough";
const ORGANIZATION_ID = "2270b266-59da-4c39-bfd9-9f8d08352af0";
const USER_ID = "e5f5744e-554b-4f92-aad2-3f58ae6a33ad";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(name, args = {}) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: {
      jsonrpc: "2.0",
      id: 19,
      method: "tools/call",
      params: { name, arguments: args },
    },
  };
}

function handlerDependencies(overrides = {}) {
  return {
    organizationId: ORGANIZATION_ID,
    authenticator: {
      async authenticate() {
        return {
          userId: USER_ID,
          accessToken: TOKEN,
          scopes: ["openid", "email", "profile"],
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
    workloadToken: () => "server-side-vercel-oidc-token",
    toolConfiguration: () => ({ fixture: true }),
    ...overrides,
  };
}

const memoryConfig = {
  baseUrl: "https://pandorasbox-memory.vercel.app",
  oidcToken: "test-oidc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  allowedNamespaces: ["real_life"],
  grantedScopes: ["memory:read", "memory:write"],
  allowMutations: true,
  timeoutMs: 1000,
  maxResponseBytes: 100000,
};

function evidenceArgs(overrides = {}) {
  const sha = "0b6d32b9135e2050c4f819a8d7ac3c78e6bc1117";
  return {
    namespace: "real_life",
    projectKey: "mcpmaster-pandoras-box",
    title: "ProjectOS contract regression evidence",
    summary: "Contract-only regression fixture with no private identifiers or credentials.",
    proofStage: "tested",
    claim: "The fixture proves the governed evidence contract only.",
    evidenceRefs: [{
      type: "github_source",
      ref: `banataosystems/Pandoras-box@${sha}`,
      observed_at: "2026-08-19T05:15:10+08:00",
    }],
    provenance: {
      source_type: "github_source",
      source_locator: "banataosystems/Pandoras-box",
      source_sha: sha,
      observed_at: "2026-08-19T05:15:10+08:00",
    },
    idempotencyKey: `projectos-contract:${sha}`,
    ...overrides,
  };
}

function failureFrom(error) {
  assert.ok(error instanceof MemoryEvidenceSubmissionError);
  const parsed = JSON.parse(error.message);
  assert.deepEqual(parsed, error.failure);
  assert.deepEqual(Object.keys(parsed).sort(), [
    "correlationId",
    "httpStatus",
    "operation",
    "provider",
    "retryable",
    "safeErrorCode",
    "schemaVersion",
    "timestamp",
    "validationCategory",
  ].sort());
  assert.equal(parsed.schemaVersion, "1.0.0");
  assert.equal(parsed.provider, "pandora-memory");
  assert.equal(parsed.operation, "memory.submitEvidenceCandidate");
  assert.match(parsed.correlationId, /^[A-Za-z0-9._:-]{1,128}$/);
  assert.ok(Number.isFinite(Date.parse(parsed.timestamp)));
  return parsed;
}

function pendingReviewResponse(args, overrides = {}) {
  return {
    ok: true,
    candidate_id: "22222222-2222-4222-8222-222222222222",
    status: "pending_review",
    deduplicated: false,
    idempotency_key: args.idempotencyKey,
    namespace: args.namespace,
    project_id: "33333333-3333-4333-8333-333333333333",
    project_key: args.projectKey,
    proof_stage: args.proofStage,
    created_at: "2026-08-19T05:15:10.000Z",
    ...overrides,
  };
}

test("array-valued provider reads are object-normalized for MCP structuredContent", async () => {
  const raw = [
    { id: "account-a", name: "Primary" },
    { id: "account-b", name: "Secondary" },
  ];
  const handler = createProjectOsMcpHandler(handlerDependencies({
    async execute(name) {
      assert.equal(name, "supabase.list-accounts");
      return raw;
    },
  }));
  const response = responseRecorder();
  await handler(request("supabase.list-accounts"), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.result.structuredContent, { items: raw });
  assert.equal(response.body.result.content[0].text, JSON.stringify(raw));
  assert.equal(Array.isArray(response.body.result.structuredContent), false);
});

test("exact-object provider reads remain strict objects", async () => {
  const raw = { id: "ivmvufhcsezyhczzondn", status: "ACTIVE_HEALTHY" };
  const handler = createProjectOsMcpHandler(handlerDependencies({
    async execute(name) {
      assert.equal(name, "supabase.get-project");
      return raw;
    },
  }));
  const response = responseRecorder();
  await handler(request("supabase.get-project", {
    accountId: "battle-realmatch",
    projectRef: "ivmvufhcsezyhczzondn",
  }), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.result.structuredContent, raw);
  assert.equal(response.body.result.content[0].text, JSON.stringify(raw));
});

test("published client translates every candidate field exactly and keeps success pending-review", async () => {
  const args = evidenceArgs();
  let outbound;
  const result = await submitEvidenceCandidate(args, memoryConfig, async (url, init) => {
    outbound = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify(pendingReviewResponse(args)), {
      status: 201,
      headers: { "x-request-id": "memory-contract-success-1" },
    });
  });

  assert.equal(outbound.url, "https://pandorasbox-memory.vercel.app/api/projectos/memory/evidence-candidates");
  assert.equal(outbound.init.method, "POST");
  assert.match(outbound.init.headers["x-request-id"], /^[0-9a-f-]{36}$/i);
  assert.deepEqual(outbound.body, {
    namespace: args.namespace,
    project_id: null,
    project_key: args.projectKey,
    title: args.title,
    summary: args.summary,
    proof_stage: args.proofStage,
    claim: args.claim,
    evidence_refs: args.evidenceRefs,
    provenance: args.provenance,
    idempotency_key: args.idempotencyKey,
  });
  assert.deepEqual(result, {
    ok: true,
    candidateId: "22222222-2222-4222-8222-222222222222",
    status: "pending_review",
    deduplicated: false,
    idempotencyKey: args.idempotencyKey,
    namespace: args.namespace,
    projectId: "33333333-3333-4333-8333-333333333333",
    projectKey: args.projectKey,
    proofStage: args.proofStage,
    createdAt: "2026-08-19T05:15:10.000Z",
    canonicalPromoted: false,
  });
});

test("an identical idempotent replay is reported as deduplicated and does not promote canon", async () => {
  const args = evidenceArgs();
  const result = await submitEvidenceCandidate(args, memoryConfig, async () =>
    new Response(JSON.stringify(pendingReviewResponse(args, { deduplicated: true })), { status: 200 }));
  assert.equal(result.deduplicated, true);
  assert.equal(result.status, "pending_review");
  assert.equal(result.canonicalPromoted, false);
});

test("the production stale-capability 400 is preserved as a structured unsupported-action failure", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "unsupported_action",
        detail: "relation memory_capture_candidates secret=must-not-leak",
      }), {
        status: 400,
        headers: { "x-request-id": "memory-edge-version-13" },
      })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 400);
      assert.equal(failure.httpStatus, 400);
      assert.equal(failure.safeErrorCode, "unsupported_action");
      assert.equal(failure.validationCategory, "capability_contract");
      assert.equal(failure.retryable, false);
      assert.equal(failure.correlationId, "memory-edge-version-13");
      assert.doesNotMatch(error.message, /memory_capture_candidates|must-not-leak|secret=/);
      return true;
    },
  );
});

test("known Memory validation and privacy 4xx codes remain structured but backend detail stays redacted", async () => {
  const cases = [
    ["unexpected_field", "request_validation", 400],
    ["project_identity_invalid", "project_identity", 400],
    ["evidence_candidate_invalid", "candidate_validation", 400],
    ["sensitive_candidate_rejected", "privacy_policy", 400],
    ["namespace_not_allowed", "namespace_authorization", 403],
    ["scope_not_allowed", "scope_authorization", 403],
    ["project_not_allowed", "project_authorization", 403],
  ];
  for (const [code, category, status] of cases) {
    await assert.rejects(
      () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
        new Response(JSON.stringify({
          ok: false,
          error: code,
          reason: "private diagnostic must not be surfaced",
        }), { status })),
      (error) => {
        const failure = failureFrom(error);
        assert.equal(error.status, status);
        assert.equal(failure.httpStatus, status);
        assert.equal(failure.safeErrorCode, code);
        assert.equal(failure.validationCategory, category);
        assert.equal(failure.retryable, false);
        assert.doesNotMatch(error.message, /private diagnostic/);
        return true;
      },
    );
  }
});

test("unknown Memory backend strings remain fully redacted in a fixed structured envelope", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "relation memory_capture_candidates",
        detail: "private diagnostic",
      }), { status: 400 })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 400);
      assert.equal(failure.httpStatus, 400);
      assert.equal(failure.safeErrorCode, "memory_submission_failed");
      assert.equal(failure.validationCategory, "unknown_downstream");
      assert.equal(failure.retryable, false);
      assert.doesNotMatch(error.message, /memory_capture_candidates|private diagnostic/);
      return true;
    },
  );
});

test("conflicting idempotency reuse fails closed with a distinct structured 409", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "idempotency_conflict" }), {
        status: 409,
        headers: { "x-request-id": "memory-idempotency-conflict" },
      })),
    (error) => {
      assert.ok(error instanceof MemoryEvidenceIdempotencyConflictError);
      const failure = failureFrom(error);
      assert.equal(error.status, 409);
      assert.equal(failure.httpStatus, 409);
      assert.equal(failure.safeErrorCode, "idempotency_conflict");
      assert.equal(failure.validationCategory, "idempotency");
      assert.equal(failure.retryable, false);
      return true;
    },
  );
});

test("downstream 5xx stays distinguishable from validation failure and is retryable", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "candidate_insert_failed",
        detail: "database detail must not leak",
      }), { status: 503 })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.httpStatus, 503);
      assert.equal(failure.safeErrorCode, "provider_server_error");
      assert.equal(failure.validationCategory, "provider_server");
      assert.equal(failure.retryable, true);
      assert.doesNotMatch(error.message, /candidate_insert_failed|database detail/);
      return true;
    },
  );
});

test("transport failures are structured, retryable, and contain no thrown transport detail", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () => {
      throw new Error("connect ECONNREFUSED credential=must-not-leak");
    }),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.httpStatus, null);
      assert.equal(failure.safeErrorCode, "provider_transport_error");
      assert.equal(failure.validationCategory, "transport");
      assert.equal(failure.retryable, true);
      assert.doesNotMatch(error.message, /ECONNREFUSED|must-not-leak|credential=/);
      return true;
    },
  );
});

test("invalid provider JSON is classified as a response-contract failure", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response("not-json private-body", { status: 400 })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.httpStatus, 400);
      assert.equal(failure.safeErrorCode, "response_contract_error");
      assert.equal(failure.validationCategory, "response_contract");
      assert.equal(failure.retryable, false);
      assert.doesNotMatch(error.message, /not-json|private-body/);
      return true;
    },
  );
});

test("client-side schema rejects malformed, unbound, and invalid-proof candidates before transport", async () => {
  assert.equal(EvidenceCandidateArgsSchema.safeParse({
    ...evidenceArgs(),
    namespace: "other",
  }).success, false);
  const unbound = evidenceArgs();
  delete unbound.projectKey;
  assert.equal(EvidenceCandidateArgsSchema.safeParse(unbound).success, false);
  assert.equal(EvidenceCandidateArgsSchema.safeParse({
    ...evidenceArgs(),
    proofStage: "complete",
  }).success, false);
});

test("client privacy exclusion rejects sensitive material before transport", async () => {
  let called = false;
  await assert.rejects(
    () => submitEvidenceCandidate({
      ...evidenceArgs(),
      claim: "api_key=must-not-be-submitted",
    }, memoryConfig, async () => {
      called = true;
      throw new Error("unreachable");
    }),
    /Pandora Memory candidate rejected: secret_assignment/,
  );
  assert.equal(called, false);
});

test("ProjectOS caller and hash-linked audit receive the same sanitized structured failure", async () => {
  const args = evidenceArgs();
  let finishInput;
  const ledger = {
    async claimPlan(_token, planId) {
      assert.equal(planId, PLAN_ID);
      return {
        planId,
        requestId: "44444444-4444-4444-8444-444444444444",
        tool: "memory.submitEvidenceCandidate",
        risk: "write",
        args,
        payloadHash: executionPayloadHash("memory.submitEvidenceCandidate", args),
        status: "executing",
      };
    },
    async finishPlan(_token, input) {
      finishInput = input;
      return { planId: input.planId, status: input.status };
    },
  };
  const handler = createProjectOsMcpHandler(handlerDependencies({
    ledger,
    toolConfiguration: () => memoryConfig,
    async execute(name, receivedArgs, config) {
      assert.equal(name, "memory.submitEvidenceCandidate");
      return submitEvidenceCandidate(receivedArgs, config, async () =>
        new Response(JSON.stringify({
          ok: false,
          error: "unsupported_action",
          detail: "never persist this backend detail",
        }), {
          status: 400,
          headers: { "x-request-id": "audit-contract-correlation" },
        }));
    },
    now: (() => {
      let value = 1000;
      return () => value += 10;
    })(),
  }));
  const response = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), response);

  assert.equal(response.statusCode, 400);
  const callerFailure = JSON.parse(response.body.error.message);
  const auditFailure = JSON.parse(finishInput.error);
  assert.deepEqual(auditFailure, callerFailure);
  assert.equal(finishInput.status, "failed");
  assert.equal(finishInput.planId, PLAN_ID);
  assert.equal(callerFailure.safeErrorCode, "unsupported_action");
  assert.equal(callerFailure.validationCategory, "capability_contract");
  assert.equal(callerFailure.retryable, false);
  assert.equal(callerFailure.correlationId, "audit-contract-correlation");
  assert.doesNotMatch(finishInput.error, /never persist|backend detail/);
});
