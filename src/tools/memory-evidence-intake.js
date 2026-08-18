"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceCandidateArgsSchema = void 0;
exports.submitEvidenceCandidate = submitEvidenceCandidate;

const { randomUUID } = require("node:crypto");
const { z } = require("zod");

const MAX_RESPONSE_BYTES = 100_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const CANONICAL_PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_PROJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,95}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const IDEMPOTENCY_CONFLICT_CODE = "idempotency_conflict";
const FAILURE_SCHEMA_VERSION = "1.0.0";
const FAILURE_PROVIDER = "pandora-memory";
const FAILURE_OPERATION = "memory.submitEvidenceCandidate";

const SAFE_BACKEND_FAILURES = new Map([
  ["unsupported_action", { validationCategory: "capability_contract", retryable: false }],
  ["unexpected_field", { validationCategory: "request_validation", retryable: false }],
  ["project_identity_invalid", { validationCategory: "project_identity", retryable: false }],
  ["evidence_candidate_invalid", { validationCategory: "candidate_validation", retryable: false }],
  ["sensitive_candidate_rejected", { validationCategory: "privacy_policy", retryable: false }],
  ["namespace_not_allowed", { validationCategory: "namespace_authorization", retryable: false }],
  ["scope_not_allowed", { validationCategory: "scope_authorization", retryable: false }],
  ["project_not_allowed", { validationCategory: "project_authorization", retryable: false }],
  [IDEMPOTENCY_CONFLICT_CODE, { validationCategory: "idempotency", retryable: false }],
]);

function safeCorrelationId(value, fallback) {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value)
    ? value
    : fallback;
}

function responseCorrelationId(response, fallback) {
  const candidates = [
    response?.headers?.get?.("x-request-id"),
    response?.headers?.get?.("x-vercel-id"),
    response?.headers?.get?.("cf-ray"),
    response?.headers?.get?.("sb-request-id"),
  ];
  return candidates.reduce(
    (resolved, value) => resolved || safeCorrelationId(value, ""),
    "",
  ) || fallback;
}

function failureEnvelope(input) {
  return Object.freeze({
    schemaVersion: FAILURE_SCHEMA_VERSION,
    provider: FAILURE_PROVIDER,
    operation: FAILURE_OPERATION,
    httpStatus: Number.isInteger(input.httpStatus) ? input.httpStatus : null,
    safeErrorCode: input.safeErrorCode,
    validationCategory: input.validationCategory,
    retryable: input.retryable === true,
    correlationId: input.correlationId,
    timestamp: input.timestamp,
  });
}

class MemoryEvidenceSubmissionError extends Error {
  constructor(input) {
    const failure = failureEnvelope(input);
    // The JSON message is deliberate: ProjectOS currently stores a bounded
    // error string in its hash-linked audit ledger. Serializing this fixed,
    // allowlisted envelope keeps both the caller and audit structurally useful
    // without accepting arbitrary provider text or confidential response data.
    super(JSON.stringify(failure));
    this.name = "MemoryEvidenceSubmissionError";
    this.code = failure.safeErrorCode;
    this.status = input.outerStatus;
    this.failure = failure;
  }
}
exports.MemoryEvidenceSubmissionError = MemoryEvidenceSubmissionError;

class MemoryEvidenceIdempotencyConflictError extends MemoryEvidenceSubmissionError {
  constructor(input) {
    super({
      httpStatus: 409,
      safeErrorCode: IDEMPOTENCY_CONFLICT_CODE,
      validationCategory: "idempotency",
      retryable: false,
      correlationId: input.correlationId,
      timestamp: input.timestamp,
      outerStatus: 409,
    });
    this.name = "MemoryEvidenceIdempotencyConflictError";
  }
}

exports.MemoryEvidenceIdempotencyConflictError = MemoryEvidenceIdempotencyConflictError;
exports.IDEMPOTENCY_CONFLICT_CODE = IDEMPOTENCY_CONFLICT_CODE;

const NamespaceSchema = z.enum(["real_life", "au"]);
const ProofStageSchema = z.enum([
  "documented",
  "implemented",
  "tested",
  "deployed",
  "production_verified",
]);

const EvidenceRefSchema = z.object({
  type: z.string().trim().min(1).max(64),
  ref: z.string().trim().min(1).max(512),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  artifact_class: z.string().trim().min(1).max(64).optional(),
  observed_at: z.string().datetime({ offset: true }).optional(),
}).strict();

const ProvenanceSchema = z.object({
  source_type: z.string().trim().min(1).max(64),
  source_locator: z.string().trim().min(1).max(512),
  source_sha: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  parent_sha: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  observed_at: z.string().datetime({ offset: true }),
}).strict();

exports.EvidenceCandidateArgsSchema = z.object({
  namespace: NamespaceSchema,
  projectId: z.string().uuid().optional(),
  projectKey: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{1,95}$/).optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1800),
  proofStage: ProofStageSchema,
  claim: z.string().trim().min(1).max(1000),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(20),
  provenance: ProvenanceSchema,
  idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9._:-]{16,160}$/),
}).strict().refine((value) => Boolean(value.projectId || value.projectKey), {
  message: "projectId or projectKey is required",
});

function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Pandora Memory origin is invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("Pandora Memory origin must be a clean HTTPS origin");
  }
  return url.origin;
}

const EVIDENCE_PRIVACY_TEXT_LIMIT = 20_000;
const EVIDENCE_SECRET_FIELD_PATTERN = /^(?:password|passwd|passphrase|pwd|pin|secret|client_secret|secret_key|secret_access_key|aws_secret_access_key|aws_access_key_id|access_key_id|api_key|access_token|refresh_token|service_role|private_key|accountkey|sharedaccesssignature)$/i;
const EVIDENCE_DIRECT_IDENTIFIER_FIELD_PATTERN = /^(?:phone|phone_number|mobile|mobile_number|telephone|address|street_address|home_address|mailing_address|full_name|first_name|last_name|given_name|family_name|ssn|social_security_number|passport|passport_number|tax_id|bank_account|iban|card_number)$/i;

function normalizePrivacyKey(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function decodePrivacyText(value) {
  let text = String(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "");
  const decodeHex = (match, raw) => {
    const code = Number.parseInt(raw, 16);
    return Number.isFinite(code) && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : match;
  };
  text = text
    .replace(/\\u\{?([0-9a-f]{4,6})\}?/gi, decodeHex)
    .replace(/\\x([0-9a-f]{2})/gi, decodeHex)
    .replace(/&#x([0-9a-f]{2,6});?/gi, decodeHex)
    .replace(/&#(\d{2,7});?/g, (match, raw) => {
      const code = Number.parseInt(raw, 10);
      return Number.isFinite(code) && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    })
    .replace(/&commat;/gi, "@")
    .replace(/&colon;/gi, ":");
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text.slice(0, EVIDENCE_PRIVACY_TEXT_LIMIT);
}

function privacyTextReason(value) {
  const text = decodePrivacyText(value);
  const checks = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, "direct_identifier_email"],
    [/(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{2,4}\)?[\s.-]+)\d{3,4}[\s.-]+\d{3,4}\b/, "direct_identifier_phone"],
    [/\b(?:\+?63|0)9\d{9}\b/, "direct_identifier_phone"],
    [/\b(?:full[ _-]?name|first[ _-]?name|last[ _-]?name|given[ _-]?name|family[ _-]?name|name)\s*[:=]\s*["']?[A-Z][A-Z .'-]{2,80}/i, "direct_identifier_name"],
    [/\b(?:address|street[ _-]?address|home[ _-]?address|mailing[ _-]?address)\s*[:=]\s*[^,;\n]{5,160}/i, "direct_identifier_address"],
    [/\b\d{1,5}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,5}\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|highway|hwy|barangay|brgy)\b/i, "direct_identifier_address"],
    [/\b\d{3}-\d{2}-\d{4}\b/, "direct_identifier_government"],
    [/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/, "direct_identifier_financial"],
    [/-----BEGIN (?:[A-Z0-9 -]+ )?PRIVATE KEY-----/i, "private_key_material"],
    [/\b(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/, "cloud_credential_signature"],
    [/\bAIza[0-9A-Za-z_-]{35}\b/, "cloud_credential_signature"],
    [/\b(?:ghp|github_pat|glpat|sk|sbp|xox[baprs])_[A-Za-z0-9_-]{12,}\b/i, "credential_signature"],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, "jwt_signature"],
    [/\b(?:password|passwd|passphrase|pwd|client[_ -]?secret|secret[_ -]?(?:key|access[_ -]?key)|aws[_ -]?(?:secret[_ -]?access[_ -]?key|access[_ -]?key[_ -]?id)|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|service[_ -]?role|private[_ -]?key|accountkey|sharedaccesssignature)\s*[:=]\s*["']?(?!(?:true|false|null|none|redacted|masked)\b)[^\s"',;}{]{4,}/i, "secret_assignment"],
    [/https?:\/\/[^/\s:@]+:[^/\s@]{4,}@/i, "credential_in_url"],
  ];
  for (const [pattern, reason] of checks) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

function sensitiveReason(value) {
  const visit = (entry, key = null) => {
    if (key !== null) {
      const normalizedKey = normalizePrivacyKey(key);
      if (EVIDENCE_SECRET_FIELD_PATTERN.test(normalizedKey)) {
        return "secret_field";
      }
      if (EVIDENCE_DIRECT_IDENTIFIER_FIELD_PATTERN.test(normalizedKey)) {
        return "direct_identifier_field";
      }
    }
    if (typeof entry === "string") {
      return privacyTextReason(entry);
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        const reason = visit(item);
        if (reason) return reason;
      }
      return null;
    }
    if (entry && typeof entry === "object") {
      for (const [childKey, childValue] of Object.entries(entry)) {
        const reason = visit(childValue, childKey);
        if (reason) return reason;
      }
    }
    return null;
  };
  return visit(value);
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Pandora Memory response exceeded size limit");
  }

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error("Pandora Memory response exceeded size limit");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error("Pandora Memory response exceeded size limit");
  }
  return text;
}

function assertBoundResponse(body, input) {
  if (body?.idempotency_key !== input.idempotencyKey) {
    throw new Error("Pandora Memory candidate response idempotency mismatch");
  }
  if (body?.namespace !== input.namespace) {
    throw new Error("Pandora Memory candidate response namespace mismatch");
  }
  if (body?.proof_stage !== input.proofStage) {
    throw new Error("Pandora Memory candidate response proof-stage mismatch");
  }
  if (input.projectId && body?.project_id !== input.projectId) {
    throw new Error("Pandora Memory candidate response project-id mismatch");
  }
  if (input.projectKey && body?.project_key !== input.projectKey) {
    throw new Error("Pandora Memory candidate response project-key mismatch");
  }

  const canonicalProjectId = body?.project_id;
  const canonicalProjectKey = body?.project_key;
  if (
    typeof canonicalProjectId !== "string" ||
    !CANONICAL_PROJECT_ID_PATTERN.test(canonicalProjectId)
  ) {
    throw new Error("Pandora Memory candidate response canonical project id is invalid");
  }
  if (
    typeof canonicalProjectKey !== "string" ||
    !CANONICAL_PROJECT_KEY_PATTERN.test(canonicalProjectKey)
  ) {
    throw new Error("Pandora Memory candidate response canonical project key is invalid");
  }
  return { canonicalProjectId, canonicalProjectKey };
}

function safeBackendFailure(status, body) {
  const candidateCode = body?.error;
  const known = typeof candidateCode === "string"
    ? SAFE_BACKEND_FAILURES.get(candidateCode)
    : undefined;
  if (known) {
    return {
      safeErrorCode: candidateCode,
      validationCategory: known.validationCategory,
      retryable: known.retryable,
    };
  }
  if (status >= 500) {
    return {
      safeErrorCode: "provider_server_error",
      validationCategory: "provider_server",
      retryable: true,
    };
  }
  return {
    safeErrorCode: "memory_submission_failed",
    validationCategory: "unknown_downstream",
    retryable: false,
  };
}

function submissionFailure(input) {
  return new MemoryEvidenceSubmissionError({
    httpStatus: input.httpStatus,
    safeErrorCode: input.safeErrorCode,
    validationCategory: input.validationCategory,
    retryable: input.retryable,
    correlationId: input.correlationId,
    timestamp: new Date().toISOString(),
    outerStatus: input.outerStatus,
  });
}

async function submitEvidenceCandidate(args, configuration, fetchFn = globalThis.fetch) {
  const input = exports.EvidenceCandidateArgsSchema.parse(args);
  if (!configuration?.allowedNamespaces?.includes(input.namespace)) {
    throw new Error(`Pandora Memory namespace is not allowed: ${input.namespace}`);
  }
  if (!configuration?.grantedScopes?.includes("memory:write")) {
    throw new Error("Pandora Memory write scope is not granted");
  }
  const reason = sensitiveReason(input);
  if (reason) {
    throw new Error(`Pandora Memory candidate rejected: ${reason}`);
  }
  if (typeof fetchFn !== "function") {
    throw new Error("Pandora Memory fetch transport is unavailable");
  }

  const origin = normalizeOrigin(configuration.baseUrl);
  const correlationId = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(Number(configuration.timeoutMs || DEFAULT_TIMEOUT_MS), 30_000),
  );

  const payload = {
    namespace: input.namespace,
    project_id: input.projectId ?? null,
    project_key: input.projectKey ?? null,
    title: input.title,
    summary: input.summary,
    proof_stage: input.proofStage,
    claim: input.claim,
    evidence_refs: input.evidenceRefs,
    provenance: input.provenance,
    idempotency_key: input.idempotencyKey,
  };

  try {
    let response;
    try {
      response = await fetchFn(`${origin}/api/projectos/memory/evidence-candidates`, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "x-pandora-vercel-oidc": configuration.oidcToken,
          "x-request-id": correlationId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof MemoryEvidenceSubmissionError) throw error;
      throw submissionFailure({
        httpStatus: null,
        safeErrorCode: error instanceof Error && error.name === "AbortError"
          ? "provider_timeout"
          : "provider_transport_error",
        validationCategory: "transport",
        retryable: true,
        correlationId,
        outerStatus: 502,
      });
    }

    const resolvedCorrelationId = responseCorrelationId(response, correlationId);
    let text;
    try {
      text = await readBounded(
        response,
        Math.min(Number(configuration.maxResponseBytes || MAX_RESPONSE_BYTES), MAX_RESPONSE_BYTES),
      );
    } catch {
      throw submissionFailure({
        httpStatus: Number.isInteger(response.status) ? response.status : null,
        safeErrorCode: "response_contract_error",
        validationCategory: "response_contract",
        retryable: response.status >= 500,
        correlationId: resolvedCorrelationId,
        outerStatus: 502,
      });
    }

    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw submissionFailure({
        httpStatus: Number.isInteger(response.status) ? response.status : null,
        safeErrorCode: "response_contract_error",
        validationCategory: "response_contract",
        retryable: response.status >= 500,
        correlationId: resolvedCorrelationId,
        outerStatus: 502,
      });
    }

    if (response.status === 409) {
      throw new MemoryEvidenceIdempotencyConflictError({
        correlationId: resolvedCorrelationId,
        timestamp: new Date().toISOString(),
      });
    }
    if (!response.ok || body?.ok === false) {
      const classified = safeBackendFailure(response.status, body);
      throw submissionFailure({
        httpStatus: response.status,
        ...classified,
        correlationId: resolvedCorrelationId,
        outerStatus: response.status >= 500 ? 502 : response.status,
      });
    }
    if (body?.status !== "pending_review") {
      throw submissionFailure({
        httpStatus: response.status,
        safeErrorCode: "response_contract_error",
        validationCategory: "response_contract",
        retryable: false,
        correlationId: resolvedCorrelationId,
        outerStatus: 502,
      });
    }

    let binding;
    try {
      binding = assertBoundResponse(body, input);
    } catch {
      throw submissionFailure({
        httpStatus: response.status,
        safeErrorCode: "response_contract_error",
        validationCategory: "response_contract",
        retryable: false,
        correlationId: resolvedCorrelationId,
        outerStatus: 502,
      });
    }
    const { canonicalProjectId, canonicalProjectKey } = binding;

    return {
      ok: true,
      candidateId: body.candidate_id ?? null,
      status: "pending_review",
      deduplicated: body.deduplicated === true,
      idempotencyKey: input.idempotencyKey,
      namespace: input.namespace,
      projectId: canonicalProjectId,
      projectKey: canonicalProjectKey,
      proofStage: input.proofStage,
      createdAt: body.created_at ?? null,
      canonicalPromoted: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}
