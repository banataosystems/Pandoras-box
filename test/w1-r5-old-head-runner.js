"use strict";

const assert = require("node:assert/strict");
const {
  evidenceArgs,
  invokeHttpWith,
  invokeMcpWith,
  loadHistoricalImplementation,
  memoryConfig,
} = require("./w1-r5-harness.js");

async function main() {
  const old = loadHistoricalImplementation();
  const results = [];

  async function probe(name, operation) {
    try {
      await operation();
      results.push({ name, result: "unexpected_pass" });
    } catch (error) {
      const text = `${error?.name || "Error"}: ${error?.message || String(error)}`;
      const infrastructure = /MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError/.test(text);
      results.push({
        name,
        result: infrastructure ? "infrastructure_failure" : "expected_behavioral_failure",
        error: text.slice(0, 500),
      });
    }
  }

  await probe("write_then_409", async () => {
    let observed;
    try {
      await old.submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
        new Response(JSON.stringify({ ok: false, error: "idempotency_conflict" }), {
          status: 409,
        }));
    } catch (error) {
      observed = error;
    }
    assert.ok(observed);
    assert.equal(observed.providerOutcome, "ambiguous");
  });

  await probe("http_write_then_409", async () => {
    let sideEffects = 0;
    const result = await invokeHttpWith(old, {
      args: { namespace: "real_life" },
      execute: async () => {
        sideEffects += 1;
        throw Object.assign(new Error("private old HTTP conflict after write"), {
          status: 409,
          code: "provider_conflict",
        });
      },
    });
    assert.equal(sideEffects, 1);
    assert.equal(result.ledger.finishInputs.some((input) => input.status === "failed"), false);
  });

  await probe("http_success_then_serialization", async () => {
    let sideEffects = 0;
    const value = { safe: true };
    value.self = value;
    let result;
    let invokeError;
    try {
      result = await invokeHttpWith(old, {
        execute: async () => {
          sideEffects += 1;
          return value;
        },
      });
    } catch (error) {
      invokeError = error;
    }
    assert.equal(sideEffects, 1);
    if (invokeError) throw invokeError;
    assert.equal(result.ledger.finishInputs.some((input) => input.status === "failed"), false);
  });

  await probe("mcp_write_then_409", async () => {
    let sideEffects = 0;
    const result = await invokeMcpWith(old, {
      args: { namespace: "real_life" },
      execute: async () => {
        sideEffects += 1;
        throw Object.assign(new Error("private old MCP conflict after write"), {
          status: 409,
          code: "provider_conflict",
        });
      },
    });
    assert.equal(sideEffects, 1);
    assert.equal(result.ledger.finishInputs.some((input) => input.status === "failed"), false);
  });

  await probe("raw_idempotency_key_persistence", async () => {
    const args = evidenceArgs({ idempotencyKey: "worker1-old-head-raw-key-proof" });
    const result = await invokeMcpWith(old, {
      args,
      execute: async () => ({
        ok: true,
        candidateId: "44444444-4444-4444-8444-444444444444",
        reviewItemId: "55555555-5555-4555-8555-555555555555",
        status: "pending_review",
        deduplicated: false,
        idempotencyKey: args.idempotencyKey,
        namespace: args.namespace,
        projectId: "66666666-6666-4666-8666-666666666666",
        projectKey: args.projectKey,
        proofStage: args.proofStage,
        privacyScanVersion: "evidence_privacy_v2",
        canonicalPromoted: false,
      }),
    });
    assert.equal(result.ledger.finishInputs.length, 1);
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.ledger.finishInputs[0].resultSummary, "idempotencyKey"),
      false,
    );
  });

  const summary = {
    historicalSha: "85327f360976c87b385a93289ea71c7b6ce587d2",
    total: results.length,
    expectedBehavioralFailures: results.filter((item) => item.result === "expected_behavioral_failure").length,
    unexpectedPasses: results.filter((item) => item.result === "unexpected_pass").length,
    infrastructureFailures: results.filter((item) => item.result === "infrastructure_failure").length,
    results,
  };
  process.stdout.write(`W1_R5_OLD_HEAD_RESULT=${JSON.stringify(summary)}\n`);
  process.exitCode = summary.expectedBehavioralFailures > 0 ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 2;
});
