from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, new: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{label}: start marker missing")
    end_index = text.find(end, start_index + len(start))
    if end_index < 0:
        raise SystemExit(f"{label}: end marker missing")
    if text.find(start, start_index + len(start)) >= 0:
        raise SystemExit(f"{label}: start marker is not unique")
    return text[:start_index] + new + text[end_index:]


# ---------------------------------------------------------------------------
# Strict Pandora Memory candidate success/error/runtime contract.
# ---------------------------------------------------------------------------
memory_path = Path("src/tools/memory-evidence-intake.js")
memory = memory_path.read_text()

memory = replace_once(
    memory,
    """const MAX_RESPONSE_BYTES = 100_000;
const DEFAULT_TIMEOUT_MS = 8_000;""",
    """const MAX_RESPONSE_BYTES = 100_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;""",
    "memory runtime constants",
)

memory = replace_between(
    memory,
    "const SAFE_BACKEND_FAILURES = new Map([\n",
    "]);\n\nfunction safeCorrelationId",
    """const SAFE_BACKEND_FAILURES = new Map([
  ["unsupported_action", { httpStatuses: [400], validationCategory: "capability_contract", retryable: false }],
  ["unexpected_field", { httpStatuses: [400], validationCategory: "request_validation", retryable: false }],
  ["project_identity_invalid", { httpStatuses: [400], validationCategory: "project_identity", retryable: false }],
  ["evidence_candidate_invalid", { httpStatuses: [400], validationCategory: "candidate_validation", retryable: false }],
  ["sensitive_candidate_rejected", { httpStatuses: [400], validationCategory: "privacy_policy", retryable: false }],
  ["namespace_not_allowed", { httpStatuses: [403], validationCategory: "namespace_authorization", retryable: false }],
  ["scope_not_allowed", { httpStatuses: [403], validationCategory: "scope_authorization", retryable: false }],
  ["project_not_allowed", { httpStatuses: [403], validationCategory: "project_authorization", retryable: false }],
  [IDEMPOTENCY_CONFLICT_CODE, { httpStatuses: [409], validationCategory: "idempotency", retryable: false }],
]);

function safeCorrelationId""",
    "memory safe backend status map",
)

memory = replace_once(
    memory,
    """const ProofStageSchema = z.enum([
  "documented",
  "implemented",
  "tested",
  "deployed",
  "production_verified",
]);

const EvidenceRefSchema""",
    """const ProofStageSchema = z.enum([
  "documented",
  "implemented",
  "tested",
  "deployed",
  "production_verified",
]);

const EvidenceCandidateSuccessResponseSchema = z.object({
  ok: z.literal(true),
  candidate_id: z.string().regex(CANONICAL_PROJECT_ID_PATTERN),
  review_item_id: z.string().regex(CANONICAL_PROJECT_ID_PATTERN),
  status: z.literal("pending_review"),
  idempotency_key: z.string().trim().regex(/^[A-Za-z0-9._:-]{16,160}$/),
  namespace: NamespaceSchema,
  project_id: z.string().regex(CANONICAL_PROJECT_ID_PATTERN),
  project_key: z.string().regex(CANONICAL_PROJECT_KEY_PATTERN),
  proof_stage: ProofStageSchema,
  deduplicated: z.boolean(),
  created_at: z.string().datetime({ offset: true }).nullable(),
  canonical_memory_written: z.literal(false),
  privacy_policy: z.literal("metadata_only_v1"),
}).strict();

const EvidenceRefSchema""",
    "strict Memory success response schema",
)

memory = replace_once(
    memory,
    """  return url.origin;
}

const EVIDENCE_PRIVACY_TEXT_LIMIT""",
    """  return url.origin;
}

function boundedPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

const EVIDENCE_PRIVACY_TEXT_LIMIT""",
    "memory bounded runtime parser",
)

memory = replace_between(
    memory,
    "function assertBoundResponse(body, input) {\n",
    "function safeBackendFailure",
    """function parseBoundSuccessResponse(status, body, input) {
  if (status !== 200 && status !== 202) return null;
  const parsed = EvidenceCandidateSuccessResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  const value = parsed.data;
  if (
    value.idempotency_key !== input.idempotencyKey ||
    value.namespace !== input.namespace ||
    value.proof_stage !== input.proofStage ||
    (input.projectId && value.project_id !== input.projectId) ||
    (input.projectKey && value.project_key !== input.projectKey)
  ) {
    return null;
  }
  if (status === 202 && (value.deduplicated || value.created_at === null)) {
    return null;
  }
  if (status === 200 && (!value.deduplicated || value.created_at !== null)) {
    return null;
  }
  return value;
}

function safeBackendFailure""",
    "strict Memory success binding",
)

memory = replace_between(
    memory,
    "function safeBackendFailure(status, body) {\n",
    "function submissionFailure",
    """function safeBackendFailure(status, body) {
  const candidateCode = body?.error;
  if (status === 429) {
    return {
      safeErrorCode: "provider_rate_limited",
      validationCategory: "rate_limit",
      retryable: true,
    };
  }
  if (status === 408) {
    return {
      safeErrorCode: "provider_timeout",
      validationCategory: "timeout",
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      safeErrorCode: "provider_server_error",
      validationCategory: "provider_server",
      retryable: true,
    };
  }
  if (status >= 200 && status < 300) {
    return {
      safeErrorCode: "response_contract_error",
      validationCategory: "response_contract",
      retryable: false,
    };
  }
  const known = typeof candidateCode === "string"
    ? SAFE_BACKEND_FAILURES.get(candidateCode)
    : undefined;
  if (known) {
    if (!known.httpStatuses.includes(status)) {
      return {
        safeErrorCode: "response_contract_error",
        validationCategory: "response_contract",
        retryable: false,
      };
    }
    return {
      safeErrorCode: candidateCode,
      validationCategory: known.validationCategory,
      retryable: known.retryable,
    };
  }
  if (status === 409) {
    return {
      safeErrorCode: "provider_conflict",
      validationCategory: "downstream_conflict",
      retryable: false,
    };
  }
  return {
    safeErrorCode: "memory_submission_failed",
    validationCategory: "unknown_downstream",
    retryable: false,
  };
}

function submissionFailure""",
    "Memory status and safe-code pairing",
)

memory = replace_once(
    memory,
    """  const origin = normalizeOrigin(configuration.baseUrl);
  const correlationId = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(Number(configuration.timeoutMs || DEFAULT_TIMEOUT_MS), 30_000),
  );""",
    """  const origin = normalizeOrigin(configuration.baseUrl);
  const correlationId = randomUUID();
  const timeoutMs = boundedPositiveInteger(
    configuration.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  const maxResponseBytes = boundedPositiveInteger(
    configuration.maxResponseBytes,
    MAX_RESPONSE_BYTES,
    MAX_RESPONSE_BYTES,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);""",
    "Memory normalized runtime limits",
)

memory = replace_once(
    memory,
    """      text = await readBounded(
        response,
        Math.min(Number(configuration.maxResponseBytes || MAX_RESPONSE_BYTES), MAX_RESPONSE_BYTES),
      );""",
    """      text = await readBounded(response, maxResponseBytes);""",
    "Memory normalized response limit",
)

memory = replace_between(
    memory,
    "    if (body?.status !== \"pending_review\") {\n",
    "  } finally {\n",
    """    const success = parseBoundSuccessResponse(response.status, body, input);
    if (!success) {
      throw submissionFailure({
        httpStatus: Number.isInteger(response.status) ? response.status : null,
        safeErrorCode: "response_contract_error",
        validationCategory: "response_contract",
        retryable: false,
        correlationId: resolvedCorrelationId,
        outerStatus: 502,
      });
    }

    return {
      ok: true,
      candidateId: success.candidate_id,
      reviewItemId: success.review_item_id,
      status: success.status,
      deduplicated: success.deduplicated,
      idempotencyKey: success.idempotency_key,
      namespace: success.namespace,
      projectId: success.project_id,
      projectKey: success.project_key,
      proofStage: success.proof_stage,
      createdAt: success.created_at,
      privacyPolicy: success.privacy_policy,
      privacyScanVersion: EVIDENCE_PRIVACY_SCAN_VERSION,
      canonicalPromoted: success.canonical_memory_written,
    };
""",
    "Memory strict success return",
)

memory_path.write_text(memory)


# ---------------------------------------------------------------------------
# Bounded execution-ledger transport and explicit finalization reconciliation.
# ---------------------------------------------------------------------------
ledger_path = Path("src/runtime/execution-ledger-client.js")
ledger = ledger_path.read_text()

ledger = replace_once(
    ledger,
    "exports.ExecutionLedgerClient = exports.ExecutionLedgerError = void 0;",
    "exports.ExecutionLedgerClient = exports.ExecutionLedgerFinalizationError = exports.ExecutionLedgerError = void 0;",
    "ledger exports",
)

ledger = replace_once(
    ledger,
    """const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 512000;
const FINALIZATION_RETRY_ATTEMPTS = 3;""",
    """const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RESPONSE_BYTES = 512000;
const FINALIZATION_RETRY_ATTEMPTS = 3;""",
    "ledger runtime constants",
)

ledger = replace_once(
    ledger,
    """const PlanStatusSchema = zod_1.z.enum([
    'pending_approval',
    'approved',
    'executing',
    'completed',
    'failed',
    'expired',
]);""",
    """const PlanStatusSchema = zod_1.z.enum([
    'pending_approval',
    'approved',
    'executing',
    'completed',
    'failed',
    'expired',
]);
const FinalPlanStatusSchema = zod_1.z.enum(['completed', 'failed']);""",
    "ledger final status schema",
)

ledger = replace_once(
    ledger,
    """const PlanListResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    plans: zod_1.z.array(PlanSchema),
});""",
    """const PlanListResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    plans: zod_1.z.array(PlanSchema).max(500),
});""",
    "bounded ledger plan list",
)

ledger = replace_once(
    ledger,
    """exports.ExecutionLedgerError = ExecutionLedgerError;
function validatedEndpoint""",
    """exports.ExecutionLedgerError = ExecutionLedgerError;
class ExecutionLedgerFinalizationError extends ExecutionLedgerError {
    constructor(input) {
        const failure = Object.freeze({
            schemaVersion: '1.0.0',
            safeErrorCode: 'execution_finalization_ambiguous',
            summary: 'ProjectOS execution outcome requires durable ledger reconciliation',
            planId: input.planId,
            expectedStatus: input.expectedStatus,
            observedStatus: input.observedStatus ?? null,
            retryable: false,
            reconciliationRequired: true,
            timestamp: new Date().toISOString(),
        });
        super(JSON.stringify(failure), 503);
        this.name = 'ExecutionLedgerFinalizationError';
        this.code = failure.safeErrorCode;
        this.retryable = false;
        this.reconciliationRequired = true;
        this.failure = failure;
    }
}
exports.ExecutionLedgerFinalizationError = ExecutionLedgerFinalizationError;
function validatedEndpoint""",
    "ledger finalization error",
)

ledger = replace_once(
    ledger,
    """function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
class ExecutionLedgerClient""",
    """function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function boundedPositiveInteger(value, fallback, maximum) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0
        ? Math.min(parsed, maximum)
        : fallback;
}
async function readBoundedResponse(response, maxBytes) {
    const declaredLength = Number(response.headers?.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new ExecutionLedgerError('Execution ledger response is too large');
    }
    if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks = [];
        let total = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                if (!value)
                    continue;
                total += value.byteLength;
                if (total > maxBytes) {
                    await reader.cancel().catch(() => undefined);
                    throw new ExecutionLedgerError('Execution ledger response is too large');
                }
                chunks.push(Buffer.from(value));
            }
        }
        finally {
            reader.releaseLock?.();
        }
        return Buffer.concat(chunks).toString('utf8');
    }
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        throw new ExecutionLedgerError('Execution ledger response is too large');
    }
    return body;
}
class ExecutionLedgerClient""",
    "ledger bounded response reader",
)

ledger = replace_once(
    ledger,
    """        this.endpoint = validatedEndpoint(options.endpoint || DEFAULT_CONTROL_URL);
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;""",
    """        this.endpoint = validatedEndpoint(options.endpoint || DEFAULT_CONTROL_URL);
        this.timeoutMs = boundedPositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
        this.maxResponseBytes = boundedPositiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES);""",
    "ledger normalized runtime limits",
)

ledger = replace_between(
    ledger,
    "    async finishPlan(vercelOidcToken, input) {\n",
    "    async listAudit",
    """    async finishPlan(vercelOidcToken, input) {
        const finalStatus = FinalPlanStatusSchema.safeParse(input.status);
        if (!finalStatus.success) {
            throw new ExecutionLedgerError('Execution plan final status is invalid', 400);
        }
        let lastError;
        for (let attempt = 1; attempt <= FINALIZATION_RETRY_ATTEMPTS; attempt += 1) {
            try {
                const parsed = await this.request(vercelOidcToken, {
                    action: 'execution_plan_finish',
                    ...input,
                    status: finalStatus.data,
                });
                const plan = PlanResponseSchema.parse(parsed).plan;
                if (plan.planId !== input.planId || plan.status !== finalStatus.data) {
                    throw new ExecutionLedgerError('Execution ledger returned a mismatched finalization response', 502);
                }
                return plan;
            }
            catch (error) {
                lastError = error;
                if (attempt < FINALIZATION_RETRY_ATTEMPTS) {
                    await delay(50 * attempt);
                }
            }
        }
        let observedStatus = null;
        try {
            const plans = await this.listPlans(vercelOidcToken, 500);
            const observed = plans.find((plan) => plan.planId === input.planId);
            observedStatus = observed?.status ?? null;
            if (observed && observed.status === finalStatus.data) {
                return observed;
            }
        }
        catch (error) {
            lastError = error;
        }
        console.error(JSON.stringify({
            event: 'execution_audit_reconciliation_required',
            planId: input.planId,
            finalStatus: finalStatus.data,
            observedStatus,
            attempts: FINALIZATION_RETRY_ATTEMPTS,
            errorType: lastError instanceof Error ? lastError.name : 'unknown',
        }));
        throw new ExecutionLedgerFinalizationError({
            planId: input.planId,
            expectedStatus: finalStatus.data,
            observedStatus,
        });
    }
""",
    "ledger durable finalization reconciliation",
)

ledger = replace_once(
    ledger,
    """            const declaredLength = Number(response.headers?.get('content-length') || '0');
            if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
                throw new ExecutionLedgerError('Execution ledger response is too large');
            }
            const body = await response.text();
            if (Buffer.byteLength(body, 'utf8') > this.maxResponseBytes) {
                throw new ExecutionLedgerError('Execution ledger response is too large');
            }""",
    """            const body = await readBoundedResponse(response, this.maxResponseBytes);""",
    "ledger streamed response bound",
)

ledger_path.write_text(ledger)


# ---------------------------------------------------------------------------
# Bound all MCP structured results and never report provider success until the
# exact durable terminal state has been proven.
# ---------------------------------------------------------------------------
handler_path = Path("src/projectos-mcp-handler.js")
handler = handler_path.read_text()

handler = replace_once(
    handler,
    """const PLAN_TTL_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 256 * 1024;""",
    """const PLAN_TTL_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_TOOL_RESULT_BYTES = 512 * 1024;
const MAX_TOOL_RESULT_ARRAY_ITEMS = 500;
const MAX_TOOL_RESULT_OBJECT_KEYS = 500;
const MAX_TOOL_RESULT_DEPTH = 20;
const MAX_TOOL_RESULT_NODES = 20_000;
const MAX_TOOL_RESULT_STRING_CHARS = 256 * 1024;""",
    "MCP result limits",
)

handler = replace_between(
    handler,
    "function structuredToolContent(value) {\n",
    "function rpcResult",
    """function providerResponseContractError() {
    return Object.assign(new Error("Provider response contract is invalid or exceeds bounded MCP limits"), {
        status: 502,
        code: "provider_response_contract_error",
    });
}

function assertBoundedToolResult(root) {
    const stack = [{ value: root, depth: 0, exit: false }];
    const active = new Set();
    let nodes = 0;
    while (stack.length > 0) {
        const entry = stack.pop();
        if (entry.exit) {
            active.delete(entry.value);
            continue;
        }
        if (entry.depth > MAX_TOOL_RESULT_DEPTH) throw providerResponseContractError();
        nodes += 1;
        if (nodes > MAX_TOOL_RESULT_NODES) throw providerResponseContractError();
        const value = entry.value;
        if (value === null || typeof value === "boolean") continue;
        if (typeof value === "string") {
            if (value.length > MAX_TOOL_RESULT_STRING_CHARS) throw providerResponseContractError();
            continue;
        }
        if (typeof value === "number") {
            if (!Number.isFinite(value)) throw providerResponseContractError();
            continue;
        }
        if (!value || typeof value !== "object") throw providerResponseContractError();
        if (active.has(value)) throw providerResponseContractError();
        active.add(value);
        stack.push({ value, depth: entry.depth, exit: true });
        if (Array.isArray(value)) {
            if (value.length > MAX_TOOL_RESULT_ARRAY_ITEMS) throw providerResponseContractError();
            for (let index = value.length - 1; index >= 0; index -= 1) {
                stack.push({ value: value[index], depth: entry.depth + 1, exit: false });
            }
            continue;
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) throw providerResponseContractError();
        const keys = Object.keys(value);
        if (keys.length > MAX_TOOL_RESULT_OBJECT_KEYS || Reflect.ownKeys(value).length !== keys.length) {
            throw providerResponseContractError();
        }
        for (let index = keys.length - 1; index >= 0; index -= 1) {
            stack.push({ value: value[keys[index]], depth: entry.depth + 1, exit: false });
        }
    }
}

function structuredToolContent(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (Array.isArray(value)) return { items: value };
    return { value: value ?? null };
}

function toolResult(value) {
    try {
        assertBoundedToolResult(value);
        const text = JSON.stringify(value);
        if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_TOOL_RESULT_BYTES) {
            throw providerResponseContractError();
        }
        const structuredContent = structuredToolContent(value);
        const structuredText = JSON.stringify(structuredContent);
        if (
            typeof structuredText !== "string" ||
            Buffer.byteLength(structuredText, "utf8") > MAX_TOOL_RESULT_BYTES
        ) {
            throw providerResponseContractError();
        }
        return {
            content: [{ type: "text", text }],
            structuredContent,
        };
    } catch {
        throw providerResponseContractError();
    }
}

function rpcResult""",
    "bounded MCP result contract",
)

handler = replace_once(
    handler,
    """async function callTool(name, args, actor, dependencies) {""",
    """function executionResultSummary(tool, result) {
    if (tool === "memory.submitEvidenceCandidate" && result && typeof result === "object") {
        return {
            type: "memory_evidence_candidate",
            candidateId: result.candidateId,
            reviewItemId: result.reviewItemId,
            status: result.status,
            deduplicated: result.deduplicated === true,
            idempotencyKey: result.idempotencyKey,
            namespace: result.namespace,
            projectId: result.projectId,
            projectKey: result.projectKey,
            proofStage: result.proofStage,
            canonicalPromoted: result.canonicalPromoted === true,
            privacyScanVersion: result.privacyScanVersion,
        };
    }
    return {
        type: result === null ? "null" : Array.isArray(result) ? "array" : typeof result,
    };
}

function safeExecutionAuditError(error) {
    if (error instanceof Error && error.failure && typeof error.failure === "object") {
        const serialized = JSON.stringify(error.failure);
        if (serialized === error.message && Buffer.byteLength(serialized, "utf8") <= 1000) {
            return serialized;
        }
    }
    return JSON.stringify({
        schemaVersion: "1.0.0",
        safeErrorCode: "provider_execution_failed",
        summary: "ProjectOS provider execution failed",
    });
}

function assertFinalizedPlan(plan, claimed, expectedStatus) {
    if (!plan || plan.planId !== claimed.planId || plan.status !== expectedStatus) {
        throw Object.assign(new Error("execution_finalization_ambiguous"), {
            status: 503,
            code: "execution_finalization_ambiguous",
        });
    }
    return plan;
}

async function callTool(name, args, actor, dependencies) {""",
    "execution finalization helpers",
)

handler = replace_between(
    handler,
    "            const startedAt = dependencies.now();\n",
    "        }\n        default:",
    """            const startedAt = dependencies.now();
            let result;
            let executionError;
            let preparedResult;
            try {
                result = await dependencies.execute(
                    claimed.tool,
                    claimed.args,
                    dependencies.toolConfiguration(claimed.tool, { vercelOidcToken: token }),
                );
                // Validate and bound the caller response before declaring the plan
                // completed. A malformed provider result therefore cannot become a
                // durable false success.
                preparedResult = toolResult({
                    planId: claimed.planId,
                    planStatus: "completed",
                    result,
                });
            } catch (error) {
                executionError = error;
            }
            const finalStatus = executionError ? "failed" : "completed";
            const finalizationInput = executionError
                ? {
                    planId: claimed.planId,
                    status: finalStatus,
                    durationMs: Math.max(0, dependencies.now() - startedAt),
                    error: safeExecutionAuditError(executionError),
                }
                : {
                    planId: claimed.planId,
                    status: finalStatus,
                    durationMs: Math.max(0, dependencies.now() - startedAt),
                    resultSummary: executionResultSummary(claimed.tool, result),
                };
            const finalized = assertFinalizedPlan(
                await dependencies.ledger.finishPlan(token, finalizationInput),
                claimed,
                finalStatus,
            );
            if (executionError) throw executionError;
            if (!preparedResult || finalized.status !== "completed") {
                throw Object.assign(new Error("execution_finalization_ambiguous"), { status: 503 });
            }
            return preparedResult;
""",
    "fail-closed ProjectOS execution finalization",
)

handler_path.write_text(handler)


# ---------------------------------------------------------------------------
# Update existing contract fixtures and add negative regressions.
# ---------------------------------------------------------------------------
contract_test_path = Path("test/projectos-memory-supabase-contract-regression.test.js")
contract_tests = contract_test_path.read_text()

contract_tests = replace_once(
    contract_tests,
    """  MemoryEvidenceIdempotencyConflictError,
  MemoryEvidenceSubmissionError,
  submitEvidenceCandidate,
} = require("../src/tools/memory-evidence-intake.js");""",
    """  MemoryEvidenceIdempotencyConflictError,
  MemoryEvidenceSubmissionError,
  submitEvidenceCandidate,
} = require("../src/tools/memory-evidence-intake.js");
const {
  ExecutionLedgerFinalizationError,
} = require("../src/runtime/execution-ledger-client.js");""",
    "contract test finalization import",
)

contract_tests = replace_between(
    contract_tests,
    "function pendingReviewResponse(args, overrides = {}) {\n",
    "test(\"array-valued provider reads",
    """function pendingReviewResponse(args, overrides = {}) {
  return {
    ok: true,
    candidate_id: "22222222-2222-4222-8222-222222222222",
    review_item_id: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",
    idempotency_key: args.idempotencyKey,
    namespace: args.namespace,
    project_id: args.projectId ?? "33333333-3333-4333-8333-333333333333",
    project_key: args.projectKey,
    proof_stage: args.proofStage,
    deduplicated: false,
    created_at: "2026-08-19T05:15:10.000Z",
    canonical_memory_written: false,
    privacy_policy: "metadata_only_v1",
    ...overrides,
  };
}

function successfulCandidateResult(args, overrides = {}) {
  return {
    ok: true,
    candidateId: "22222222-2222-4222-8222-222222222222",
    reviewItemId: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",
    deduplicated: false,
    idempotencyKey: args.idempotencyKey,
    namespace: args.namespace,
    projectId: args.projectId ?? "33333333-3333-4333-8333-333333333333",
    projectKey: args.projectKey,
    proofStage: args.proofStage,
    createdAt: "2026-08-19T05:15:10.000Z",
    privacyPolicy: "metadata_only_v1",
    privacyScanVersion: "evidence_privacy_v2",
    canonicalPromoted: false,
    ...overrides,
  };
}

test("array-valued provider reads""",
    "strict success test fixtures",
)

contract_tests = replace_once(
    contract_tests,
    """      status: 201,
      headers: { "x-request-id": "memory-contract-success-1" },""",
    """      status: 202,
      headers: { "x-request-id": "memory-contract-success-1" },""",
    "new candidate HTTP status",
)

contract_tests = replace_once(
    contract_tests,
    """    candidateId: "22222222-2222-4222-8222-222222222222",
    status: "pending_review",""",
    """    candidateId: "22222222-2222-4222-8222-222222222222",
    reviewItemId: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",""",
    "success review identity assertion",
)

contract_tests = replace_once(
    contract_tests,
    """    createdAt: "2026-08-19T05:15:10.000Z",
    privacyScanVersion: "evidence_privacy_v2",""",
    """    createdAt: "2026-08-19T05:15:10.000Z",
    privacyPolicy: "metadata_only_v1",
    privacyScanVersion: "evidence_privacy_v2",""",
    "success privacy policy assertion",
)

contract_tests = replace_once(
    contract_tests,
    """    new Response(JSON.stringify(pendingReviewResponse(args, { deduplicated: true })), { status: 200 }));""",
    """    new Response(JSON.stringify(pendingReviewResponse(args, {
      deduplicated: true,
      created_at: null,
    })), { status: 200 }));""",
    "deduplicated response cross-field contract",
)

contract_tests = replace_once(
    contract_tests,
    """  assert.equal(callerFailure.safeErrorCode, "evidence_candidate_invalid");
  assert.equal(callerFailure.retryable, false);""",
    """  assert.equal(callerFailure.safeErrorCode, "response_contract_error");
  assert.equal(callerFailure.validationCategory, "response_contract");
  assert.equal(callerFailure.retryable, false);""",
    "body-level 2xx contract expectation",
)

contract_tests = replace_once(
    contract_tests,
    """    return new Response(JSON.stringify(pendingReviewResponse(args)), { status: 201 });""",
    """    return new Response(JSON.stringify(pendingReviewResponse(args)), { status: 202 });""",
    "privacy success status",
)

contract_tests += r'''

test("strict Memory success schema rejects every ambiguous or malformed 2xx response", async () => {
  const args = evidenceArgs();
  const base = pendingReviewResponse(args);
  const without = (key) => {
    const value = { ...base };
    delete value[key];
    return value;
  };
  const cases = [
    [202, without("ok")],
    [202, without("candidate_id")],
    [202, without("review_item_id")],
    [202, { ...base, candidate_id: "not-a-uuid" }],
    [202, { ...base, review_item_id: "not-a-uuid" }],
    [202, { ...base, deduplicated: "false" }],
    [202, { ...base, created_at: "not-a-timestamp" }],
    [202, { ...base, canonical_memory_written: true }],
    [202, { ...base, privacy_policy: "unversioned" }],
    [202, { ...base, unexpected_trust_field: "must-reject" }],
    [201, base],
    [200, base],
    [202, { ...base, deduplicated: true, created_at: null }],
    [202, { ...base, project_id: "77777777-7777-4777-8777-777777777777" }],
    [202, { ...base, proof_stage: "implemented" }],
  ];
  for (const [status, body] of cases) {
    await assert.rejects(
      () => submitEvidenceCandidate(args, memoryConfig, async () =>
        new Response(JSON.stringify(body), { status })),
      (error) => {
        const failure = failureFrom(error);
        assert.equal(error.status, 502);
        assert.equal(failure.httpStatus, status);
        assert.equal(failure.safeErrorCode, "response_contract_error");
        assert.equal(failure.validationCategory, "response_contract");
        assert.equal(failure.retryable, false);
        assert.doesNotMatch(error.message, /unexpected_trust_field|must-reject|not-a-uuid|unversioned/);
        return true;
      },
    );
  }
});

test("safe Memory codes are accepted only with their exact HTTP status", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "namespace_not_allowed" }), { status: 400 })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.httpStatus, 400);
      assert.equal(failure.safeErrorCode, "response_contract_error");
      assert.equal(failure.validationCategory, "response_contract");
      return true;
    },
  );

  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({ ok: false, error: "namespace_not_allowed" }), { status: 503 })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.httpStatus, 503);
      assert.equal(failure.safeErrorCode, "provider_server_error");
      assert.equal(failure.validationCategory, "provider_server");
      assert.equal(failure.retryable, true);
      return true;
    },
  );
});

test("malformed runtime limits fall back to bounded safe defaults", async () => {
  const args = evidenceArgs();
  for (const timeoutMs of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, "invalid"]) {
    const result = await submitEvidenceCandidate(args, {
      ...memoryConfig,
      timeoutMs,
    }, async (_url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (init.signal.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return new Response(JSON.stringify(pendingReviewResponse(args)), { status: 202 });
    });
    assert.equal(result.candidateId, "22222222-2222-4222-8222-222222222222");
  }

  await assert.rejects(
    () => submitEvidenceCandidate(args, {
      ...memoryConfig,
      maxResponseBytes: Number.NaN,
    }, async () => new Response(JSON.stringify(pendingReviewResponse(args)), {
      status: 202,
      headers: { "content-length": "100001" },
    })),
    (error) => {
      const failure = failureFrom(error);
      assert.equal(error.status, 502);
      assert.equal(failure.safeErrorCode, "response_contract_error");
      return true;
    },
  );
});

test("shared MCP provider result normalization is item, depth, node, and byte bounded", async () => {
  const cases = [];
  cases.push(Array.from({ length: 501 }, (_, index) => ({ index })));
  let deep = "leaf";
  for (let depth = 0; depth < 22; depth += 1) deep = [deep];
  cases.push(deep);
  cases.push({ payload: "x".repeat((512 * 1024) + 1) });

  for (const raw of cases) {
    const handler = createProjectOsMcpHandler(handlerDependencies({
      async execute() { return raw; },
    }));
    const response = responseRecorder();
    await handler(request("supabase.list-accounts"), response);
    assert.equal(response.statusCode, 502);
    assert.match(response.body.error.message, /Provider response contract/);
    assert.equal(response.body.result, undefined);
  }
});

test("the bounded shared array contract still accepts the advertised 500-item maximum", async () => {
  const raw = Array.from({ length: 500 }, (_, index) => ({ index }));
  const handler = createProjectOsMcpHandler(handlerDependencies({
    async execute() { return raw; },
  }));
  const response = responseRecorder();
  await handler(request("supabase.list-accounts"), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.structuredContent.items.length, 500);
});

test("completed Memory execution is candidate/review-bound in the durable finalization summary", async () => {
  const args = evidenceArgs();
  let finishInput;
  const ledger = {
    async claimPlan(_token, planId) {
      return {
        planId,
        requestId: "88888888-8888-4888-8888-888888888888",
        tool: "memory.submitEvidenceCandidate",
        risk: "write",
        args,
        payloadHash: executionPayloadHash("memory.submitEvidenceCandidate", args),
        status: "executing",
      };
    },
    async finishPlan(_token, input) {
      finishInput = input;
      return { planId: input.planId, status: input.status };
    },
  };
  const handler = createProjectOsMcpHandler(handlerDependencies({
    ledger,
    async execute() { return successfulCandidateResult(args); },
  }));
  const response = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.structuredContent.planStatus, "completed");
  assert.equal(finishInput.status, "completed");
  assert.deepEqual(finishInput.resultSummary, {
    type: "memory_evidence_candidate",
    candidateId: "22222222-2222-4222-8222-222222222222",
    reviewItemId: "66666666-6666-4666-8666-666666666666",
    status: "pending_review",
    deduplicated: false,
    idempotencyKey: args.idempotencyKey,
    namespace: args.namespace,
    projectId: "33333333-3333-4333-8333-333333333333",
    projectKey: args.projectKey,
    proofStage: args.proofStage,
    canonicalPromoted: false,
    privacyScanVersion: "evidence_privacy_v2",
  });
});

test("provider success plus ambiguous finalization never returns ordinary success or re-executes on retry", async () => {
  const args = evidenceArgs();
  let claims = 0;
  let executions = 0;
  let finishes = 0;
  const ledger = {
    async claimPlan(_token, planId) {
      claims += 1;
      if (claims > 1) {
        throw Object.assign(new Error("Execution plan is already claimed"), { status: 409 });
      }
      return {
        planId,
        requestId: "99999999-9999-4999-8999-999999999999",
        tool: "memory.submitEvidenceCandidate",
        risk: "write",
        args,
        payloadHash: executionPayloadHash("memory.submitEvidenceCandidate", args),
        status: "executing",
      };
    },
    async finishPlan(_token, input) {
      finishes += 1;
      throw new ExecutionLedgerFinalizationError({
        planId: input.planId,
        expectedStatus: input.status,
        observedStatus: "executing",
      });
    },
  };
  const handler = createProjectOsMcpHandler(handlerDependencies({
    ledger,
    async execute() {
      executions += 1;
      return successfulCandidateResult(args);
    },
  }));

  const first = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), first);
  const retry = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), retry);

  assert.equal(first.statusCode, 503);
  assert.match(first.body.error.message, /execution_finalization_ambiguous/);
  assert.equal(retry.statusCode, 409);
  assert.equal(executions, 1);
  assert.equal(finishes, 1);
});

test("provider failure plus ambiguous finalization returns reconciliation-required without leaking provider detail", async () => {
  const args = evidenceArgs();
  let finishInput;
  const ledger = {
    async claimPlan(_token, planId) {
      return {
        planId,
        requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tool: "memory.submitEvidenceCandidate",
        risk: "write",
        args,
        payloadHash: executionPayloadHash("memory.submitEvidenceCandidate", args),
        status: "executing",
      };
    },
    async finishPlan(_token, input) {
      finishInput = input;
      throw new ExecutionLedgerFinalizationError({
        planId: input.planId,
        expectedStatus: input.status,
        observedStatus: "executing",
      });
    },
  };
  const handler = createProjectOsMcpHandler(handlerDependencies({
    ledger,
    async execute() {
      throw Object.assign(new Error("private provider detail credential=must-not-leak"), { status: 400 });
    },
  }));
  const response = responseRecorder();
  await handler(request("projectos_execute_plan", { planId: PLAN_ID }), response);

  assert.equal(response.statusCode, 503);
  assert.equal(finishInput.status, "failed");
  assert.doesNotMatch(finishInput.error, /private provider detail|must-not-leak|credential=/);
  assert.doesNotMatch(response.body.error.message, /private provider detail|must-not-leak|credential=/);
  assert.match(response.body.error.message, /execution_finalization_ambiguous/);
});
'''

contract_test_path.write_text(contract_tests)


# ---------------------------------------------------------------------------
# Direct execution-ledger transport/finalization tests.
# ---------------------------------------------------------------------------
ledger_test_path = Path("test/execution-ledger-finalization-contract.test.js")
if ledger_test_path.exists():
    raise SystemExit("execution-ledger finalization test already exists")
ledger_test_path.write_text(r'''"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ExecutionLedgerClient,
  ExecutionLedgerFinalizationError,
} = require("../src/runtime/execution-ledger-client.js");

const TOKEN = "server-side-vercel-oidc-token-material-long-enough";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function plan(status) {
  return {
    planId: PLAN_ID,
    requestId: REQUEST_ID,
    tool: "memory.submitEvidenceCandidate",
    risk: "write",
    args: { idempotencyKey: "projectos-contract:0000000000000000" },
    payloadHash: "a".repeat(64),
    status,
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("invalid execution-ledger runtime limits resolve to finite bounded defaults", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, "invalid"]) {
    const client = new ExecutionLedgerClient({
      timeoutMs: value,
      maxResponseBytes: value,
      fetchFn: async () => jsonResponse({ ok: true, plans: [] }),
      intakeProvider: null,
      contextProvider: null,
      contextLedger: null,
    });
    assert.equal(client.timeoutMs, 10000);
    assert.equal(client.maxResponseBytes, 512000);
  }
});

test("finishPlan recovers a lost finalization response through exact durable-state readback", async () => {
  let finishAttempts = 0;
  let listAttempts = 0;
  const client = new ExecutionLedgerClient({
    intakeProvider: null,
    contextProvider: null,
    contextLedger: null,
    async fetchFn(_url, init) {
      const payload = JSON.parse(init.body);
      if (payload.action === "execution_plan_finish") {
        finishAttempts += 1;
        throw new Error("simulated response loss");
      }
      assert.equal(payload.action, "execution_plan_list");
      listAttempts += 1;
      return jsonResponse({ ok: true, plans: [plan("completed")] });
    },
  });

  const result = await client.finishPlan(TOKEN, {
    planId: PLAN_ID,
    status: "completed",
    durationMs: 10,
    resultSummary: { type: "memory_evidence_candidate" },
  });
  assert.equal(result.planId, PLAN_ID);
  assert.equal(result.status, "completed");
  assert.equal(finishAttempts, 3);
  assert.equal(listAttempts, 1);
});

test("unresolved durable executing state throws an explicit non-retryable reconciliation obligation", async () => {
  const client = new ExecutionLedgerClient({
    intakeProvider: null,
    contextProvider: null,
    contextLedger: null,
    async fetchFn(_url, init) {
      const payload = JSON.parse(init.body);
      if (payload.action === "execution_plan_finish") {
        return jsonResponse({ ok: false, error: "temporary_unavailable" }, 503);
      }
      return jsonResponse({ ok: true, plans: [plan("executing")] });
    },
  });

  await assert.rejects(
    () => client.finishPlan(TOKEN, {
      planId: PLAN_ID,
      status: "completed",
      durationMs: 10,
      resultSummary: { type: "memory_evidence_candidate" },
    }),
    (error) => {
      assert.ok(error instanceof ExecutionLedgerFinalizationError);
      assert.equal(error.status, 503);
      assert.equal(error.code, "execution_finalization_ambiguous");
      assert.equal(error.retryable, false);
      assert.equal(error.reconciliationRequired, true);
      const failure = JSON.parse(error.message);
      assert.equal(failure.planId, PLAN_ID);
      assert.equal(failure.expectedStatus, "completed");
      assert.equal(failure.observedStatus, "executing");
      assert.equal(failure.reconciliationRequired, true);
      return true;
    },
  );
});

test("invalid max-response configuration cannot disable the execution-ledger size guard", async () => {
  const client = new ExecutionLedgerClient({
    maxResponseBytes: Number.NaN,
    intakeProvider: null,
    contextProvider: null,
    contextLedger: null,
    async fetchFn() {
      return jsonResponse({ ok: true, plans: [] }, 200, {
        "content-length": "512001",
      });
    },
  });
  await assert.rejects(
    () => client.listPlans(TOKEN, 10),
    /Execution ledger response is too large/,
  );
});
''')
