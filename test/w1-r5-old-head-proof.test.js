"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const { createHash } = require("node:crypto");

const FIXTURE_BLOBS = Object.freeze({
  "src/http-app.js": "cb9efe807c0fbbb0f40b295c5c5a431e7393c923",
  "src/projectos-mcp-handler.js": "58d5675ba6c8a05cd5812f77d41541b026822e1c",
  "src/runtime/provider-execution-state-machine.js": "dc118a0b3d1bf1da74446e595762ad14dec98ab3",
  "src/tools/memory-evidence-intake.js": "1003a7f574f31e22ae2de6bf5ac6f41123525044",
});

function gitBlobSha(content) {
  const header = Buffer.from(`blob ${content.length}\0`, "utf8");
  return createHash("sha1").update(header).update(content).digest("hex");
}

function canonicalCheckoutCandidates(content) {
  const candidates = [content];
  const text = content.toString("utf8");
  if (!text.includes("\r\n")) {
    candidates.push(Buffer.from(text.replace(/\n/g, "\r\n"), "utf8"));
  }
  return candidates;
}

test("historical fixture files are checkout-equivalent to exact 85327f36 Git blobs", () => {
  for (const [relativePath, expectedSha] of Object.entries(FIXTURE_BLOBS)) {
    const filename = path.join(__dirname, "fixtures", "w1-r5-old-85327", relativePath);
    const content = fs.readFileSync(filename);
    const candidateHashes = canonicalCheckoutCandidates(content).map(gitBlobSha);
    assert.ok(
      candidateHashes.includes(expectedSha),
      `${relativePath}: expected ${expectedSha}, received ${candidateHashes.join(", ")}`,
    );
  }
});

test("historical 85327f36 fails the new W1-R5 invariants behaviorally", () => {
  const runner = path.join(__dirname, "w1-r5-old-head-runner.js");
  const result = spawnSync(process.execPath, [runner], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.status, 1, output.slice(-4000));
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError/);
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith("W1_R5_OLD_HEAD_RESULT="));
  assert.ok(line, output.slice(-4000));
  const summary = JSON.parse(line.slice("W1_R5_OLD_HEAD_RESULT=".length));
  assert.equal(summary.historicalSha, "85327f360976c87b385a93289ea71c7b6ce587d2");
  assert.equal(summary.total, 5);
  assert.equal(summary.infrastructureFailures, 0);
  assert.equal(summary.unexpectedPasses, 0);
  assert.equal(summary.expectedBehavioralFailures, 5);
});
