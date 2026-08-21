"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertReconciliationSummary,
  invokeMcp,
  parseMcpFailure,
} = require("./w1-r5-harness.js");

function deeplyNested(depth) {
  let value = { leaf: true };
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

test("W1-R5 MCP result headroom prevents a later outer-envelope unsafe failure", async () => {
  const escapeHeavy = { payload: '\\\\"'.repeat(15000) };
  let providerCalls = 0;
  const { ledger, response } = await invokeMcp({
    execute: async () => {
      providerCalls += 1;
      return escapeHeavy;
    },
  });
  assert.equal(providerCalls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(ledger.finishInputs.length, 1);
  assert.equal(ledger.finishInputs[0].status, "completed");
  assert.equal(ledger.finishInputs[0].resultSummary.providerOutcome, "succeeded");
  assert.equal(ledger.finishInputs[0].resultSummary.retryable, false);
});

test("W1-R5 MCP generic 409 after dispatch is ambiguous and reconciled", async () => {
  let sideEffects = 0;
  const { ledger, response } = await invokeMcp({
    args: { namespace: "real_life" },
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
  ["excessive nesting", () => deeplyNested(22)],
  ["oversize result", () => Array.from({ length: 501 }, (_, index) => ({ index }))],
]) {
  test(`W1-R5 MCP provider success plus ${label} completes reconciliation`, async () => {
    let providerCalls = 0;
    const { ledger, response } = await invokeMcp({
      execute: async () => {
        providerCalls += 1;
        return resultFactory();
      },
    });
    assert.equal(providerCalls, 1);
    const failure = parseMcpFailure(response);
    assert.equal(failure.providerOutcome, "succeeded");
    assert.equal(failure.retryable, false);
    assert.equal(failure.reconciliationRequired, true);
    assert.equal(ledger.finishInputs.length, 1);
    assert.equal(ledger.finishInputs[0].status, "completed");
    assertReconciliationSummary(ledger.finishInputs[0].resultSummary, "succeeded");
  });
}

test("W1-R5 MCP durable completion failure preserves provider success ambiguity", async () => {
  const { ledger, response } = await invokeMcp({
    execute: async () => ({ ok: true, receipt: "bounded" }),
    ledgerOptions: { failCompleted: true },
  });
  const failure = parseMcpFailure(response);
  assert.equal(failure.providerOutcome, "succeeded");
  assert.equal(failure.downstreamProcessingOutcome, "durable_completion_unknown");
  assert.equal(failure.retryable, false);
  assert.equal(failure.reconciliationRequired, true);
  assert.equal(ledger.finishInputs.some((input) => input.status === "failed"), false);
  assert.doesNotMatch(response.body.error.message, /private durable completion/);
});
