"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createProjectOsMcpHandler } = require("../dist/projectos-mcp-handler.js");
const {
  EVIDENCE_PRIVACY_SCAN_VERSION,
  MemoryEvidenceIdempotencyConflictError,
  MemoryEvidenceSubmissionError,
  submitEvidenceCandidate,
} = require("../src/tools/memory-evidence-intake.js");

const TOKEN = "worker-one-review-regression-token-material";
const ORGANIZATION_ID = "2270b266-59da-4c39-bfd9-9f8d08352af0";
const USER_ID = "e5f5744e-554b-4f92-aad2-3f58ae6a33ad";

const memoryConfig = {
  baseUrl: "https://pandorasbox-memory.vercel.app",
  oidcToken: "test-oidc-token-material-long-enough-for-contract-tests",
  allowedNamespaces: ["real_life"],
  grantedScopes: ["memory:read", "memory:write"],
  allowMutations: true,
  timeoutMs: 1000,
  maxResponseBytes: 100000,
};

function evidenceArgs() {
  const sourceSha = "616e97db7daf4cb5b02fcd19facfa36ec65cd9e2";
  return {
    namespace: "real_life",
    projectKey: "pandoras-box",
    title: "Worker 1 independent-review regression fixture",
    summary: "Privacy-safe fixture covering the exact Claude review findings.",
    proofStage: "tested",
    claim: "The source contract fails closed and preserves governed diagnostics.",
    evidenceRefs: [{
      type: "github_commit",
      ref: `banataosystems/Pandoras-box@${sourceSha}`,
      observed_at: "2026-08-19T06:40:00+08:00",
    }],
    provenance: {
      source_type: "github_commit",
      source_locator: "banataosystems/Pandoras-box",
      source_sha: sourceSha,
      observed_at: "2026-08-19T06:40:00+08:00",
    },
    idempotencyKey: `worker1-claude-review:${sourceSha}`,
  };
}

function pendingReviewResponse(args) {
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
    created_at: "2026-08-19T06:40:00.000Z",
  };
}

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
      id: 81,
      method: "tools/call",
      params: { name, arguments: args },
    },
  };
}

function handlerDependencies(scopes) {
  return {
    organizationId: ORGANIZATION_ID,
    authenticator: {
      async authenticate() {
        return {
          userId: USER_ID,
          accessToken: TOKEN,
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
    workloadToken: () => "server-side-workload-token",
    toolConfiguration: () => ({ fixture: true }),
  };
}

async function callCatalog(scopes) {
  const handler = createProjectOsMcpHandler(handlerDependencies(scopes));
  const response = responseRecorder();
  await handler(request("projectos_tool_catalog"), response);
  return response;
}

function parsedFailure(error) {
  assert.ok(error instanceof MemoryEvidenceSubmissionError);
  return JSON.parse(error.message);
}

// This file is intentionally bound to Claude's rejected-head findings. It must
// remain capable of failing the superseded fc46fb40 contract unless equivalent
// acceptance coverage is preserved elsewhere.

test("a downstream HTTP-200 body failure cannot complete as HTTP success", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "evidence_candidate_invalid",
      }), { status: 200 })),
    (error) => {
      const failure = parsedFailure(error);
      assert.equal(error.status, 502);
      assert.equal(failure.httpStatus, 200);
      assert.equal(failure.safeErrorCode, "evidence_candidate_invalid");
      assert.equal(failure.retryable, false);
      return true;
    },
  );
});

test("408 and 429 retain retryable transient semantics", async () => {
  const cases = [
    {
      status: 408,
      headers: {},
      outerStatus: 408,
      code: "provider_timeout",
      category: "timeout",
      retryAfterMs: undefined,
    },
    {
      status: 429,
      headers: { "retry-after": "999999999" },
      outerStatus: 429,
      code: "provider_rate_limited",
      category: "rate_limit",
      retryAfterMs: 86400000,
    },
  ];

  for (const expected of cases) {
    await assert.rejects(
      () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
        new Response(JSON.stringify({ ok: false, error: "private-provider-detail" }), {
          status: expected.status,
          headers: expected.headers,
        })),
      (error) => {
        const failure = parsedFailure(error);
        assert.equal(error.status, expected.outerStatus);
        assert.equal(failure.httpStatus, expected.status);
        assert.equal(failure.safeErrorCode, expected.code);
        assert.equal(failure.validationCategory, expected.category);
        assert.equal(failure.retryable, true);
        assert.equal(failure.retryAfterMs, expected.retryAfterMs);
        assert.doesNotMatch(error.message, /private-provider-detail/);
        return true;
      },
    );
  }
});

test("only a genuine idempotency 409 receives idempotency classification", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "candidate_already_promoted" }), {
        status: 409,
      })),
    (error) => {
      const failure = parsedFailure(error);
      assert.equal(error instanceof MemoryEvidenceIdempotencyConflictError, false);
      assert.equal(failure.safeErrorCode, "provider_conflict");
      assert.equal(failure.validationCategory, "downstream_conflict");
      return true;
    },
  );

  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "idempotency_conflict" }), {
        status: 409,
      })),
    (error) => {
      const failure = parsedFailure(error);
      assert.ok(error instanceof MemoryEvidenceIdempotencyConflictError);
      assert.equal(failure.safeErrorCode, "idempotency_conflict");
      assert.equal(failure.validationCategory, "idempotency");
      return true;
    },
  );
});

test("privacy-scan provenance is exported, transmitted, and returned", async () => {
  const args = evidenceArgs();
  let header;
  const result = await submitEvidenceCandidate(args, memoryConfig, async (_url, init) => {
    header = init.headers["x-pandora-privacy-scan-version"];
    return new Response(JSON.stringify(pendingReviewResponse(args)), { status: 201 });
  });

  assert.equal(EVIDENCE_PRIVACY_SCAN_VERSION, "evidence_privacy_v2");
  assert.equal(header, EVIDENCE_PRIVACY_SCAN_VERSION);
  assert.equal(result.privacyScanVersion, EVIDENCE_PRIVACY_SCAN_VERSION);
});

test("assertToolScope preserves the bounded legacy carve-out and fails closed otherwise", async () => {
  const legacy = await callCatalog(["openid", "email", "profile"]);
  assert.equal(legacy.statusCode, 200);

  const legacyOffline = await callCatalog(["openid", "email", "profile", "offline_access"]);
  assert.equal(legacyOffline.statusCode, 200);

  const broadenedLegacy = await callCatalog(["openid", "email", "profile", "calendar.read"]);
  assert.equal(broadenedLegacy.statusCode, 403);
  assert.match(broadenedLegacy.body.error.message, /projectos:read/);

  const wrongProjectScope = await callCatalog(["openid", "projectos:plan"]);
  assert.equal(wrongProjectScope.statusCode, 403);
  assert.match(wrongProjectScope.body.error.message, /projectos:read/);

  const explicitRead = await callCatalog(["openid", "projectos:read"]);
  assert.equal(explicitRead.statusCode, 200);
});
