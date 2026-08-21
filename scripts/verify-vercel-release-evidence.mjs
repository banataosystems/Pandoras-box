#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ORIGINS = new Set([
  "SOURCE_CONTROLLED",
  "GITHUB_PROVIDER",
  "VERCEL_PROVIDER",
  "SUPABASE_PROVIDER",
  "INDEPENDENT_REVIEWER",
  "OWNER_AUTHORIZATION",
]);

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{20,}$/;
const PROJECT_ID = /^prj_[A-Za-z0-9]{20,}$/;
const WORKER4_REPOSITORY = "banataosystems/Pandoras-box";
const WORKER4_BRANCH = "release/vercel-promotion-recovery-20260819";
const WORKER4_PR = 58;
const MCPMASTER_PROJECT = "prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk";
const MEMORY_PROJECT = "prj_brg3BJDcHfSftHH84NhnFtDJAnDO";

const SELF_AUTHORED_POSITIVE_KEYS = new Set([
  "ready",
  "authorized",
  "approved",
  "qualified",
  "rehearsed",
  "production_verified",
  "provider_provenance",
  "independent_review_pass",
  "owner_authorization",
  "release_ready",
]);
const SECRET_KEYS = new Set([
  "password",
  "client_secret",
  "private_key",
  "service_role_key",
  "access_token",
  "refresh_token",
  "api_key",
  "authorization_header",
]);
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bpostgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
];

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDateTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function scanSecrets(value, path = "$", errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecrets(item, `${path}[${index}]`, errors));
    return errors;
  }
  if (isObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEYS.has(key.toLowerCase())) {
        errors.push(`${path}.${key}: credential-bearing key is forbidden`);
      }
      scanSecrets(nested, `${path}.${key}`, errors);
    }
    return errors;
  }
  if (typeof value === "string") {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(value)) errors.push(`${path}: credential-shaped material is forbidden`);
    }
  }
  return errors;
}

function scanSelfAuthoredPositiveClaims(value, path = "$", errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSelfAuthoredPositiveClaims(item, `${path}[${index}]`, errors));
    return errors;
  }
  if (!isObject(value)) return errors;
  for (const [key, nested] of Object.entries(value)) {
    if (SELF_AUTHORED_POSITIVE_KEYS.has(key.toLowerCase()) && nested === true) {
      errors.push(`${path}.${key}: source-controlled positive trust claim is forbidden`);
    }
    scanSelfAuthoredPositiveClaims(nested, `${path}.${key}`, errors);
  }
  return errors;
}

function validateHttpsUrl(value, path, errors, { vercel = false } = {}) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") errors.push(`${path}: HTTPS is required`);
    if (vercel && !parsed.hostname.endsWith(".vercel.app")) {
      errors.push(`${path}: expected a vercel.app hostname`);
    }
  } catch {
    errors.push(`${path}: invalid URL`);
  }
}

export function validateSourceCandidate(candidate) {
  const errors = [];
  if (!isObject(candidate)) return ["$: source candidate must be an object"];
  if (candidate.schema_version !== "2.0.0") errors.push("$.schema_version: expected 2.0.0");
  if (candidate.kind !== "source_controlled_release_candidate") {
    errors.push("$.kind: expected source_controlled_release_candidate");
  }
  if (candidate.repository !== WORKER4_REPOSITORY) errors.push("$.repository: canonical repository mismatch");
  if (candidate.pull_request !== WORKER4_PR) errors.push("$.pull_request: expected PR 58");
  if (candidate.branch !== WORKER4_BRANCH) errors.push("$.branch: Worker 4 branch mismatch");
  if (!SHA40.test(candidate.base_sha ?? "")) errors.push("$.base_sha: exact base SHA is required");
  if (candidate.release_scope !== "release_infrastructure_only") {
    errors.push("$.release_scope: only release_infrastructure_only is allowed");
  }
  if (candidate.production_mutation_allowed !== false) {
    errors.push("$.production_mutation_allowed: must be false");
  }
  if (candidate.production_authorization_present !== false) {
    errors.push("$.production_authorization_present: source may not claim authorization");
  }

  const mcp = candidate.canonical_targets?.mcpmaster;
  const memory = candidate.canonical_targets?.memory;
  if (!isObject(mcp) || !isObject(memory)) {
    errors.push("$.canonical_targets: mcpmaster and memory are required");
  } else {
    const expected = [
      ["mcpmaster", mcp, WORKER4_REPOSITORY, MCPMASTER_PROJECT, "https://mcpmaster.vercel.app"],
      ["memory", memory, "banataosystems/pandoras-box-memory", MEMORY_PROJECT, "https://pandorasbox-memory.vercel.app"],
    ];
    for (const [name, target, repository, projectId, alias] of expected) {
      if (target.repository !== repository) errors.push(`$.canonical_targets.${name}.repository: mismatch`);
      if (target.vercel_project_id !== projectId || !PROJECT_ID.test(target.vercel_project_id ?? "")) {
        errors.push(`$.canonical_targets.${name}.vercel_project_id: mismatch`);
      }
      if (target.production_branch !== "main") errors.push(`$.canonical_targets.${name}.production_branch: expected main`);
      if (target.production_alias !== alias) errors.push(`$.canonical_targets.${name}.production_alias: mismatch`);
      validateHttpsUrl(target.production_alias, `$.canonical_targets.${name}.production_alias`, errors, { vercel: true });
      validateHttpsUrl(target.rehearsal_rollback_alias, `$.canonical_targets.${name}.rehearsal_rollback_alias`, errors, { vercel: true });
    }
  }

  if (!Array.isArray(candidate.critical_routes) || candidate.critical_routes.length < 3) {
    errors.push("$.critical_routes: explicit route contracts are required");
  }
  const expectedComponents = [
    "database",
    "edge_functions",
    "auth",
    "secrets_config",
    "jobs_queues",
    "other_provider_state",
  ];
  if (JSON.stringify(candidate.stateful_components) !== JSON.stringify(expectedComponents)) {
    errors.push("$.stateful_components: exact six-component inventory is required");
  }
  for (const origin of [
    "GITHUB_PROVIDER",
    "VERCEL_PROVIDER",
    "SUPABASE_PROVIDER",
    "INDEPENDENT_REVIEWER",
    "OWNER_AUTHORIZATION",
  ]) {
    if (!candidate.required_external_origins?.includes(origin)) {
      errors.push(`$.required_external_origins: missing ${origin}`);
    }
  }
  if (!Array.isArray(candidate.allowed_changed_path_prefixes) || candidate.allowed_changed_path_prefixes.length < 5) {
    errors.push("$.allowed_changed_path_prefixes: Worker 4 path allowlist is required");
  }
  scanSelfAuthoredPositiveClaims(candidate, "$", errors);
  scanSecrets(candidate, "$", errors);
  return errors;
}

function receiptPayloadHash(item) {
  return sha256(JSON.stringify(item.payload));
}

function validateReceipt(item, index, expectedSha, nowMs, errors) {
  const path = `$.evidence[${index}]`;
  if (!isObject(item)) {
    errors.push(`${path}: receipt must be an object`);
    return;
  }
  if (!ORIGINS.has(item.origin)) errors.push(`${path}.origin: invalid provenance class`);
  if (!isObject(item.issuer) || typeof item.issuer.identity !== "string" || typeof item.issuer.transport !== "string") {
    errors.push(`${path}.issuer: explicit identity and transport are required`);
  }
  if (item.subject_sha !== expectedSha) errors.push(`${path}.subject_sha: exact candidate SHA mismatch`);
  if (!validDateTime(item.observed_at) || !validDateTime(item.expires_at)) {
    errors.push(`${path}: valid observed_at and expires_at are required`);
  } else {
    const observed = Date.parse(item.observed_at);
    const expires = Date.parse(item.expires_at);
    if (observed > nowMs + 120_000) errors.push(`${path}.observed_at: future observation is forbidden`);
    if (expires <= observed) errors.push(`${path}.expires_at: must follow observed_at`);
    if (expires < nowMs) errors.push(`${path}.expires_at: provider evidence is stale`);
  }
  if (!isObject(item.receipt) || !SHA256.test(item.receipt.sha256 ?? "")) {
    errors.push(`${path}.receipt.sha256: exact payload digest is required`);
  } else if (item.receipt.sha256 !== receiptPayloadHash(item)) {
    errors.push(`${path}.receipt.sha256: payload digest mismatch`);
  }
  if (typeof item.receipt?.locator !== "string" || item.receipt.locator.length < 8) {
    errors.push(`${path}.receipt.locator: durable provider locator is required`);
  }
  scanSecrets(item, path, errors);
}

function evidenceByClass(packet, evidenceClass) {
  return (packet.evidence ?? []).filter((item) => item.evidence_class === evidenceClass);
}

function requireReceipt(packet, evidenceClass, errors) {
  const items = evidenceByClass(packet, evidenceClass);
  if (items.length !== 1) {
    errors.push(`${evidenceClass}: expected exactly one receipt, found ${items.length}`);
    return null;
  }
  return items[0];
}

function validateCandidate(packet, expectedSha, errors) {
  const candidate = packet.candidate;
  if (!isObject(candidate)) {
    errors.push("$.candidate: object is required");
    return;
  }
  if (candidate.repository !== WORKER4_REPOSITORY) errors.push("$.candidate.repository: mismatch");
  if (candidate.pull_request !== WORKER4_PR) errors.push("$.candidate.pull_request: expected 58");
  if (candidate.branch !== WORKER4_BRANCH) errors.push("$.candidate.branch: mismatch");
  if (!SHA40.test(candidate.sha ?? "")) errors.push("$.candidate.sha: exact commit SHA is required");
  if (expectedSha && candidate.sha !== expectedSha) errors.push("$.candidate.sha: candidate moved after evidence capture");
  if (!SHA40.test(candidate.tree_sha ?? "")) errors.push("$.candidate.tree_sha: exact tree SHA is required");
  if (!SHA40.test(candidate.base_sha ?? "")) errors.push("$.candidate.base_sha: exact base SHA is required");
  if (!validDateTime(candidate.observed_at)) errors.push("$.candidate.observed_at: valid date-time is required");
}

function validatePreview(packet, errors) {
  const item = requireReceipt(packet, "candidate_preview_deployment", errors);
  if (!item) return null;
  if (item.origin !== "VERCEL_PROVIDER") errors.push("candidate preview: origin must be VERCEL_PROVIDER");
  if (item.issuer?.identity !== "vercel[bot]" || item.issuer?.transport !== "github_status_and_comment") {
    errors.push("candidate preview: exact Vercel bot issuer and transport are required");
  }
  if (item.trust_effect !== "SATISFIES_EXTERNAL_GATE") {
    errors.push("candidate preview: provider trust effect is required");
  }
  const p = item.payload ?? {};
  if (p.project_id !== MCPMASTER_PROJECT) errors.push("candidate preview: project ID mismatch");
  if (!DEPLOYMENT_ID.test(p.deployment_id ?? "")) errors.push("candidate preview: deployment ID is invalid");
  if (p.git_sha !== packet.candidate.sha) errors.push("candidate preview: Git SHA mismatch");
  if (p.target !== null) errors.push("candidate preview: target must be null");
  if (p.state !== "READY") errors.push("candidate preview: provider state must be READY");
  if (p.source !== "git") errors.push("candidate preview: source must be git");
  if (p.branch !== WORKER4_BRANCH) errors.push("candidate preview: branch mismatch");
  if (p.pr_number !== WORKER4_PR) errors.push("candidate preview: PR mismatch");
  validateHttpsUrl(p.url, "candidate preview.url", errors, { vercel: true });
  return item;
}

function routeSemanticPass(p) {
  if (p.semantic_contract === "healthy_json") {
    return p.status === 200 && p.content_type?.includes("application/json") && p.parsed_body?.status === "healthy";
  }
  if (p.semantic_contract === "unauthenticated_bearer_boundary") {
    return p.status === 401 && p.content_type?.includes("application/json") &&
      p.www_authenticate?.toLowerCase().includes("bearer") && p.parsed_body?.error?.code === -32001;
  }
  if (p.semantic_contract === "oauth_resource_metadata") {
    return p.status === 200 && p.content_type?.includes("application/json") &&
      typeof p.parsed_body?.resource === "string" && Array.isArray(p.parsed_body?.authorization_servers);
  }
  return false;
}

function validateRouteProbes(packet, errors) {
  const expected = [
    ["candidate", "GET", "/health", "healthy_json"],
    ["candidate", "GET", "/mcp", "unauthenticated_bearer_boundary"],
    ["candidate", "POST", "/mcp", "unauthenticated_bearer_boundary"],
    ["candidate", "GET", "/.well-known/oauth-protected-resource/mcp", "oauth_resource_metadata"],
    ["rollback", "GET", "/health", "healthy_json"],
    ["rollback", "GET", "/mcp", "unauthenticated_bearer_boundary"],
    ["rollback", "POST", "/mcp", "unauthenticated_bearer_boundary"],
    ["rollback", "GET", "/.well-known/oauth-protected-resource/mcp", "oauth_resource_metadata"],
  ];
  const items = evidenceByClass(packet, "route_probe");
  for (const [surface, method, route, contract] of expected) {
    const matches = items.filter((item) => {
      const p = item.payload ?? {};
      return p.surface === surface && p.method === method && p.route === route;
    });
    const label = `${surface} ${method} ${route}`;
    if (matches.length !== 1) {
      errors.push(`${label}: expected exactly one route receipt`);
      continue;
    }
    const item = matches[0];
    if (item.origin !== "GITHUB_PROVIDER" || item.issuer?.identity !== "github-actions" || item.issuer?.transport !== "live_http") {
      errors.push(`${label}: exact GitHub Actions live-HTTP issuer is required`);
    }
    const p = item.payload;
    if (p.semantic_contract !== contract) errors.push(`${label}: semantic contract mismatch`);
    if (!routeSemanticPass(p)) errors.push(`${label}: handler semantics were not proven`);
    if (p.semantics_proven !== true) errors.push(`${label}: collector did not mark semantics proven`);
    if (p.rewrite_ambiguous !== false) errors.push(`${label}: rewrite ambiguity is unresolved`);
    if (p.status === 401 && p.authenticated_acceptance !== false) {
      errors.push(`${label}: unauthenticated boundary cannot prove authenticated acceptance`);
    }
    if (method === "GET" && p.status === 405) errors.push(`${label}: GET 405 cannot prove POST semantics`);
  }
  return expected.length;
}

function validateStatefulMatrix(packet, errors) {
  const item = requireReceipt(packet, "stateful_change_matrix", errors);
  if (!item) return;
  if (item.origin !== "GITHUB_PROVIDER" || item.issuer?.identity !== "github-api") {
    errors.push("stateful change matrix: GitHub API origin is required");
  }
  if ((item.payload?.disallowed ?? []).length !== 0) {
    errors.push("stateful change matrix: Worker 4 scope collision detected");
  }
  const classes = item.payload?.classifications ?? {};
  for (const component of [
    "database",
    "edge_functions",
    "auth",
    "secrets_config",
    "jobs_queues",
    "other_provider_state",
  ]) {
    if (classes[component] !== "NOT_APPLICABLE") {
      errors.push(`stateful change matrix.${component}: release-infrastructure-only candidate changed runtime state`);
    }
  }
}

function validateBlockedRehearsal(packet, preview, errors) {
  const item = requireReceipt(packet, "rollback_rehearsal", errors);
  if (!item) return;
  if (item.origin !== "GITHUB_PROVIDER" || item.issuer?.identity !== "github-actions") {
    errors.push("rollback route comparison: GitHub Actions origin is required");
  }
  if (item.trust_effect !== "DESCRIBES_ROUTE_COMPARISON_ONLY") {
    errors.push("rollback route comparison: must not satisfy the rehearsal gate");
  }
  const p = item.payload ?? {};
  if (p.mode !== "parallel_read_only_non_production") errors.push("rollback route comparison: mode mismatch");
  if (p.result !== "BLOCKED") errors.push("rollback route comparison: result must remain BLOCKED");
  if (p.route_semantics_result !== "PASS") errors.push("rollback route comparison: route semantics must be recorded separately");
  if (p.candidate_sha !== packet.candidate.sha) errors.push("rollback route comparison: candidate SHA mismatch");
  if (p.candidate_deployment_id !== preview?.payload?.deployment_id) {
    errors.push("rollback route comparison: candidate deployment mismatch");
  }
  if (p.rollback_deployment_id !== null) errors.push("rollback route comparison: rollback deployment may not be self-declared");
  if (p.transition_performed !== false || p.restoration_performed !== false || p.alias_transition_performed !== false) {
    errors.push("rollback route comparison: no transition or restoration may be claimed");
  }
  if (p.rollback_qualified !== false || p.qualification_effect !== false) {
    errors.push("rollback route comparison: qualification must remain false");
  }
  if (p.production_mutation !== false) errors.push("rollback route comparison: production mutation is forbidden");
}

export function hardenGithubProviderPacket(packet, { expectedSha = null } = {}) {
  const clone = structuredClone(packet);
  const changes = [];
  if (expectedSha && clone.candidate?.sha !== expectedSha) {
    throw new Error(`candidate moved: ${clone.candidate?.sha ?? "missing"} != ${expectedSha}`);
  }
  const rehearsal = evidenceByClass(clone, "rollback_rehearsal")[0];
  if (!rehearsal) throw new Error("rollback_rehearsal record is required for hardening");
  const routeItems = evidenceByClass(clone, "route_probe");
  const routePass = routeItems.length >= 8 && routeItems.every((item) => routeSemanticPass(item.payload ?? {}) && item.payload?.rewrite_ambiguous === false);
  const preview = evidenceByClass(clone, "candidate_preview_deployment")[0];
  rehearsal.trust_effect = "DESCRIBES_ROUTE_COMPARISON_ONLY";
  rehearsal.payload = {
    ...rehearsal.payload,
    result: "BLOCKED",
    route_semantics_result: routePass ? "PASS" : "FAIL",
    candidate_deployment_id: preview?.payload?.deployment_id ?? null,
    rollback_deployment_id: null,
    transition_performed: false,
    restoration_performed: false,
    alias_transition_performed: false,
    rollback_qualified: false,
    qualification_effect: false,
    production_mutation: false,
    limitation: "Parallel route comparison is not a rollback rehearsal. A separate authenticated Vercel receipt must bind the rollback deployment, transition, post-transition probes, and restoration before rehearsal can PASS.",
  };
  rehearsal.receipt.sha256 = receiptPayloadHash(rehearsal);
  clone.derived = {
    ...clone.derived,
    rollback_route_comparison_pass: routePass,
    rollback_rehearsal_pass: false,
    rollback_provider_identity_present: false,
    owner_authorization_present: false,
    release_decision: "NOT_READY",
    reason: "External Vercel production and rollback receipts, a real non-production transition/restoration rehearsal, independent exact-head review, and owner authorization are not issuable by candidate CI.",
  };
  changes.push("downgraded_route_comparison_from_rehearsal_pass_to_blocked");
  changes.push("recomputed_rehearsal_receipt_digest");
  changes.push("forced_external_release_gates_absent");
  return { packet: clone, changes };
}

export function evaluateGithubProviderPacket(packet, { expectedSha = null, now = new Date() } = {}) {
  const errors = [];
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!isObject(packet)) return { errors: ["$: packet must be an object"], decision: "INVALID" };
  if (packet.packet_version !== "2.0.0") errors.push("$.packet_version: expected 2.0.0");
  validateCandidate(packet, expectedSha, errors);
  if (!Array.isArray(packet.evidence)) errors.push("$.evidence: array is required");
  else packet.evidence.forEach((item, index) => validateReceipt(item, index, packet.candidate?.sha, nowMs, errors));
  scanSecrets(packet, "$", errors);
  const preview = validatePreview(packet, errors);
  validateRouteProbes(packet, errors);
  validateStatefulMatrix(packet, errors);
  validateBlockedRehearsal(packet, preview, errors);

  for (const forbiddenClass of [
    "production_binding:mcpmaster",
    "production_binding:memory",
    "rollback_target",
    "owner_authorization",
  ]) {
    if (evidenceByClass(packet, forbiddenClass).length > 0) {
      errors.push(`${forbiddenClass}: candidate CI may not manufacture this external gate`);
    }
  }
  if (packet.derived?.release_decision !== "NOT_READY") {
    errors.push("$.derived.release_decision: candidate CI must remain NOT_READY");
  }
  if (packet.derived?.rollback_rehearsal_pass !== false) {
    errors.push("$.derived.rollback_rehearsal_pass: must remain false");
  }
  if (packet.derived?.rollback_provider_identity_present !== false) {
    errors.push("$.derived.rollback_provider_identity_present: must remain false");
  }
  if (packet.derived?.owner_authorization_present !== false) {
    errors.push("$.derived.owner_authorization_present: must remain false");
  }
  return {
    errors,
    decision: errors.length === 0 ? "NOT_READY_EXTERNAL_GATES_REQUIRED" : "INVALID",
    gates: {
      exact_candidate_preview: Boolean(preview) && errors.length === 0,
      route_semantics_compared: errors.length === 0,
      rollback_rehearsal: false,
      provider_bound_rollback: false,
      independent_review: false,
      owner_authorization: false,
    },
  };
}

export function evaluateExternalPacket(_packet, _options = {}) {
  return {
    errors: [
      "Source-controlled code is not an authorization authority. Provider bindings, rollback qualification, rehearsal, independent review, and owner authorization must be evaluated by the independent control plane from fresh provider receipts.",
    ],
    decision: "INDEPENDENT_CONTROL_PLANE_REQUIRED",
  };
}

export function validateWorkflowText(workflow) {
  const errors = [];
  if (!/^\s*pull_request\s*:/m.test(workflow)) errors.push("workflow: pull_request trigger is required");
  if (!/^\s*workflow_dispatch\s*:/m.test(workflow)) errors.push("workflow: workflow_dispatch trigger is required");
  if (/^\s*push\s*:/m.test(workflow)) errors.push("workflow: push trigger is forbidden");
  if (/pull_request_target\s*:/m.test(workflow)) errors.push("workflow: pull_request_target is forbidden");
  if (/\$\{\{\s*secrets\./.test(workflow)) errors.push("workflow: repository secrets are forbidden");
  if (!/persist-credentials:\s*false/.test(workflow)) errors.push("workflow: checkout credentials must not persist");
  if (!/github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha/.test(workflow)) {
    errors.push("workflow: literal exact-head checkout is required");
  }
  const actionPattern = /uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)/g;
  for (const match of workflow.matchAll(actionPattern)) {
    if (!SHA40.test(match[2])) errors.push(`workflow: ${match[1]} must use an immutable full commit SHA`);
  }
  const forbidden = [
    /\bvercel\s+(?:deploy|promote|alias|rollback)\b/i,
    /--prod\b/i,
    /api\.vercel\.com\/v\d+\/(?:deployments|aliases)/i,
    /\bgit\s+push\b/i,
    /\bgh\s+pr\s+merge\b/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(workflow)) errors.push(`workflow: provider or production mutation is forbidden (${pattern})`);
  }
  if (/paths:\s*\n/m.test(workflow)) errors.push("workflow: path filtering is forbidden for the release trust gate");
  const collectIndex = workflow.indexOf("--output release-evidence.github.json");
  const hardenIndex = workflow.indexOf("--mode harden-github");
  const verifyIndex = workflow.indexOf("--mode github");
  if (!(collectIndex >= 0 && hardenIndex > collectIndex && verifyIndex > hardenIndex)) {
    errors.push("workflow: collect -> harden -> verify ordering is required");
  }
  return errors;
}

export function verifyRepositoryFiles({ root = process.cwd() } = {}) {
  const candidatePath = resolve(root, "docs/releases/vercel/release-candidate.source.json");
  const schemaPath = resolve(root, "docs/releases/vercel/release-evidence.schema.json");
  const workflowPath = resolve(root, ".github/workflows/vercel-release-evidence.yml");
  const candidateText = readFileSync(candidatePath, "utf8");
  const candidate = JSON.parse(candidateText);
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const workflow = readFileSync(workflowPath, "utf8");
  const errors = [...validateSourceCandidate(candidate), ...validateWorkflowText(workflow)];
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    errors.push("schema: expected JSON Schema draft 2020-12");
  }
  if (schema.additionalProperties !== false) errors.push("schema: root additionalProperties must be false");
  if (schema.description?.includes("source-controlled") !== true) {
    errors.push("schema: trust-boundary description is required");
  }
  return { errors, candidate, source_sha256: sha256(candidateText) };
}

function parseArgs(argv) {
  const args = { mode: "repository", root: process.cwd(), packet: null, expectedSha: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--mode") args.mode = argv[++index];
    else if (flag === "--root") args.root = resolve(argv[++index]);
    else if (flag === "--packet") args.packet = resolve(argv[++index]);
    else if (flag === "--expected-sha") args.expectedSha = argv[++index];
    else if (flag === "--output") args.output = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "repository") {
    const result = verifyRepositoryFiles({ root: args.root });
    if (result.errors.length) {
      result.errors.forEach((error) => console.error(`- ${error}`));
      process.exitCode = 1;
      return;
    }
    console.log(`source_candidate_sha256=${result.source_sha256}`);
    console.log("source_can_authorize_release=false");
    console.log("production_mutation=none");
    return;
  }
  if (args.mode === "harden-github") {
    if (!args.packet) throw new Error("--packet is required");
    const inputText = readFileSync(args.packet, "utf8");
    const input = JSON.parse(inputText);
    const { packet, changes } = hardenGithubProviderPacket(input, { expectedSha: args.expectedSha });
    const outputText = JSON.stringify(packet, null, 2) + "\n";
    writeFileSync(args.packet, outputText);
    writeFileSync(`${args.packet}.sha256`, `${sha256(outputText)}  ${args.packet.split("/").at(-1)}\n`);
    const report = {
      input_sha256: sha256(inputText),
      output_sha256: sha256(outputText),
      candidate_sha: packet.candidate.sha,
      changes,
      decision: "NOT_READY_EXTERNAL_GATES_REQUIRED",
      production_mutation: false,
    };
    const reportText = JSON.stringify(report, null, 2) + "\n";
    if (args.output) writeFileSync(args.output, reportText);
    console.log(reportText.trim());
    return;
  }
  if (args.mode === "github") {
    if (!args.packet) throw new Error("--packet is required");
    const packet = JSON.parse(readFileSync(args.packet, "utf8"));
    const result = evaluateGithubProviderPacket(packet, { expectedSha: args.expectedSha });
    const text = JSON.stringify(result, null, 2) + "\n";
    if (args.output) writeFileSync(args.output, text);
    console.log(text.trim());
    if (result.errors.length) process.exitCode = 1;
    return;
  }
  if (args.mode === "external") {
    const result = evaluateExternalPacket(null);
    const text = JSON.stringify(result, null, 2) + "\n";
    if (args.output) writeFileSync(args.output, text);
    console.log(text.trim());
    process.exitCode = 1;
    return;
  }
  throw new Error(`Unsupported mode: ${args.mode}`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main();
