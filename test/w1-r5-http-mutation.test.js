"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertReconciliationSummary,
  invokeHttp,
  parseHttpProviderFailure,
} = require("./w1-r5-harness.js");

function deeplyNested(depth) {
  let value = { leaf: true };
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

for (const [label, resultFactory] of [
  ["cyclic serialization", () => { const value = { safe: true }; value.self = value; return value; }],
  ["non-plain result validation", () => new Date("2026-08-19T00:00:00.000Z")],
  ["excessive nesting", () => deeplyNested(22)],
  ["oversize result", () => Array.from({ length: 501 }, (_, index) => ({ index }))],
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
    args: { namespace: "real_life" },
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
    args: { namespace: "real_life" },
    execute: async () => { throw new Error(secret); },
  });
  const failure = parseHttpProviderFailure(result);
  assert.equal(failure.providerOutcome, "ambiguous");
  assert.equal(failure.retryable, false);
  assert.equal(failure.reconciliationRequired, true);
  assert.doesNotMatch(JSON.stringify(result.body), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(result.ledger.finishInputs), new RegExp(secret));
  assertReconciliationSummary(result.ledger.finishInputs[0].resultSummary, "ambiguous");
});

test("W1-R5 deprecated HTTP /tools alias has the same mutation state machine", async () => {
  const result = await invokeHttp({
    path: "/tools",
    args: { namespace: "real_life" },
    execute: async () => { throw new Error("unknown after dispatch"); },
  });
  const failure = parseHttpProviderFailure(result);
  assert.equal(failure.providerOutcome, "ambiguous");
  assert.equal(failure.retryable, false);
  assert.equal(result.response.headers.get("deprecation"), "true");
  assert.equal(result.ledger.finishInputs[0].status, "completed");
});
