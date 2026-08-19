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
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REQUIRED_CANDIDATE_KEYS = new Set([
  "schema_version",
  "kind",
  "repository",
  "pull_request",
  "branch",
  "base_sha",
  "release_scope",
  "production_mutation_allowed",
  "production_authorization_present",
  "canonical_targets",
  "critical_routes",
  "stateful_components",
  "required_external_origins",
  "allowed_changed_path_prefixes",
]);
const POSITIVE_SELF_AUTHORED_KEYS = new Set([
  "ready",
  "authorized",
  "approved",
  "qualified",
  "rehearsed",
  "production_verified",
  "provider_provenance",
  "independent_review_pass",
  "owner_authorization",
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

function assertExactKeys(object, allowed, path, errors) {
  if (!isObject(object)) {
    errors.push(`${path}: expected object`);
    return;
  }
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field is not allowed`);
  }
  for (const key of allowed) {
    if (!(key in object)) errors.push(`${path}.${key}: required field is missing`);
  }
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

function scanPositiveSelfAuthoredClaims(value, path = "$", errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPositiveSelfAuthoredClaims(item, `${path}[${index}]`, errors));
    return errors;
  }
  if (!isObject(value)) return errors;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (POSITIVE_SELF_AUTHORED_KEYS.has(normalized) && nested === true) {
      errors.push(`${path}.${key}: source-controlled positive trust claim is forbidden`);
    }
    scanPositiveSelfAuthoredClaims(nested, `${path}.${key}`, errors);
  }
  return errors;
}

function validateUrl(value, path, errors, { vercel = false } = {}) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") errors.push(`${path}: HTTPS is required`);
    if (vercel && !url.hostname.endsWith(".vercel.app")) {
      errors.push(`${path}: expected a vercel.app URL`);
    }
  } catch {
    errors.push(`${path}: invalid URL`);
  }
}

export function validateSourceCandidate(candidate) {
  const errors = [];
  assertExactKeys(candidate, REQUIRED_CANDIDATE_KEYS, "$", errors);
  if (candidate.schema_version !== "2.0.0") errors.push("$.schema_version: expected 2.0.0");
  if (candidate.kind !== "source_controlled_release_candidate") {
    errors.push("$.kind: expected source_controlled_release_candidate");
  }
  if (candidate.repository !== "banataosystems/Pandoras-box") {
    errors.push("$.repository: unexpected canonical repository");
  }
  if (candidate.pull_request !== 58) errors.push("$.pull_request: expected 58");
  if (candidate.branch !== "release/vercel-promotion-recovery-20260819") {
    errors.push("$.branch: unexpected Worker 4 branch");
  }
  if (!SHA40.test(candidate.base_sha ?? "")) errors.push("$.base_sha: expected exact 40-hex SHA");
  if (candidate.release_scope !== "release_infrastructure_only") {
    errors.push("$.release_scope: only release_infrastructure_only is allowed in this lane");
  }
  if (candidate.production_mutation_allowed !== false) {
    errors.push("$.production_mutation_allowed: must be false");
  }
  if (candidate.production_authorization_present !== false) {
    errors.push("$.production_authorization_present: source may not claim authorization");
  }
  const targets = candidate.canonical_targets;
  if (!isObject(targets) || !isObject(targets.mcpmaster) || !isObject(targets.memory)) {
    errors.push("$.canonical_targets: mcpmaster and memory targets are required");
  } else {
    const expected = [
      ["mcpmaster", "banataosystems/Pandoras-box", "prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk", "https://mcpmaster.vercel.app"],
      ["memory", "banataosystems/pandoras-box-memory", "prj_brg3BJDcHfSftHH84NhnFtDJAnDO", "https://pandorasbox-memory.vercel.app"],
    ];
    for (const [name, repository, projectId, alias] of expected) {
      const target = targets[name];
      if (target.repository !== repository) errors.push(`$.canonical_targets.${name}.repository: mismatch`);
      if (target.vercel_project_id !== projectId || !PROJECT_ID.test(target.vercel_project_id ?? "")) {
        errors.push(`$.canonical_targets.${name}.vercel_project_id: mismatch`);
      }
      if (target.production_branch !== "main") errors.push(`$.canonical_targets.${name}.production_branch: expected main`);
      if (target.production_alias !== alias) errors.push(`$.canonical_targets.${name}.production_alias: mismatch`);
      validateUrl(target.production_alias, `$.canonical_targets.${name}.production_alias`, errors, { vercel: true });
      validateUrl(target.rehearsal_rollback_alias, `$.canonical_targets.${name}.rehearsal_rollback_alias`, errors, { vercel: true });
    }
  }
  if (!Array.isArray(candidate.critical_routes) || candidate.critical_routes.length < 3) {
    errors.push("$.critical_routes: at least three explicit route contracts are required");
  }
  if (!Array.isArray(candidate.stateful_components) || candidate.stateful_components.length !== 6) {
    errors.push("$.stateful_components: exact six-component inventory is required");
  }
  if (!Array.isArray(candidate.required_external_origins)) {
    errors.push("$.required_external_origins: array is required");
  } else {
    for (const origin of ["GITHUB_PROVIDER", "VERCEL_PROVIDER", "SUPABASE_PROVIDER", "INDEPENDENT_REVIEWER", "OWNER_AUTHORIZATION"]) {
      if (!candidate.required_external_origins.includes(origin)) {
        errors.push(`$.required_external_origins: missing ${origin}`);
      }
    }
  }
  scanPositiveSelfAuthoredClaims(candidate, "$", errors);
  scanSecrets(candidate, "$", errors);
  return errors;
}

function evidenceByClass(packet, evidenceClass) {
  return (packet.evidence ?? []).filter((item) => item.evidence_class === evidenceClass);
}

function validateReceipt(item, index, nowMs, errors) {
  const path = `$.evidence[${index}]`;
  if (!isObject(item)) {
    errors.push(`${path}: expected object`);
    return;
  }
  if (!ORIGINS.has(item.origin)) errors.push(`${path}.origin: invalid provenance class`);
  if (item.origin === "SOURCE_CONTROLLED" && item.trust_effect === "SATISFIES_EXTERNAL_GATE") {
    errors.push(`${path}: SOURCE_CONTROLLED evidence cannot satisfy an external gate`);
  }
  if (!validDateTime(item.observed_at) || !validDateTime(item.expires_at)) {
    errors.push(`${path}: observed_at and expires_at must be valid date-times`);
  } else {
    const observed = Date.parse(item.observed_at);
    const expires = Date.parse(item.expires_at);
    if (observed > nowMs + 120_000) errors.push(`${path}.observed_at: future observation is forbidden`);
    if (expires <= observed) errors.push(`${path}.expires_at: must be after observed_at`);
    if (expires < nowMs) errors.push(`${path}.expires_at: external evidence is stale`);
  }
  if (!isObject(item.issuer) || typeof item.issuer.identity !== "string" || item.issuer.identity.length < 2) {
    errors.push(`${path}.issuer: independently identifiable issuer is required`);
  }
  if (!isObject(item.receipt)) {
    errors.push(`${path}.receipt: external receipt is required`);
  } else {
    if (!SHA256.test(item.receipt.sha256 ?? "")) errors.push(`${path}.receipt.sha256: expected SHA-256`);
    if (typeof item.receipt.locator !== "string" || item.receipt.locator.length < 8) {
      errors.push(`${path}.receipt.locator: durable locator is required`);
    }
  }
  if (item.subject_sha !== null && item.subject_sha !== undefined && !SHA40.test(item.subject_sha)) {
    errors.push(`${path}.subject_sha: expected 40-hex SHA or null`);
  }
  scanSecrets(item, path, errors);
}

function validateCandidateIdentity(packet, expectedSha, errors) {
  const candidate = packet.candidate;
  if (!isObject(candidate)) {
    errors.push("$.candidate: object is required");
    return;
  }
  if (candidate.repository !== "banataosystems/Pandoras-box") errors.push("$.candidate.repository: mismatch");
  if (candidate.pull_request !== 58) errors.push("$.candidate.pull_request: expected 58");
  if (candidate.branch !== "release/vercel-promotion-recovery-20260819") errors.push("$.candidate.branch: mismatch");
  if (!SHA40.test(candidate.sha ?? "")) errors.push("$.candidate.sha: expected exact SHA");
  if (!SHA40.test(candidate.tree_sha ?? "")) errors.push("$.candidate.tree_sha: expected exact tree SHA");
  if (!SHA40.test(candidate.base_sha ?? "")) errors.push("$.candidate.base_sha: expected exact base SHA");
  if (expectedSha && candidate.sha !== expectedSha) errors.push("$.candidate.sha: candidate moved after evidence capture");
  if (!validDateTime(candidate.observed_at)) errors.push("$.candidate.observed_at: invalid date-time");
}

function requireOrigin(item, allowedOrigins, label, errors) {
  if (!item) {
    errors.push(`${label}: required evidence is absent`);
    return false;
  }
  if (!allowedOrigins.includes(item.origin)) {
    errors.push(`${label}: origin ${item.origin} cannot satisfy this gate`);
    return false;
  }
  return true;
}

function validateProviderPreview(packet, errors) {
  const item = evidenceByClass(packet, "candidate_preview_deployment")[0];
  if (!requireOrigin(item, ["VERCEL_PROVIDER"], "candidate preview", errors)) return false;
  const payload = item.payload ?? {};
  if (!DEPLOYMENT_ID.test(payload.deployment_id ?? "")) errors.push("candidate preview: invalid deployment id");
  if (payload.project_id !== "prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk") errors.push("candidate preview: wrong Vercel project");
  if (payload.git_sha !== packet.candidate.sha) errors.push("candidate preview: Git SHA mismatch");
  if (!(payload.target === null || payload.target === "preview")) errors.push("candidate preview: production/staging target is forbidden");
  if (payload.state !== "READY") errors.push("candidate preview: provider state is not READY");
  if (payload.source !== "git") errors.push("candidate preview: source must be git");
  validateUrl(payload.url, "candidate preview.url", errors, { vercel: true });
  return true;
}

function validateProductionBinding(packet, projectName, expectedProject, expectedRepo, expectedAlias, errors) {
  const item = evidenceByClass(packet, `production_binding:${projectName}`)[0];
  const label = `${projectName} production binding`;
  if (!requireOrigin(item, ["VERCEL_PROVIDER"], label, errors)) return false;
  const p = item.payload ?? {};
  if (p.project_id !== expectedProject) errors.push(`${label}: wrong project id`);
  if (p.repository !== expectedRepo) errors.push(`${label}: wrong repository`);
  if (p.branch !== "main") errors.push(`${label}: expected main branch`);
  if (!DEPLOYMENT_ID.test(p.deployment_id ?? "")) errors.push(`${label}: invalid deployment id`);
  if (!SHA40.test(p.git_sha ?? "")) errors.push(`${label}: invalid Git SHA`);
  if (p.target !== "production") errors.push(`${label}: target must be production`);
  if (p.state !== "READY") errors.push(`${label}: deployment must be READY`);
  if (p.source !== "git") errors.push(`${label}: deployment source must be git`);
  if (!Array.isArray(p.aliases) || !p.aliases.includes(expectedAlias)) errors.push(`${label}: canonical alias missing`);
  return true;
}

function validateRollback(packet, errors) {
  const item = evidenceByClass(packet, "rollback_target")[0];
  if (!requireOrigin(item, ["VERCEL_PROVIDER"], "rollback target", errors)) return false;
  const p = item.payload ?? {};
  if (!DEPLOYMENT_ID.test(p.deployment_id ?? "")) errors.push("rollback target: invalid deployment id");
  if (!SHA40.test(p.git_sha ?? "")) errors.push("rollback target: exact Git SHA is required");
  if (p.git_sha !== packet.candidate.base_sha) errors.push("rollback target: Git SHA must equal the provider-observed PR base SHA");
  if (p.state !== "READY") errors.push("rollback target: provider state must be READY");
  if (p.retrievable !== true) errors.push("rollback target: provider retrievability must be true");
  if (p.source !== "git") errors.push("rollback target: source must be git");
  if (!["staging", "production"].includes(p.target)) errors.push("rollback target: expected staging or production target");
  const stateful = evidenceByClass(packet, "stateful_change_matrix")[0];
  if (!requireOrigin(stateful, ["GITHUB_PROVIDER", "SUPABASE_PROVIDER"], "stateful change matrix", errors)) return false;
  const classifications = stateful.payload?.classifications ?? {};
  for (const component of ["database", "edge_functions", "auth", "secrets_config", "jobs_queues", "other_provider_state"]) {
    if (!['NOT_APPLICABLE', 'AUTOMATIC', 'MANUAL_BUT_VERIFIED'].includes(classifications[component])) {
      errors.push(`stateful change matrix.${component}: rollback-critical state is not safely classified`);
    }
  }
  return true;
}

function routeSemanticPass(probe) {
  const contract = probe.semantic_contract;
  if (contract === "healthy_json") {
    return probe.status === 200 && probe.content_type?.includes("application/json") && probe.parsed_body?.status === "healthy";
  }
  if (contract === "unauthenticated_bearer_boundary") {
    return probe.status === 401 && probe.content_type?.includes("application/json") &&
      probe.www_authenticate?.toLowerCase().includes("bearer") && probe.parsed_body?.error?.code === -32001;
  }
  if (contract === "oauth_resource_metadata") {
    return probe.status === 200 && probe.content_type?.includes("application/json") &&
      typeof probe.parsed_body?.resource === "string" && Array.isArray(probe.parsed_body?.authorization_servers);
  }
  return false;
}

function validateRouteEvidence(packet, errors) {
  const items = evidenceByClass(packet, "route_probe");
  const required = [
    ["candidate", "GET", "/health", "healthy_json"],
    ["candidate", "GET", "/mcp", "unauthenticated_bearer_boundary"],
    ["candidate", "POST", "/mcp", "unauthenticated_bearer_boundary"],
    ["candidate", "GET", "/.well-known/oauth-protected-resource/mcp", "oauth_resource_metadata"],
    ["rollback", "GET", "/health", "healthy_json"],
    ["rollback", "GET", "/mcp", "unauthenticated_bearer_boundary"],
    ["rollback", "POST", "/mcp", "unauthenticated_bearer_boundary"],
    ["rollback", "GET", "/.well-known/oauth-protected-resource/mcp", "oauth_resource_metadata"],
  ];
  for (const [surface, method, route, contract] of required) {
    const item = items.find((candidate) => {
      const p = candidate.payload ?? {};
      return p.surface === surface && p.method === method && p.route === route;
    });
    const label = `${surface} ${method} ${route}`;
    if (!requireOrigin(item, ["GITHUB_PROVIDER", "VERCEL_PROVIDER"], label, errors)) continue;
    const p = item.payload;
    if (p.semantic_contract !== contract) errors.push(`${label}: wrong semantic contract`);
    if (!routeSemanticPass(p)) errors.push(`${label}: handler semantics were not proven`);
    if (p.rewrite_ambiguous === true) errors.push(`${label}: rewrite ambiguity is unresolved`);
    if (p.method === "GET" && p.status === 405) errors.push(`${label}: GET 405 cannot prove POST semantics`);
    if (p.status === 401 && p.authenticated_acceptance === true) errors.push(`${label}: unauthenticated 401 cannot prove authenticated acceptance`);
  }
  return items.length >= required.length;
}

function validateIndependentReview(packet, errors) {
  const item = evidenceByClass(packet, "independent_review")[0];
  if (!item) return { present: false, pass: false };
  if (!requireOrigin(item, ["INDEPENDENT_REVIEWER"], "independent review", errors)) return { present: true, pass: false };
  const p = item.payload ?? {};
  if (p.subject_sha !== packet.candidate.sha || item.subject_sha !== packet.candidate.sha) {
    errors.push("independent review: stale or wrong candidate SHA");
  }
  if (p.reviewer_identity === packet.candidate.author_identity) {
    errors.push("independent review: reviewer is not independent from candidate author");
  }
  if (p.verdict !== "PASS") errors.push("independent review: PASS verdict is required");
  return { present: true, pass: p.verdict === "PASS" };
}

function validateOwnerAuthorization(packet, errors) {
  const item = evidenceByClass(packet, "owner_authorization")[0];
  if (!item) return { present: false, valid: false };
  if (!requireOrigin(item, ["OWNER_AUTHORIZATION"], "owner authorization", errors)) return { present: true, valid: false };
  const p = item.payload ?? {};
  if (p.subject_sha !== packet.candidate.sha || item.subject_sha !== packet.candidate.sha) {
    errors.push("owner authorization: exact candidate SHA mismatch");
  }
  if (p.target !== "production") errors.push("owner authorization: production target required");
  if (p.one_time !== true) errors.push("owner authorization: one-time scope required");
  if (p.revoked === true) errors.push("owner authorization: authorization is revoked");
  return { present: true, valid: p.subject_sha === packet.candidate.sha && p.target === "production" && p.one_time === true && p.revoked !== true };
}

export function evaluateExternalPacket(packet, { expectedSha = null, now = new Date() } = {}) {
  const errors = [];
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!isObject(packet)) return { errors: ["$: packet must be an object"], decision: "NOT_READY" };
  if (packet.packet_version !== "2.0.0") errors.push("$.packet_version: expected 2.0.0");
  validateCandidateIdentity(packet, expectedSha, errors);
  if (!Array.isArray(packet.evidence)) errors.push("$.evidence: array is required");
  else packet.evidence.forEach((item, index) => validateReceipt(item, index, nowMs, errors));
  scanSecrets(packet, "$", errors);

  const preview = validateProviderPreview(packet, errors);
  const productionMcp = validateProductionBinding(
    packet,
    "mcpmaster",
    "prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk",
    "banataosystems/Pandoras-box",
    "https://mcpmaster.vercel.app",
    errors,
  );
  const productionMemory = validateProductionBinding(
    packet,
    "memory",
    "prj_brg3BJDcHfSftHH84NhnFtDJAnDO",
    "banataosystems/pandoras-box-memory",
    "https://pandorasbox-memory.vercel.app",
    errors,
  );
  const rollback = validateRollback(packet, errors);
  const routes = validateRouteEvidence(packet, errors);
  const review = validateIndependentReview(packet, errors);
  const authorization = validateOwnerAuthorization(packet, errors);
  const rehearsal = evidenceByClass(packet, "rollback_rehearsal")[0];
  let rehearsalPass = false;
  if (rehearsal) {
    if (requireOrigin(rehearsal, ["GITHUB_PROVIDER", "VERCEL_PROVIDER", "INDEPENDENT_REVIEWER"], "rollback rehearsal", errors)) {
      const p = rehearsal.payload ?? {};
      rehearsalPass = p.mode === "parallel_read_only_non_production" && p.result === "PASS" &&
        p.production_mutation === false && p.candidate_sha === packet.candidate.sha &&
        DEPLOYMENT_ID.test(p.rollback_deployment_id ?? "");
      if (!rehearsalPass) errors.push("rollback rehearsal: safe non-production PASS contract not satisfied");
    }
  } else {
    errors.push("rollback rehearsal: required evidence is absent");
  }

  const technicalReady = errors.length === 0 && preview && productionMcp && productionMemory && rollback && routes && rehearsalPass && review.pass;
  let decision = "NOT_READY";
  if (technicalReady && !authorization.present) decision = "RELEASE_READY_BUT_NOT_AUTHORIZED";
  if (technicalReady && authorization.valid) decision = "AUTHORIZED_FOR_PRODUCTION";
  return {
    errors,
    decision,
    gates: {
      preview,
      production_binding: productionMcp && productionMemory,
      rollback,
      routes,
      rehearsal: rehearsalPass,
      independent_review: review.pass,
      owner_authorization: authorization.valid,
    },
  };
}


export function evaluateGithubProviderPacket(packet, { expectedSha = null, now = new Date() } = {}) {
  const errors = [];
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!isObject(packet)) return { errors: ["$: packet must be an object"], decision: "INVALID" };
  if (packet.packet_version !== "2.0.0") errors.push("$.packet_version: expected 2.0.0");
  validateCandidateIdentity(packet, expectedSha, errors);
  if (!Array.isArray(packet.evidence)) errors.push("$.evidence: array is required");
  else packet.evidence.forEach((item, index) => validateReceipt(item, index, nowMs, errors));
  scanSecrets(packet, "$", errors);
  validateProviderPreview(packet, errors);
  validateRouteEvidence(packet, errors);
  const stateful = evidenceByClass(packet, "stateful_change_matrix")[0];
  if (!requireOrigin(stateful, ["GITHUB_PROVIDER"], "stateful change matrix", errors)) {
    // Error is already recorded.
  } else {
    if ((stateful.payload?.disallowed ?? []).length !== 0) errors.push("stateful change matrix: disallowed Worker 4 paths detected");
    for (const value of Object.values(stateful.payload?.classifications ?? {})) {
      if (value !== "NOT_APPLICABLE") errors.push("stateful change matrix: release-infrastructure-only candidate changed runtime state");
    }
  }
  if (evidenceByClass(packet, "owner_authorization").length > 0) {
    errors.push("GitHub provider packet: owner authorization must not be manufactured in candidate CI");
  }
  if (evidenceByClass(packet, "production_binding:mcpmaster").length > 0 || evidenceByClass(packet, "production_binding:memory").length > 0) {
    errors.push("GitHub provider packet: Vercel production binding must come from a separate authenticated Vercel receipt");
  }
  if (evidenceByClass(packet, "rollback_target").length > 0) {
    errors.push("GitHub provider packet: rollback target qualification must come from a separate authenticated Vercel receipt");
  }
  const rehearsal = evidenceByClass(packet, "rollback_rehearsal")[0];
  if (!rehearsal || rehearsal.payload?.mode !== "parallel_read_only_non_production" || rehearsal.payload?.production_mutation !== false) {
    errors.push("GitHub provider packet: safe read-only rehearsal record is required");
  }
  if (rehearsal?.payload?.rollback_deployment_id !== null) {
    errors.push("GitHub provider packet: rollback deployment identity may not be self-declared by GitHub-only CI");
  }
  if (packet.derived?.release_decision !== "NOT_READY") {
    errors.push("GitHub provider packet: exact-head CI must remain NOT_READY until external gates arrive");
  }
  if (packet.derived?.owner_authorization_present !== false || packet.derived?.rollback_provider_identity_present !== false) {
    errors.push("GitHub provider packet: external gate absence must remain explicit");
  }
  return { errors, decision: errors.length === 0 ? "NOT_READY_EXTERNAL_GATES_REQUIRED" : "INVALID" };
}

export function validateWorkflowText(workflow) {
  const errors = [];
  if (!/^\s*pull_request\s*:/m.test(workflow)) errors.push("workflow: pull_request trigger is required");
  if (!/^\s*workflow_dispatch\s*:/m.test(workflow)) errors.push("workflow: workflow_dispatch trigger is required");
  if (/^\s*push\s*:/m.test(workflow)) errors.push("workflow: push trigger is forbidden because main is production-sensitive");
  if (/pull_request_target\s*:/m.test(workflow)) errors.push("workflow: pull_request_target is forbidden");
  if (/\$\{\{\s*secrets\./.test(workflow)) errors.push("workflow: repository secrets are forbidden");
  if (!/persist-credentials:\s*false/.test(workflow)) errors.push("workflow: checkout credentials must not persist");
  if (!/github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha/.test(workflow)) {
    errors.push("workflow: literal exact-head checkout is required");
  }
  const actionPattern = /uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)/g;
  for (const match of workflow.matchAll(actionPattern)) {
    if (!SHA40.test(match[2])) errors.push(`workflow: ${match[1]} action reference must use a full immutable commit SHA`);
  }
  const forbidden = [
    /\bvercel\s+(?:deploy|promote|alias|rollback)\b/i,
    /--prod\b/i,
    /api\.vercel\.com\/v\d+\/(?:deployments|aliases)/i,
    /\bgit\s+push\b/i,
    /\bgh\s+pr\s+merge\b/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(workflow)) errors.push(`workflow: provider/production mutation is forbidden (${pattern})`);
  }
  if (/paths:\s*\n/m.test(workflow)) errors.push("workflow: path filtering is forbidden for the release trust gate");
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
  const errors = [
    ...validateSourceCandidate(candidate),
    ...validateWorkflowText(workflow),
  ];
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    errors.push("schema: expected draft 2020-12");
  }
  if (schema.additionalProperties !== false) errors.push("schema: root additionalProperties must be false");
  return {
    errors,
    candidate,
    source_sha256: sha256(candidateText),
  };
}

function parseArgs(argv) {
  const args = { mode: "repository", root: process.cwd(), packet: null, expectedSha: null, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--mode") args.mode = argv[++i];
    else if (flag === "--root") args.root = resolve(argv[++i]);
    else if (flag === "--packet") args.packet = resolve(argv[++i]);
    else if (flag === "--expected-sha") args.expectedSha = argv[++i];
    else if (flag === "--output") args.output = resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "repository") {
    const result = verifyRepositoryFiles({ root: args.root });
    if (result.errors.length) {
      console.error("Repository release trust verification failed:");
      result.errors.forEach((error) => console.error(`- ${error}`));
      process.exitCode = 1;
      return;
    }
    console.log(`source_candidate_sha256=${result.source_sha256}`);
    console.log("source_can_authorize_release=false");
    console.log("production_mutation=none");
    return;
  }
  if (args.mode === "github") {
    if (!args.packet) throw new Error("--packet is required for github mode");
    const packet = JSON.parse(readFileSync(args.packet, "utf8"));
    const result = evaluateGithubProviderPacket(packet, { expectedSha: args.expectedSha });
    const output = JSON.stringify(result, null, 2) + "\n";
    if (args.output) writeFileSync(args.output, output);
    console.log(output.trim());
    if (result.errors.length) process.exitCode = 1;
    return;
  }
  if (args.mode === "external") {
    if (!args.packet) throw new Error("--packet is required for external mode");
    const packet = JSON.parse(readFileSync(args.packet, "utf8"));
    const result = evaluateExternalPacket(packet, { expectedSha: args.expectedSha });
    const output = JSON.stringify(result, null, 2) + "\n";
    if (args.output) writeFileSync(args.output, output);
    console.log(output.trim());
    if (result.errors.length) process.exitCode = 1;
    return;
  }
  throw new Error(`Unsupported mode: ${args.mode}`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main();
