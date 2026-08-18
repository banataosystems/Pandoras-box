#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_MANIFEST = "docs/releases/vercel/2026-08-19-current-production-observation.json";
const DEFAULT_SIDECAR = "docs/releases/vercel/2026-08-19-current-production-observation.sha256";
const DEFAULT_SCHEMA = "docs/releases/vercel/release-manifest.schema.json";
const DEFAULT_WORKFLOW = ".github/workflows/vercel-release-evidence.yml";

const SHA40 = /^[0-9a-f]{40}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{20,}$/;
const PROJECT_ID = /^prj_[A-Za-z0-9]{20,}$/;
const TEAM_ID = /^team_[A-Za-z0-9]{20,}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const CANONICAL_PROJECTS = new Map([
  ["banataosystems/Pandoras-box", "https://mcpmaster.vercel.app"],
  ["banataosystems/pandoras-box-memory", "https://pandorasbox-memory.vercel.app"],
]);

const BANNED_KEYS = new Set([
  "password",
  "password_hash",
  "client_secret",
  "private_key",
  "service_role_key",
  "access_token",
  "refresh_token",
  "api_key",
  "authorization_header",
]);

const CREDENTIAL_PATTERNS = [
  ["private key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub credential shape", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["AWS access-key shape", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack credential shape", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["database URL with embedded password", /\bpostgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/i],
  ["JWT-shaped value", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ["Supabase secret-key shape", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
];

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function validDateTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function inspectForCredentials(value, path = "$", errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectForCredentials(item, `${path}[${index}]`, errors));
    return errors;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (BANNED_KEYS.has(key.toLowerCase())) {
        errors.push(`${path}.${key}: credential-bearing key is not allowed`);
      }
      inspectForCredentials(nested, `${path}.${key}`, errors);
    }
    return errors;
  }
  if (typeof value === "string") {
    for (const [label, pattern] of CREDENTIAL_PATTERNS) {
      if (pattern.test(value)) {
        errors.push(`${path}: ${label} is not allowed`);
      }
    }
  }
  return errors;
}

function requireBoolean(object, key, path, errors) {
  if (typeof object?.[key] !== "boolean") {
    errors.push(`${path}.${key}: must be boolean`);
    return false;
  }
  return object[key];
}

function validateDeployment(deployment, expectedTarget, sourceSha, path, errors) {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    errors.push(`${path}: deployment object is required`);
    return;
  }
  if (!DEPLOYMENT_ID.test(deployment.id ?? "")) {
    errors.push(`${path}.id: invalid Vercel deployment id`);
  }
  if (deployment.target !== expectedTarget) {
    errors.push(`${path}.target: expected ${expectedTarget}`);
  }
  if (deployment.state !== "READY") {
    errors.push(`${path}.state: provider observation must be READY`);
  }
  if (deployment.source_sha !== sourceSha) {
    errors.push(`${path}.source_sha: must equal project source_sha`);
  }
  if (!validDateTime(deployment.created_at)) {
    errors.push(`${path}.created_at: invalid date-time`);
  }
  try {
    const parsed = new URL(deployment.url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".vercel.app")) {
      errors.push(`${path}.url: must be an HTTPS Vercel deployment URL`);
    }
  } catch {
    errors.push(`${path}.url: invalid URL`);
  }
}

function validateRollback(project, path, errors) {
  const candidate = project.rollback_candidate;
  const qualification = project.rollback_qualification;
  if (!candidate || typeof candidate !== "object") {
    errors.push(`${path}.rollback_candidate: object is required`);
    return;
  }
  if (!DEPLOYMENT_ID.test(candidate.id ?? "")) {
    errors.push(`${path}.rollback_candidate.id: invalid Vercel deployment id`);
  }
  if (candidate.source_sha !== null && !SHA40.test(candidate.source_sha ?? "")) {
    errors.push(`${path}.rollback_candidate.source_sha: must be a 40-hex SHA or null`);
  }
  if (!qualification || typeof qualification !== "object") {
    errors.push(`${path}.rollback_qualification: object is required`);
    return;
  }

  const gateNames = [
    "source_qualified",
    "build_qualified",
    "runtime_qualified",
    "database_qualified",
    "recovery_qualified",
    "rehearsed",
  ];
  const gates = gateNames.map((name) => requireBoolean(qualification, name, `${path}.rollback_qualification`, errors));
  if (!["NOT_QUALIFIED", "QUALIFIED"].includes(qualification.status)) {
    errors.push(`${path}.rollback_qualification.status: invalid status`);
  }
  if (qualification.status === "QUALIFIED") {
    if (!gates.every(Boolean)) {
      errors.push(`${path}.rollback_qualification: QUALIFIED requires every gate`);
    }
    if (!SHA40.test(candidate.source_sha ?? "")) {
      errors.push(`${path}.rollback_candidate.source_sha: QUALIFIED requires exact source provenance`);
    }
  }
}

function validateProject(project, index, errors) {
  const path = `$.projects[${index}]`;
  if (!REPOSITORY.test(project.repository ?? "")) {
    errors.push(`${path}.repository: invalid owner/repository`);
  }
  if (!CANONICAL_PROJECTS.has(project.repository)) {
    errors.push(`${path}.repository: not a canonical Pandora repository`);
  }
  if (!PROJECT_ID.test(project.vercel_project_id ?? "")) {
    errors.push(`${path}.vercel_project_id: invalid Vercel project id`);
  }
  if (project.production_branch !== "main") {
    errors.push(`${path}.production_branch: expected main`);
  }
  if (!SHA40.test(project.source_sha ?? "")) {
    errors.push(`${path}.source_sha: expected exact 40-hex commit`);
  }
  if (!SHA40.test(project.tree_sha ?? "")) {
    errors.push(`${path}.tree_sha: expected exact 40-hex tree`);
  }
  if (!validDateTime(project.verified_at)) {
    errors.push(`${path}.verified_at: invalid date-time`);
  }
  if (project.authorized_by !== null || project.authorized_at !== null) {
    errors.push(`${path}: provider observation must not claim production authorization`);
  }

  const gitLink = project.git_link;
  if (!gitLink || gitLink.configured !== true) {
    errors.push(`${path}.git_link.configured: expected true from provider evidence`);
  } else {
    if (gitLink.repository !== project.repository) {
      errors.push(`${path}.git_link.repository: must equal project repository`);
    }
    if (gitLink.production_branch !== "main") {
      errors.push(`${path}.git_link.production_branch: expected main`);
    }
    for (const key of ["pr_push_creates_preview", "main_push_creates_production", "main_push_creates_staging"]) {
      if (gitLink[key] !== true) {
        errors.push(`${path}.git_link.${key}: expected true from observed deployment history`);
      }
    }
  }

  validateDeployment(project.staging_deployment, "staging", project.source_sha, `${path}.staging_deployment`, errors);
  validateDeployment(project.production_deployment, "production", project.source_sha, `${path}.production_deployment`, errors);

  const expectedDomain = CANONICAL_PROJECTS.get(project.repository);
  if (!project.production_deployment?.aliases?.includes(expectedDomain)) {
    errors.push(`${path}.production_deployment.aliases: missing canonical production domain ${expectedDomain}`);
  }

  validateRollback(project, path, errors);

  const verification = project.production_verification;
  if (!verification || typeof verification !== "object") {
    errors.push(`${path}.production_verification: object is required`);
  } else {
    for (const key of [
      "provider_provenance",
      "production_alias_binding",
      "exact_source_matches_main",
      "http_boundary",
      "authenticated_functional_contract",
      "runtime_warning_free",
      "overall",
    ]) {
      requireBoolean(verification, key, `${path}.production_verification`, errors);
    }
    if (verification.overall === true) {
      const required = [
        verification.provider_provenance,
        verification.production_alias_binding,
        verification.exact_source_matches_main,
        verification.http_boundary,
        verification.authenticated_functional_contract,
        verification.runtime_warning_free,
      ];
      if (!required.every(Boolean)) {
        errors.push(`${path}.production_verification.overall: cannot be true while a required proof is false`);
      }
      if (project.runtime_evidence?.runtime_error_free !== true) {
        errors.push(`${path}.runtime_evidence.runtime_error_free: production verification requires true`);
      }
    }
  }
}

function validateReleaseCandidate(candidate, index, errors) {
  const path = `$.release_candidates[${index}]`;
  if (!REPOSITORY.test(candidate.repository ?? "")) {
    errors.push(`${path}.repository: invalid owner/repository`);
  }
  if (!SHA40.test(candidate.source_sha ?? "")) {
    errors.push(`${path}.source_sha: expected exact 40-hex commit`);
  }
  const preview = candidate.preview_deployment;
  if (!preview || !DEPLOYMENT_ID.test(preview.id ?? "")) {
    errors.push(`${path}.preview_deployment.id: invalid deployment id`);
  } else {
    if (preview.target !== null) {
      errors.push(`${path}.preview_deployment.target: PR preview target must be null`);
    }
    if (preview.source_sha !== candidate.source_sha) {
      errors.push(`${path}.preview_deployment.source_sha: must equal candidate source_sha`);
    }
  }
  for (const run of candidate.ci_runs ?? []) {
    if (run.source_sha !== candidate.source_sha) {
      errors.push(`${path}.ci_runs: every run must bind to candidate source_sha`);
    }
    if (run.conclusion !== "success") {
      errors.push(`${path}.ci_runs: recorded release-candidate run must be successful`);
    }
  }
  const gateKeys = [
    "independent_exact_head_review",
    "staging_exact_head_verified",
    "database_compatibility_verified",
    "production_authorization",
  ];
  const gates = gateKeys.map((key) => requireBoolean(candidate, key, path, errors));
  if (candidate.release_verdict === "READY_FOR_PRODUCTION_AUTHORIZATION" && !gates.slice(0, 3).every(Boolean)) {
    errors.push(`${path}.release_verdict: readiness requires review, staging, and database compatibility`);
  }
  if (candidate.release_verdict === "AUTHORIZED_FOR_PRODUCTION" && !gates.every(Boolean)) {
    errors.push(`${path}.release_verdict: authorization requires every gate`);
  }
  if (!["NOT_READY", "READY_FOR_PRODUCTION_AUTHORIZATION", "AUTHORIZED_FOR_PRODUCTION"].includes(candidate.release_verdict)) {
    errors.push(`${path}.release_verdict: invalid verdict`);
  }
}

export function validateManifestObject(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["$: manifest must be an object"];
  }
  if (manifest.schema_version !== "1.0.0") {
    errors.push("$.schema_version: expected 1.0.0");
  }
  if (!["provider_observation", "release_candidate", "production_release"].includes(manifest.manifest_kind)) {
    errors.push("$.manifest_kind: invalid kind");
  }
  if (!validDateTime(manifest.observed_at) || !validDateTime(manifest.verified_at)) {
    errors.push("$: observed_at and verified_at must be date-time values");
  }
  if (!TEAM_ID.test(manifest.team?.id ?? "")) {
    errors.push("$.team.id: invalid Vercel team id");
  }
  if (manifest.authorized_by !== null || manifest.authorized_at !== null) {
    errors.push("$: this provider observation must not claim production authorization");
  }
  if (manifest.release_model?.production_mutation_performed_by_this_manifest !== false) {
    errors.push("$.release_model.production_mutation_performed_by_this_manifest: expected false");
  }
  if (manifest.release_model?.merge_is_production_sensitive !== true) {
    errors.push("$.release_model.merge_is_production_sensitive: expected true");
  }
  for (const environment of ["development", "preview", "staging", "production"]) {
    if (!manifest.environment_matrix?.[environment]) {
      errors.push(`$.environment_matrix.${environment}: explicit environment record is required`);
    }
  }
  if (!Array.isArray(manifest.projects) || manifest.projects.length !== CANONICAL_PROJECTS.size) {
    errors.push(`$.projects: expected exactly ${CANONICAL_PROJECTS.size} canonical projects`);
  } else {
    manifest.projects.forEach((project, index) => validateProject(project, index, errors));
    const repositories = new Set(manifest.projects.map((project) => project.repository));
    for (const repository of CANONICAL_PROJECTS.keys()) {
      if (!repositories.has(repository)) {
        errors.push(`$.projects: missing ${repository}`);
      }
    }
  }
  if (!Array.isArray(manifest.release_candidates)) {
    errors.push("$.release_candidates: array is required");
  } else {
    manifest.release_candidates.forEach((candidate, index) => validateReleaseCandidate(candidate, index, errors));
  }
  if (manifest.drift_detection?.current_production_source_matches_canonical_main !== true) {
    errors.push("$.drift_detection.current_production_source_matches_canonical_main: expected true");
  }
  if (manifest.drift_detection?.current_production_aliases_resolve_to_recorded_deployments !== true) {
    errors.push("$.drift_detection.current_production_aliases_resolve_to_recorded_deployments: expected true");
  }
  inspectForCredentials(manifest, "$", errors);
  return errors;
}

export function validateWorkflowText(workflowText) {
  const errors = [];
  if (!/^\s*pull_request\s*:/m.test(workflowText)) {
    errors.push("workflow: pull_request trigger is required");
  }
  if (!/^\s*workflow_dispatch\s*:/m.test(workflowText)) {
    errors.push("workflow: workflow_dispatch trigger is required");
  }
  if (/^\s*push\s*:/m.test(workflowText)) {
    errors.push("workflow: push trigger is forbidden because main is production-sensitive");
  }
  if (/pull_request_target\s*:/m.test(workflowText)) {
    errors.push("workflow: pull_request_target is forbidden");
  }
  if (!/contents:\s*read/m.test(workflowText)) {
    errors.push("workflow: contents permission must be read-only");
  }
  if (!/persist-credentials:\s*false/m.test(workflowText)) {
    errors.push("workflow: checkout credentials must not persist");
  }

  const expectedActionRefs = new Set([
    "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
    "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  ]);
  const actionRefs = [
    ...workflowText.matchAll(/^\s*uses:\s*([^#\s]+)(?:\s+#.*)?$/gm),
  ].map((match) => match[1]);
  if (actionRefs.length !== expectedActionRefs.size) {
    errors.push(
      `workflow: expected exactly ${expectedActionRefs.size} approved immutable action references`,
    );
  }
  for (const actionRef of actionRefs) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/.test(actionRef)) {
      errors.push(`workflow: action reference must use a full immutable commit SHA (${actionRef})`);
    }
    if (!expectedActionRefs.has(actionRef)) {
      errors.push(`workflow: unapproved action reference (${actionRef})`);
    }
  }
  for (const expectedActionRef of expectedActionRefs) {
    if (!actionRefs.includes(expectedActionRef)) {
      errors.push(`workflow: missing approved action reference (${expectedActionRef})`);
    }
  }

  if (!/github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha/.test(workflowText)) {
    errors.push("workflow: checkout must bind to exact PR head or workflow SHA");
  }
  if (/\$\{\{\s*secrets\./.test(workflowText)) {
    errors.push("workflow: release evidence verification must not receive repository secrets");
  }
  const forbiddenMutations = [
    /\bvercel\s+deploy\b/i,
    /\bvercel\s+promote\b/i,
    /\bvercel\s+alias\b/i,
    /\bvercel\s+rollback\b/i,
    /--prod\b/i,
    /api\.vercel\.com\/v\d+\/(?:deployments|aliases)/i,
  ];
  for (const pattern of forbiddenMutations) {
    if (pattern.test(workflowText)) {
      errors.push(`workflow: production/provider mutation command is forbidden (${pattern})`);
    }
  }
  return errors;
}

export function verifyEvidenceFiles({
  root = DEFAULT_ROOT,
  manifestPath = DEFAULT_MANIFEST,
  sidecarPath = DEFAULT_SIDECAR,
  schemaPath = DEFAULT_SCHEMA,
  workflowPath = DEFAULT_WORKFLOW,
} = {}) {
  const errors = [];
  const manifestText = readFileSync(resolve(root, manifestPath), "utf8");
  const manifest = JSON.parse(manifestText);
  const sidecar = readFileSync(resolve(root, sidecarPath), "utf8").trim();
  const schema = JSON.parse(readFileSync(resolve(root, schemaPath), "utf8"));
  const workflowText = readFileSync(resolve(root, workflowPath), "utf8");

  const sidecarMatch = /^([0-9a-f]{64})\s{2}([A-Za-z0-9_.-]+)$/.exec(sidecar);
  if (!sidecarMatch) {
    errors.push("sidecar: expected '<sha256><two spaces><filename>'");
  } else {
    const [, recordedDigest, recordedName] = sidecarMatch;
    const expectedName = manifestPath.split("/").at(-1);
    if (recordedName !== expectedName) {
      errors.push(`sidecar: expected filename ${expectedName}`);
    }
    const actualDigest = sha256(manifestText);
    if (recordedDigest !== actualDigest) {
      errors.push(`sidecar: digest mismatch; expected ${actualDigest}`);
    }
  }

  if (schema?.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    errors.push("schema: expected JSON Schema draft 2020-12");
  }
  errors.push(...validateManifestObject(manifest));
  errors.push(...validateWorkflowText(workflowText));
  return { errors, manifest };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--root") {
      options.root = resolve(value);
      index += 1;
    } else if (flag === "--manifest") {
      options.manifestPath = value;
      index += 1;
    } else if (flag === "--sidecar") {
      options.sidecarPath = value;
      index += 1;
    } else if (flag === "--schema") {
      options.schemaPath = value;
      index += 1;
    } else if (flag === "--workflow") {
      options.workflowPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { errors, manifest } = verifyEvidenceFiles(options);
  if (errors.length > 0) {
    console.error("Vercel release evidence verification failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Verified ${manifest.release_id}`);
  console.log(`Projects: ${manifest.projects.length}`);
  console.log(`Manifest SHA-256: ${sha256(readFileSync(resolve(options.root ?? DEFAULT_ROOT, options.manifestPath ?? DEFAULT_MANIFEST), "utf8"))}`);
  console.log("Production mutation: none");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main();
}
