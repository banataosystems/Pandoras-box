"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const intake = fs.readFileSync("src/tools/memory-evidence-intake.js", "utf8");
const memory = fs.readFileSync("src/tools/memory.js", "utf8");

test("Memory evidence client and tool schema share the backend 1800-character summary bound", () => {
  assert.match(
    intake,
    /summary:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(1800\),/,
  );
  assert.doesNotMatch(intake, /summary:[^\n]*max\(4000\)/);
  assert.match(
    memory,
    /summary:\s*\{\s*type:\s*'string',\s*maxLength:\s*1800\s*\},/,
  );
});
