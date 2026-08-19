"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const files = [
  "w1-r5-memory-classification.test.js",
  "w1-r5-mcp-mutation.test.js",
  "w1-r5-http-mutation.test.js",
].map((name) => path.join(__dirname, name));

test("historical 85327f36 fails the new W1-R5 tests for behavioral reasons", () => {
  const result = spawnSync(process.execPath, ["--test", ...files], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, W1_R5_IMPLEMENTATION: "old" },
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.notEqual(result.status, 0, "the historical reviewed source must fail the new contract");
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError/);
  assert.match(output, /write-then-409 is ambiguous/);
  assert.match(output, /HTTP provider success plus cyclic serialization/);
  assert.match(output, /MCP outer-envelope overflow/);
  const match = output.match(/ℹ fail (\d+)/) || output.match(/# fail (\d+)/);
  assert.ok(match, `unable to recover historical failure count:\n${output.slice(-4000)}`);
  const failures = Number(match[1]);
  assert.ok(failures >= 3, `expected at least three behavioral failures, received ${failures}`);
  assert.match(output, /AssertionError|Expected values to be strictly equal|expected MCP failure/);
});
