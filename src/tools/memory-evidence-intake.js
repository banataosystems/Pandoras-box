"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceCandidateArgsSchema = void 0;
exports.submitEvidenceCandidate = submitEvidenceCandidate;

const { z } = require("zod");

const MAX_RESPONSE_BYTES = 100_000;
const DEFAULT_TIMEOUT_MS = 8_000;
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

function sensitiveReason(value) {
  const text = JSON.stringify(value);
  const checks = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, "direct_identifier_email"],
    [/\b(?:ghp|github_pat|glpat|sk|sbp|xox[baprs])_[A-Za-z0-9_-]{12,}\b/i, "credential_signature"],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, "jwt_signature"],
    [/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|service[_-]?role|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/i, "secret_assignment"],
  ];
  for (const [pattern, reason] of checks) {
    if (pattern.test(text)) return reason;
  }
  return null;
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
    const response = await fetchFn(`${origin}/api/projectos/memory/evidence-candidates`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "x-pandora-vercel-oidc": configuration.oidcToken,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await readBounded(
      response,
      Math.min(Number(configuration.maxResponseBytes || MAX_RESPONSE_BYTES), MAX_RESPONSE_BYTES),
    );
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Pandora Memory candidate response was not valid JSON");
    }
    if (!response.ok || body?.ok === false) {
      throw new Error(`Pandora Memory candidate submission failed (${response.status})`);
    }
    if (body?.status !== "pending_review") {
      throw new Error("Pandora Memory candidate did not remain pending review");
    }
    assertBoundResponse(body, input);

    return {
      ok: true,
      candidateId: body.candidate_id ?? null,
      status: "pending_review",
      deduplicated: body.deduplicated === true,
      idempotencyKey: input.idempotencyKey,
      namespace: input.namespace,
      projectId: input.projectId ?? null,
      projectKey: input.projectKey ?? null,
      proofStage: input.proofStage,
      createdAt: body.created_at ?? null,
      canonicalPromoted: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}
