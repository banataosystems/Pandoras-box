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
const {
  ExecutionLedgerFinalizationError,
} = require("../src/runtime/execution-ledger-client.js");

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
    "privacyScanVersion",
    "provider",
    "retryable",
    "summary",
    "safeErrorCode",
    "schemaVersion",
    "timestamp",
    "validationCategory",
  ].sort());
  assert.equal(parsed.schemaVersion, "1.0.0");
  assert.equal(parsed.provider, "pandora-memory");
  assert.equal(parsed.operation, "memory.submitEvidenceCandidate");
  assert.equal(parsed.privacyScanVersion, "evidence_privacy_v2");
  assert.equal(typeof parsed.summary, "string");
  assert.match(parsed.correlationId, /^[A-Za-z0-9._:-]{1,128}$/);
  assert.ok(Number.isFinite(Date.parse(parsed.timestamp)));
  return parsed;
}

function pendingReviewResponse(args, overrides = {}) {
  return {
    ok: true,
    candidate_id: "22222222-2222-4222-8222-222222222222",
    review_item_id: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",
    idempotency_key: args.idempotencyKey,
    namespace: args.namespace,
    project_id: args.projectId ?? "33333333-3333-4333-8333-333333333333",
    project_key: args.projectKey,
    proof_stage: args.proofStage,
    deduplicated: false,
    created_at: "2026-08-19T05:15:10.000Z",
    canonical_memory_written: false,
    privacy_policy: "metadata_only_v1",
    ...overrides,
  };
}

function successfulCandidateResult(args, overrides = {}) {
  return {
    ok: true,
    candidateId: "22222222-2222-4222-8222-222222222222",
    reviewItemId: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",
    deduplicated: false,
    idempotencyKey: args.idempotencyKey,
    namespace: args.namespace,
    projectId: args.projectId ?? "33333333-3333-4333-8333-333333333333",
    projectKey: args.projectKey,
    proofStage: args.proofStage,
    createdAt: "2026-08-19T05:15:10.000Z",
    privacyPolicy: "metadata_only_v1",
    privacyScanVersion: "evidence_privacy_v2",
    canonicalPromoted: false,
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
      status: 202,
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
    reviewItemId: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",
    deduplicated: false,
    idempotencyKey: args.idempotencyKey,
    namespace: args.namespace,
    projectId: "33333333-3333-4333-8333-333333333333",
    projectKey: args.projectKey,
    proofStage: args.proofStage,
    createdAt: "2026-08-19T05:15:10.000Z",
    privacyPolicy: "metadata_only_v1",
    privacyScanVersion: "evidence_privacy_v2",
    canonicalPromoted: false,
  });
});

test("an identical idempotent replay is reported as deduplicated and does not promote canon", async () => {
  const args = evidenceArgs();
  const result = await submitEvidenceCandidate(args, memoryConfig, async () =>
    new Response(JSON.stringify(pendingReviewResponse(args, {
      deduplicated: true,
      created_at: null,
    })), { status: 200 }));
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
      assert.match(failure.summary, /idempotency conflict/i);
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


test("Memory submission errors clamp every non-4xx outer status to 502", () => {
  const common = {
    httpStatus: 200,
    safeErrorCode: "memory_submission_failed",
    validationCategory: "unknown_downstream",
    retryable: false,
    correlationId: "clamp-status",
    timestamp: "2026-08-19T06:00:00.000Z",
  };
  for (const outerStatus of [null, 0, 200, 201, 399, 500, 503]) {
    const error = new MemoryEvidenceSubmissionError({ ...common, outerStatus });
    assert.equal(error.status, 502);
  }
  for (const outerStatus of [400, 408, 409, 429, 499]) {
    const error = new MemoryEvidenceSubmissionError({ ...common, outerStatus });
    assert.equal(error.status, outerStatus);
  }
});

test("body-level Memory failure can never surface as HTTP 2xx", async () => {
  const args = evidenceArgs();
  let finishInput;
  const ledger = {
    async claimPlan(_token, planId) {
      return {
        planId,
        requestId: "55555555-5555-4555-8555-555555555555",
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
    async execute(_name, receivedArgs, config) {
      return submitEvidenceCandidate(receivedArgs, config, async () =>
        new Response(JSON.stringify({
          ok: false,
          error: "evidence_candidate_invalid",
        }), {
          status: 200,
          headers: { "x-request-id": "body-failure-http-200" },
        }));
    },
  }));
  const response = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), response);

  assert.equal(response.statusCode, 502);
  assert.equal(finishInput.status, "failed");
  const callerFailure = JSON.parse(response.body.error.message);
  const auditFailure = JSON.parse(finishInput.error);
  assert.deepEqual(auditFailure, callerFailure);
  assert.equal(callerFailure.httpStatus, 200);
  assert.equal(callerFailure.safeErrorCode, "response_contract_error");
  assert.equal(callerFailure.validationCategory, "response_contract");
  assert.equal(callerFailure.retryable, false);
  assert.equal(callerFailure.privacyScanVersion, "evidence_privacy_v2");
});

test("429 remains retryable and carries a bounded Retry-After instruction", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 429,
        headers: {
          "retry-after": "7",
          "x-request-id": "memory-rate-limit",
        },
      })),
    (error) => {
      assert.ok(error instanceof MemoryEvidenceSubmissionError);
      assert.equal(error.status, 429);
      const failure = JSON.parse(error.message);
      assert.equal(failure.httpStatus, 429);
      assert.equal(failure.safeErrorCode, "provider_rate_limited");
      assert.equal(failure.validationCategory, "rate_limit");
      assert.equal(failure.retryable, true);
      assert.equal(failure.retryAfterMs, 7000);
      assert.equal(failure.privacyScanVersion, "evidence_privacy_v2");
      assert.doesNotMatch(error.message, /"rate_limited"/);
      return true;
    },
  );
});

test("408 is classified as a retryable provider timeout", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "private-timeout-detail" }), {
        status: 408,
      })),
    (error) => {
      assert.ok(error instanceof MemoryEvidenceSubmissionError);
      assert.equal(error.status, 408);
      const failure = JSON.parse(error.message);
      assert.equal(failure.httpStatus, 408);
      assert.equal(failure.safeErrorCode, "provider_timeout");
      assert.equal(failure.validationCategory, "timeout");
      assert.equal(failure.retryable, true);
      assert.equal("retryAfterMs" in failure, false);
      assert.doesNotMatch(error.message, /private-timeout-detail/);
      return true;
    },
  );
});

test("a non-idempotency 409 is a generic downstream conflict", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "candidate_already_promoted",
        detail: "private conflict detail",
      }), { status: 409 })),
    (error) => {
      assert.ok(error instanceof MemoryEvidenceSubmissionError);
      assert.equal(error instanceof MemoryEvidenceIdempotencyConflictError, false);
      assert.equal(error.status, 409);
      const failure = JSON.parse(error.message);
      assert.equal(failure.httpStatus, 409);
      assert.equal(failure.safeErrorCode, "provider_conflict");
      assert.equal(failure.validationCategory, "downstream_conflict");
      assert.equal(failure.retryable, false);
      assert.doesNotMatch(error.message, /candidate_already_promoted|private conflict/);
      return true;
    },
  );
});

test("privacy preflight version is attested without widening the strict body contract", async () => {
  const args = evidenceArgs();
  let privacyVersion;
  const result = await submitEvidenceCandidate(args, memoryConfig, async (_url, init) => {
    privacyVersion = init.headers["x-pandora-privacy-scan-version"];
    return new Response(JSON.stringify(pendingReviewResponse(args)), { status: 202 });
  });
  assert.equal(privacyVersion, "evidence_privacy_v2");
  assert.equal(result.privacyScanVersion, "evidence_privacy_v2");
});


test("strict Memory success schema rejects every ambiguous or malformed 2xx response", async () => {
  const args = evidenceArgs();
  const base = pendingReviewResponse(args);
  const without = (key) => {
    const value = { ...base };
    delete value[key];
    return value;
  };
  const cases = [
    [202, without("ok")],
    [202, without("candidate_id")],
    [202, without("review_item_id")],
    [202, { ...base, candidate_id: "not-a-uuid" }],
    [202, { ...base, review_item_id: "not-a-uuid" }],
    [202, { ...base, deduplicated: "false" }],
    [202, { ...base, created_at: "not-a-timestamp" }],
    [202, { ...base, canonical_memory_written: true }],
    [202, { ...base, privacy_policy: "unversioned" }],
    [202, { ...base, unexpected_trust_field: "must-reject" }],
    [201, base],
    [200, base],
    [202, { ...base, deduplicated: true, created_at: null }],
    [202, { ...base, project_id: "not-a-project-uuid" }],
    [202, { ...base, proof_stage: "implemented" }],
  ];
  for (const [status, body] of cases) {
    await assert.rejects(
      () => submitEvidenceCandidate(args, memoryConfig, async () =>
        new Response(JSON.stringify(body), { status })),
      (error) => {
        const failure = failureFrom(error);
        assert.equal(error.status, 502);
        assert.equal(failure.httpStatus, status);
        assert.equal(failure.safeErrorCode, "response_contract_error");
        assert.equal(failure.validationCategory, "response_contract");
        assert.equal(failure.retryable, false);
        assert.doesNotMatch(error.message, /unexpected_trust_field|must-reject|not-a-uuid|unversioned/);
        return true;
      },
    );
  }
});

test("safe Memory codes are accepted only with their exact HTTP status", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "namespace_not_allowed" }), { status: 400 })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.httpStatus, 400);
      assert.equal(failure.safeErrorCode, "response_contract_error");
      assert.equal(failure.validationCategory, "response_contract");
      return true;
    },
  );

  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "namespace_not_allowed" }), { status: 503 })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.httpStatus, 503);
      assert.equal(failure.safeErrorCode, "provider_server_error");
      assert.equal(failure.validationCategory, "provider_server");
      assert.equal(failure.retryable, true);
      return true;
    },
  );
});

test("malformed runtime limits fall back to bounded safe defaults", async () => {
  const args = evidenceArgs();
  for (const timeoutMs of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, "invalid"]) {
    const result = await submitEvidenceCandidate(args, {
      ...memoryConfig,
      timeoutMs,
    }, async (_url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (init.signal.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return new Response(JSON.stringify(pendingReviewResponse(args)), { status: 202 });
    });
    assert.equal(result.candidateId, "22222222-2222-4222-8222-222222222222");
  }

  await assert.rejects(
    () => submitEvidenceCandidate(args, {
      ...memoryConfig,
      maxResponseBytes: Number.NaN,
    }, async () => new Response(JSON.stringify(pendingReviewResponse(args)), {
      status: 202,
      headers: { "content-length": "100001" },
    })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.safeErrorCode, "response_contract_error");
      return true;
    },
  );
});

test("shared MCP provider result normalization is item, depth, node, and byte bounded", async () => {
  const cases = [];
  cases.push(Array.from({ length: 501 }, (_, index) => ({ index })));
  let deep = "leaf";
  for (let depth = 0; depth < 22; depth += 1) deep = [deep];
  cases.push(deep);
  cases.push({ payload: "x".repeat((512 * 1024) + 1) });

  for (const raw of cases) {
    const handler = createProjectOsMcpHandler(handlerDependencies({
      async execute() { return raw; },
    }));
    const response = responseRecorder();
    await handler(request("supabase.list-accounts"), response);
    assert.equal(response.statusCode, 502);
    assert.match(response.body.error.message, /Provider response contract/);
    assert.equal(response.body.result, undefined);
  }
});

test("the bounded shared array contract still accepts the advertised 500-item maximum", async () => {
  const raw = Array.from({ length: 500 }, (_, index) => ({ index }));
  const handler = createProjectOsMcpHandler(handlerDependencies({
    async execute() { return raw; },
  }));
  const response = responseRecorder();
  await handler(request("supabase.list-accounts"), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.structuredContent.items.length, 500);
});

test("completed Memory execution is candidate/review-bound in the durable finalization summary", async () => {
  const args = evidenceArgs();
  let finishInput;
  const ledger = {
    async claimPlan(_token, planId) {
      return {
        planId,
        requestId: "88888888-8888-4888-8888-888888888888",
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
    async execute() { return successfulCandidateResult(args); },
  }));
  const response = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.structuredContent.planStatus, "completed");
  assert.equal(finishInput.status, "completed");
  assert.deepEqual(finishInput.resultSummary, {
    type: "memory_evidence_candidate",
    candidateId: "22222222-2222-4222-8222-222222222222",
    reviewItemId: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",
    deduplicated: false,
    idempotencyKey: args.idempotencyKey,
    namespace: args.namespace,
    projectId: "33333333-3333-4333-8333-333333333333",
    projectKey: args.projectKey,
    proofStage: args.proofStage,
    canonicalPromoted: false,
    privacyScanVersion: "evidence_privacy_v2",
  });
});

test("provider success plus ambiguous finalization never returns ordinary success or re-executes on retry", async () => {
  const args = evidenceArgs();
  let claims = 0;
  let executions = 0;
  let finishes = 0;
  const ledger = {
    async claimPlan(_token, planId) {
      claims += 1;
      if (claims > 1) {
        throw Object.assign(new Error("Execution plan is already claimed"), { status: 409 });
      }
      return {
        planId,
        requestId: "99999999-9999-4999-8999-999999999999",
        tool: "memory.submitEvidenceCandidate",
        risk: "write",
        args,
        payloadHash: executionPayloadHash("memory.submitEvidenceCandidate", args),
        status: "executing",
      };
    },
    async finishPlan(_token, input) {
      finishes += 1;
      throw new ExecutionLedgerFinalizationError({
        planId: input.planId,
        expectedStatus: input.status,
        observedStatus: "executing",
      });
    },
  };
  const handler = createProjectOsMcpHandler(handlerDependencies({
    ledger,
    async execute() {
      executions += 1;
      return successfulCandidateResult(args);
    },
  }));

  const first = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), first);
  const retry = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), retry);

  assert.equal(first.statusCode, 503);
  assert.match(first.body.error.message, /execution_finalization_ambiguous/);
  assert.equal(retry.statusCode, 409);
  assert.equal(executions, 1);
  assert.equal(finishes, 1);
});

test("provider failure plus ambiguous finalization returns reconciliation-required without leaking provider detail", async () => {
  const args = evidenceArgs();
  let finishInput;
  const ledger = {
    async claimPlan(_token, planId) {
      return {
        planId,
        requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tool: "memory.submitEvidenceCandidate",
        risk: "write",
        args,
        payloadHash: executionPayloadHash("memory.submitEvidenceCandidate", args),
        status: "executing",
      };
    },
    async finishPlan(_token, input) {
      finishInput = input;
      throw new ExecutionLedgerFinalizationError({
        planId: input.planId,
        expectedStatus: input.status,
        observedStatus: "executing",
      });
    },
  };
  const handler = createProjectOsMcpHandler(handlerDependencies({
    ledger,
    async execute() {
      throw Object.assign(new Error("private provider detail credential=must-not-leak"), { status: 400 });
    },
  }));
  const response = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), response);

  assert.equal(response.statusCode, 503);
  assert.equal(finishInput.status, "failed");
  assert.doesNotMatch(finishInput.error, /private provider detail|must-not-leak|credential=/);
  assert.doesNotMatch(response.body.error.message, /private provider detail|must-not-leak|credential=/);
  assert.match(response.body.error.message, /execution_finalization_ambiguous/);
});
