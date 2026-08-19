"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PLAN_ID_TWO,
  assertReconciliationSummary,
  evidenceArgs,
  invokeHttp,
  invokeMcp,
  parseMcpFailure,
  pendingReviewResponse,
} = require("./w1-r5-harness.js");

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
  const { ledger, response } = await invokeMcp({
    args: { namespace: "real_life" },
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

test("W1-R5 idempotent replay uses one identity but never permits blind automatic retry", async () => {
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
  assert.equal(firstFailure.retryable, true);
  assert.equal(firstFailure.automaticRetryAllowed, false);
  assert.equal(firstFailure.retryContract, "same_immutable_idempotency_identity_only");
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
  assert.doesNotMatch(JSON.stringify(second.ledger.finishInputs), new RegExp(args.idempotencyKey));
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
    "privacy_safe_summary_only_v1",
  );
});
