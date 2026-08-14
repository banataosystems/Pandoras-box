"use strict";

const fs = require("node:fs");

const memoryPath = "src/tools/memory.js";
let memory = fs.readFileSync(memoryPath, "utf8");
const requireNeedle = 'const memory_governance_1 = require("./memory-governance");';
if (!memory.includes(requireNeedle)) throw new Error("memory-governance require anchor missing");
memory = memory.replace(
  requireNeedle,
  requireNeedle + '\nconst memory_evidence_intake_1 = require("./memory-evidence-intake");',
);

const definitionAnchor = "    'memory.canonicalContext': {";
if (!memory.includes(definitionAnchor)) throw new Error("memory tool definition anchor missing");
const definition = `    'memory.submitEvidenceCandidate': {
        description: 'Submit a sanitized, project-scoped evidence candidate to Pandora Memory for human review. This never promotes canonical Memory automatically',
        parameters: {
            type: 'object',
            properties: {
                namespace: { type: 'string', enum: ['real_life', 'au'] },
                projectId: { type: 'string', description: 'Exact ProjectOS project UUID when known' },
                projectKey: { type: 'string', description: 'Exact ProjectOS project key when known' },
                title: { type: 'string' },
                summary: { type: 'string' },
                proofStage: { type: 'string', enum: ['documented', 'implemented', 'tested', 'deployed', 'production_verified'] },
                claim: { type: 'string' },
                evidenceRefs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string' },
                            ref: { type: 'string' },
                            sha256: { type: 'string' },
                            artifact_class: { type: 'string' },
                            observed_at: { type: 'string' },
                        },
                        required: ['type', 'ref'],
                    },
                },
                provenance: {
                    type: 'object',
                    properties: {
                        source_type: { type: 'string' },
                        source_locator: { type: 'string' },
                        source_sha: { type: 'string' },
                        parent_sha: { type: 'string' },
                        observed_at: { type: 'string' },
                    },
                    required: ['source_type', 'source_locator', 'observed_at'],
                },
                idempotencyKey: { type: 'string' },
            },
            required: ['namespace', 'title', 'summary', 'proofStage', 'claim', 'evidenceRefs', 'provenance', 'idempotencyKey'],
            additionalProperties: false,
        },
    },
`;
memory = memory.replace(definitionAnchor, definition + definitionAnchor);

const switchAnchor = "        case 'memory.canonicalContext':";
if (!memory.includes(switchAnchor)) throw new Error("memory tool switch anchor missing");
memory = memory.replace(
  switchAnchor,
  "        case 'memory.submitEvidenceCandidate':\n" +
  "            return (0, memory_evidence_intake_1.submitEvidenceCandidate)(args, configuration, fetchFn);\n" +
  switchAnchor,
);
fs.writeFileSync(memoryPath, memory);

const manifestPath = "src/runtime/tool-manifest.js";
let manifest = fs.readFileSync(manifestPath, "utf8");
const closeAnchor = "\n];\nexports.toolManifests";
const idx = manifest.indexOf(closeAnchor);
if (idx < 0) throw new Error("tool manifest entries close anchor missing");
const manifestLine = "    manifest('memory.submitEvidenceCandidate', 'memory', 'write', true, 'project', ['memory:write']),";
manifest = manifest.slice(0, idx) + "\n" + manifestLine + manifest.slice(idx);
fs.writeFileSync(manifestPath, manifest);
