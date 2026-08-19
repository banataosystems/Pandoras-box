"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evidenceArgs,
  loadCurrentImplementation,
  memoryConfig,
} = require("./w1-r5-harness.js");

const { submitEvidenceCandidate } = loadCurrentImplementation();

test("W1-R5 write-then-409 is ambiguous, never pre-side-effect failure", async () => {
  let sideEffects = 0;
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () => {
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

test("W1-R5 unrelated 409 remains ambiguous and cannot become idempotency success", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "candidate_already_promoted" }), {
        status: 409,
      })),
    (error) => {
      assert.equal(error.providerOutcome, "ambiguous");
      assert.equal(error.status, 409);
      return true;
    },
  );
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

test("W1-R5 HTTP 200 plus known validation body fails closed without false success", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "evidence_candidate_invalid" }), {
        status: 200,
      })),
    (error) => {
      assert.equal(error.providerOutcome, "failed_before_side_effects");
      assert.equal(error.status, 502);
      return true;
    },
  );
});

test("W1-R5 HTTP 200 plus unknown false body is ambiguous and redacted", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "unknown_private_contract" }), {
        status: 200,
      })),
    (error) => {
      assert.equal(error.providerOutcome, "ambiguous");
      assert.doesNotMatch(error.message, /unknown_private_contract/);
      return true;
    },
  );
});
