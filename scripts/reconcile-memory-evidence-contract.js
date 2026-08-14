"use strict";

const fs = require("node:fs");

const intakePath = "src/tools/memory-evidence-intake.js";
let intake = fs.readFileSync(intakePath, "utf8");
const intakeOld = "summary: z.string().trim().min(1).max(4000),";
const intakeNew = "summary: z.string().trim().min(1).max(1800),";
if (!intake.includes(intakeOld)) throw new Error("client summary schema anchor missing");
if ((intake.match(/max\(4000\)/g) || []).length !== 1) throw new Error("unexpected 4000-bound count");
intake = intake.replace(intakeOld, intakeNew);
fs.writeFileSync(intakePath, intake);

const memoryPath = "src/tools/memory.js";
let memory = fs.readFileSync(memoryPath, "utf8");
const memoryOld = "summary: { type: 'string' },";
const memoryNew = "summary: { type: 'string', maxLength: 1800 },";
if (!memory.includes(memoryOld)) throw new Error("memory tool summary schema anchor missing");
memory = memory.replace(memoryOld, memoryNew);
fs.writeFileSync(memoryPath, memory);

const testPath = "test/memory-evidence-intake.test.js";
let test = fs.readFileSync(testPath, "utf8");
const testAnchor = '  assert.throws(() => EvidenceCandidateArgsSchema.parse({ ...validArgs(), proofStage: "done" }));';
if (!test.includes(testAnchor)) throw new Error("memory evidence test anchor missing");
test = test.replace(
  testAnchor,
  testAnchor + '\n  assert.throws(() => EvidenceCandidateArgsSchema.parse({ ...validArgs(), summary: "x".repeat(1801) }));',
);
fs.writeFileSync(testPath, test);
