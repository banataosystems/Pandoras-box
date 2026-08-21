"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeMcpResultPayload,
  wrapMcpResultContract,
} = require("../src/runtime/mcp-result-contract.js");

test("array structuredContent is wrapped in an object without changing text content", () => {
  const content = [{ type: "text", text: '[{"number":78},{"number":79}]' }];
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      content,
      structuredContent: [{ number: 78 }, { number: 79 }],
    },
  };

  const normalized = normalizeMcpResultPayload(payload);
  assert.deepEqual(normalized.result.structuredContent, {
    result: [{ number: 78 }, { number: 79 }],
  });
  assert.strictEqual(normalized.result.content, content);
});

test("object structuredContent remains unchanged", () => {
  const payload = {
    jsonrpc: "2.0",
    id: 2,
    result: { structuredContent: { ref: "refs/heads/main" } },
  };
  assert.strictEqual(normalizeMcpResultPayload(payload), payload);
});

test("primitive and null structuredContent values are wrapped safely", () => {
  const values = ["test-value", 42, true, false, null];

  for (const value of values) {
    const payload = {
      jsonrpc: "2.0",
      id: 10,
      result: { structuredContent: value },
    };

    const normalized = normalizeMcpResultPayload(payload);
    assert.deepEqual(normalized.result.structuredContent, { result: value });
  }
});

test("wrapped handlers normalize response.json and restore it afterward", async () => {
  const sent = [];
  const originalJson = function json(payload) {
    sent.push(payload);
    return this;
  };
  const response = { json: originalJson };
  const handler = wrapMcpResultContract(async (_request, currentResponse) => {
    currentResponse.json({
      jsonrpc: "2.0",
      id: 3,
      result: { structuredContent: ["a", "b"] },
    });
  });

  await handler({}, response);
  assert.deepEqual(sent[0].result.structuredContent, { result: ["a", "b"] });
  assert.strictEqual(response.json, originalJson);
});

test("wrapped handler restores response.json when the handler throws", async () => {
  const originalJson = function json() {
    return this;
  };
  const response = { json: originalJson };
  const handler = wrapMcpResultContract(async () => {
    throw new Error("handler failure");
  });

  await assert.rejects(() => handler({}, response), { message: "handler failure" });
  assert.strictEqual(response.json, originalJson);
});
