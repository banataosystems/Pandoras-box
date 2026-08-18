from __future__ import annotations

from pathlib import Path
import re


def fail(message: str) -> None:
    raise SystemExit(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def scan_block_end(text: str, open_brace: int, label: str) -> int:
    depth = 0
    state = "normal"
    quote = ""
    escaped = False
    index = open_brace
    while index < len(text):
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""
        if state == "line_comment":
            if char == "\n":
                state = "normal"
        elif state == "block_comment":
            if char == "*" and nxt == "/":
                state = "normal"
                index += 1
        elif state == "string":
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                state = "normal"
        elif state == "template":
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "`":
                state = "normal"
        else:
            if char == "/" and nxt == "/":
                state = "line_comment"
                index += 1
            elif char == "/" and nxt == "*":
                state = "block_comment"
                index += 1
            elif char in ("'", '"'):
                state = "string"
                quote = char
            elif char == "`":
                state = "template"
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return index + 1
                if depth < 0:
                    fail(f"{label}: block depth became negative")
        index += 1
    fail(f"{label}: unterminated block")


def function_span(text: str, name: str) -> tuple[int, int]:
    pattern = re.compile(rf"function\s+{re.escape(name)}\s*\(")
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        fail(f"function {name}: expected exactly one declaration, found {len(matches)}")
    start = matches[0].start()
    brace = text.find("{", matches[0].end())
    if brace < 0:
        fail(f"function {name}: opening brace missing")
    return start, scan_block_end(text, brace, f"function {name}")


def replace_function(text: str, name: str, replacement: str) -> str:
    start, end = function_span(text, name)
    return text[:start] + replacement.rstrip() + text[end:]


def class_method_span(text: str, signature: str) -> tuple[int, int]:
    matches = [match.start() for match in re.finditer(re.escape(signature), text)]
    if len(matches) != 1:
        fail(f"method {signature}: expected exactly one declaration, found {len(matches)}")
    start = matches[0]
    brace = text.find("{", start + len(signature))
    if brace < 0:
        fail(f"method {signature}: opening brace missing")
    return start, scan_block_end(text, brace, f"method {signature}")


def insert_before_once(text: str, marker: str, addition: str, label: str) -> str:
    count = text.count(marker)
    if count != 1:
        fail(f"{label}: expected exactly one marker, found {count}")
    return text.replace(marker, addition.rstrip() + "\n\n" + marker, 1)


def replace_map(text: str, name: str, replacement: str) -> str:
    start_marker = f"const {name} = new Map(["
    start = text.find(start_marker)
    if start < 0:
        fail(f"map {name}: start marker missing")
    if text.find(start_marker, start + 1) >= 0:
        fail(f"map {name}: start marker is not unique")
    end = text.find("]);", start)
    if end < 0:
        fail(f"map {name}: closing marker missing")
    end += 3
    return text[:start] + replacement.rstrip() + text[end:]


memory_path = Path("src/tools/memory-evidence-intake.js")
memory = memory_path.read_text()

memory = replace_function(
    memory,
    "parsePositiveInt",
    '''function parsePositiveInt(value, fallback, maximum) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
        return fallback;
    }
    return parsed;
}''',
)

memory = replace_map(
    memory,
    "SAFE_BACKEND_CODES",
    '''const SAFE_BACKEND_CODES = new Map([
    ["EVIDENCE_INTAKE_UNAUTHORIZED", {
        statuses: new Set([401]),
        validationCategory: "authentication",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_GRANT_DENIED", {
        statuses: new Set([403]),
        validationCategory: "grant_authorization",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_INVALID_NAMESPACE", {
        statuses: new Set([400, 422]),
        validationCategory: "namespace_validation",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_PROJECT_NOT_FOUND", {
        statuses: new Set([404]),
        validationCategory: "project_binding",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_PROJECT_BINDING_MISMATCH", {
        statuses: new Set([400, 403]),
        validationCategory: "project_binding",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_PRIVACY_REJECTED", {
        statuses: new Set([400, 422]),
        validationCategory: "privacy_policy",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_IDEMPOTENCY_CONFLICT", {
        statuses: new Set([409]),
        validationCategory: "idempotency",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_INVALID_REQUEST", {
        statuses: new Set([400, 422]),
        validationCategory: "request_validation",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_CANONICAL_WRITE_FORBIDDEN", {
        statuses: new Set([400, 403]),
        validationCategory: "promotion_governance",
        retryable: false,
    }],
    ["EVIDENCE_INTAKE_INTERNAL", {
        statuses: new Set([500]),
        validationCategory: "provider_server",
        retryable: true,
    }],
]);''',
)

memory = replace_function(
    memory,
    "safeBackendFailure",
    '''function safeBackendFailure(status, body) {
    const candidateCode = typeof body?.safeErrorCode === "string"
        ? body.safeErrorCode
        : typeof body?.error === "string"
            ? body.error
            : typeof body?.error?.code === "string"
                ? body.error.code
                : null;

    if (status === 408) {
        return {
            safeErrorCode: "provider_timeout",
            validationCategory: "timeout",
            retryable: true,
            outerStatus: 408,
        };
    }
    if (status === 429) {
        return {
            safeErrorCode: "provider_rate_limited",
            validationCategory: "rate_limit",
            retryable: true,
            outerStatus: 429,
        };
    }
    if (status >= 500) {
        return {
            safeErrorCode: "provider_server_error",
            validationCategory: "provider_server",
            retryable: true,
            outerStatus: 502,
        };
    }
    if (status >= 200 && status < 300) {
        return {
            safeErrorCode: "response_contract_error",
            validationCategory: "response_contract",
            retryable: false,
            outerStatus: 502,
        };
    }

    const known = candidateCode ? SAFE_BACKEND_CODES.get(candidateCode) : undefined;
    if (known) {
        if (!known.statuses.has(status)) {
            return {
                safeErrorCode: "response_contract_error",
                validationCategory: "response_contract",
                retryable: false,
                outerStatus: 502,
            };
        }
        return {
            safeErrorCode: candidateCode,
            validationCategory: known.validationCategory,
            retryable: known.retryable,
            outerStatus: status,
        };
    }

    if (status === 409) {
        return {
            safeErrorCode: "provider_conflict",
            validationCategory: "downstream_conflict",
            retryable: false,
            outerStatus: 409,
        };
    }
    return {
        safeErrorCode: "memory_submission_failed",
        validationCategory: "unknown_downstream",
        retryable: false,
        outerStatus: normalizeOuterFailureStatus(status),
    };
}''',
)

strict_success = r'''function isPlainRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function assertAllowedResponseKeys(value, allowed, label, failContract) {
    if (!isPlainRecord(value)) failContract(`${label}_not_object`);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
        failContract(`${label}_unexpected_field`);
    }
}

function firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null);
}

function assertSuccessfulCandidateResponse(
    status,
    data,
    submittedPayloadHash,
    proposal,
    resolved,
    correlationId,
) {
    const failContract = () => {
        throw submissionFailure({
            httpStatus: Number.isInteger(status) ? status : null,
            safeErrorCode: "response_contract_error",
            validationCategory: "response_contract",
            retryable: false,
            correlationId,
            outerStatus: 502,
        });
    };
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    assertAllowedResponseKeys(
        data,
        new Set([
            "ok",
            "intakeStatus",
            "candidate",
            "review",
            "privacy",
            "idempotency",
            "project",
            "message",
            "audit",
            "requestId",
            "correlationId",
        ]),
        "response",
        failContract,
    );
    if (data.ok !== undefined && data.ok !== true) failContract("response_ok_invalid");
    if (data.error !== undefined) failContract("response_error_present");
    if (data.intakeStatus !== "accepted" && data.intakeStatus !== "deduplicated") {
        failContract("intake_status_invalid");
    }
    if (
        (data.intakeStatus === "accepted" && status !== 202) ||
        (data.intakeStatus === "deduplicated" && status !== 200)
    ) {
        failContract("status_intake_mismatch");
    }

    assertAllowedResponseKeys(
        data.candidate,
        new Set([
            "id",
            "state",
            "status",
            "canonicalWrite",
            "canonicalPromoted",
            "submittedPayloadHash",
            "namespace",
            "projectId",
            "projectKey",
            "proofStage",
            "idempotencyKey",
            "title",
            "claim",
            "createdAt",
            "updatedAt",
        ]),
        "candidate",
        failContract,
    );
    const candidateState = firstDefined(data.candidate.state, data.candidate.status);
    if (!uuid.test(data.candidate.id || "")) failContract("candidate_id_invalid");
    if (candidateState !== "pending_review") failContract("candidate_state_invalid");
    if (data.candidate.canonicalWrite !== false) failContract("canonical_write_invalid");
    if (data.candidate.canonicalPromoted === true) failContract("canonical_promotion_invalid");
    if (data.candidate.submittedPayloadHash !== submittedPayloadHash) {
        failContract("payload_hash_mismatch");
    }

    assertAllowedResponseKeys(
        data.review,
        new Set([
            "id",
            "itemId",
            "state",
            "status",
            "candidateId",
            "projectId",
            "namespace",
            "requiredAction",
            "createdAt",
            "updatedAt",
        ]),
        "review",
        failContract,
    );
    const reviewId = firstDefined(data.review.id, data.review.itemId);
    const reviewState = firstDefined(data.review.state, data.review.status);
    if (!uuid.test(reviewId || "")) failContract("review_id_invalid");
    if (reviewState !== "pending_review") failContract("review_state_invalid");
    if (data.review.candidateId !== data.candidate.id) failContract("review_candidate_mismatch");

    assertAllowedResponseKeys(
        data.privacy,
        new Set([
            "policyVersion",
            "scanAttestation",
            "metadataOnly",
            "rejected",
        ]),
        "privacy",
        failContract,
    );
    if (data.privacy.policyVersion !== MEMORY_EVIDENCE_PRIVACY_POLICY_VERSION) {
        failContract("privacy_policy_mismatch");
    }
    if (data.privacy.scanAttestation !== MEMORY_EVIDENCE_PRIVACY_SCAN_ATTESTATION) {
        failContract("privacy_scan_mismatch");
    }
    if (data.privacy.metadataOnly === false || data.privacy.rejected === true) {
        failContract("privacy_result_invalid");
    }

    assertAllowedResponseKeys(
        data.idempotency,
        new Set([
            "key",
            "idempotencyKey",
            "deduplicated",
            "replayed",
            "conflict",
            "fingerprint",
        ]),
        "idempotency",
        failContract,
    );
    const responseIdempotencyKey = firstDefined(
        data.idempotency.key,
        data.idempotency.idempotencyKey,
        data.candidate.idempotencyKey,
    );
    if (responseIdempotencyKey !== proposal.idempotencyKey) {
        failContract("idempotency_key_mismatch");
    }
    const replayed = firstDefined(data.idempotency.deduplicated, data.idempotency.replayed);
    if (
        replayed !== undefined &&
        replayed !== (data.intakeStatus === "deduplicated")
    ) {
        failContract("idempotency_replay_mismatch");
    }
    if (data.idempotency.conflict === true) failContract("idempotency_conflict_on_success");

    assertAllowedResponseKeys(
        data.project,
        new Set(["id", "projectId", "key", "projectKey", "namespace"]),
        "project",
        failContract,
    );
    const responseProjectId = firstDefined(
        data.project.id,
        data.project.projectId,
        data.candidate.projectId,
    );
    const responseProjectKey = firstDefined(
        data.project.key,
        data.project.projectKey,
        data.candidate.projectKey,
    );
    const responseNamespace = firstDefined(
        data.project.namespace,
        data.candidate.namespace,
        data.review.namespace,
    );
    const responseProofStage = data.candidate.proofStage;
    if (responseProjectId !== resolved.projectId) failContract("project_id_mismatch");
    if (responseProjectKey !== resolved.projectKey) failContract("project_key_mismatch");
    if (responseNamespace !== proposal.namespace) failContract("namespace_mismatch");
    if (responseProofStage !== proposal.proofStage) failContract("proof_stage_mismatch");
    if (data.review.projectId !== undefined && data.review.projectId !== resolved.projectId) {
        failContract("review_project_mismatch");
    }

    return data;
}'''
memory = replace_function(memory, "assertSuccessfulCandidateResponse", strict_success)

call_pattern = re.compile(
    r"assertSuccessfulCandidateResponse\(\s*response\.status\s*,\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)",
    re.MULTILINE,
)
call_matches = list(call_pattern.finditer(memory))
if len(call_matches) != 1:
    fail(f"strict success call: expected exactly one call, found {len(call_matches)}")
body_name, hash_name = call_matches[0].groups()
call_replacement = (
    "assertSuccessfulCandidateResponse(\n"
    "            response.status,\n"
    f"            {body_name},\n"
    f"            {hash_name},\n"
    "            proposal,\n"
    "            resolved,\n"
    "            resolvedCorrelationId,\n"
    "        )"
)
memory = memory[:call_matches[0].start()] + call_replacement + memory[call_matches[0].end():]

outer_pattern = re.compile(r"outerStatus:\s*normalizeOuterFailureStatus\(response\.status\)")
outer_count = len(outer_pattern.findall(memory))
if outer_count < 1:
    fail("classified outer status: no downstream classification call found")
memory = outer_pattern.sub(
    "outerStatus: classified.outerStatus ?? normalizeOuterFailureStatus(response.status)",
    memory,
)
memory_path.write_text(memory)

handler_path = Path("src/projectos-mcp-handler.js")
handler = handler_path.read_text()
handler = replace_function(
    handler,
    "parsePositiveInt",
    '''function parsePositiveInt(value, fallback, maximum) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
        return fallback;
    }
    return parsed;
}''',
)

limits_marker = "const MAX_BODY_BYTES = 256 * 1024;"
if limits_marker not in handler:
    fail("MCP output limits: MAX_BODY_BYTES marker missing")
handler = replace_once(
    handler,
    limits_marker,
    limits_marker + '''
const MAX_TOOL_RESULT_ARRAY_ITEMS = 500;
const MAX_TOOL_RESULT_OBJECT_KEYS = 500;
const MAX_TOOL_RESULT_DEPTH = 20;
const MAX_TOOL_RESULT_NODES = 20_000;
const MAX_TOOL_RESULT_STRING_CHARS = 256 * 1024;''',
    "MCP output limits",
)

format_marker = "function formatToolResult("
if handler.count(format_marker) != 1:
    fail(f"formatToolResult declaration: expected one, found {handler.count(format_marker)}")
handler = handler.replace(format_marker, "function formatToolResultUnbounded(", 1)
normalizer = r'''function providerResponseContractError() {
    return Object.assign(
        new Error("Provider response contract is invalid or exceeds bounded MCP limits"),
        {
            status: 502,
            code: "provider_response_contract_error",
            retryable: false,
        },
    );
}

function normalizeToolResult(value) {
    const active = new Set();
    let nodes = 0;

    const visit = (current, depth) => {
        if (depth > MAX_TOOL_RESULT_DEPTH) throw providerResponseContractError();
        nodes += 1;
        if (nodes > MAX_TOOL_RESULT_NODES) throw providerResponseContractError();
        if (current === null || typeof current === "boolean") return current;
        if (typeof current === "string") {
            if (current.length > MAX_TOOL_RESULT_STRING_CHARS) {
                throw providerResponseContractError();
            }
            return current;
        }
        if (typeof current === "number") {
            if (!Number.isFinite(current)) throw providerResponseContractError();
            return current;
        }
        if (!current || typeof current !== "object") {
            throw providerResponseContractError();
        }
        if (active.has(current)) throw providerResponseContractError();
        active.add(current);
        try {
            if (Array.isArray(current)) {
                if (current.length > MAX_TOOL_RESULT_ARRAY_ITEMS) {
                    throw providerResponseContractError();
                }
                return current.map((item) => visit(item, depth + 1));
            }
            const prototype = Object.getPrototypeOf(current);
            if (prototype !== Object.prototype && prototype !== null) {
                throw providerResponseContractError();
            }
            const keys = Object.keys(current);
            if (
                keys.length > MAX_TOOL_RESULT_OBJECT_KEYS ||
                Reflect.ownKeys(current).length !== keys.length
            ) {
                throw providerResponseContractError();
            }
            const normalized = {};
            for (const key of keys.sort()) {
                normalized[key] = visit(current[key], depth + 1);
            }
            return normalized;
        } finally {
            active.delete(current);
        }
    };

    const normalized = visit(value, 0);
    if (Array.isArray(normalized)) return { items: normalized };
    if (normalized && typeof normalized === "object") return normalized;
    return { value: normalized };
}

function formatToolResult(value, ...args) {
    return formatToolResultUnbounded(normalizeToolResult(value), ...args);
}'''
handler = insert_before_once(
    handler,
    "function formatToolResultUnbounded(",
    normalizer,
    "bounded MCP output normalizer",
)

summary_helper = r'''function executionResultSummary(result) {
    if (result && typeof result === "object" && !Array.isArray(result)) {
        const candidateId = result.candidateId ?? result.candidate?.id;
        const reviewItemId = result.reviewItemId ?? result.review?.id ?? result.review?.itemId;
        if (candidateId || reviewItemId) {
            return {
                type: "memory_evidence_candidate",
                candidateId: candidateId ?? null,
                reviewItemId: reviewItemId ?? null,
                status: result.status ?? result.candidate?.state ?? result.candidate?.status ?? null,
                intakeStatus: result.intakeStatus ?? null,
                deduplicated: result.deduplicated === true || result.intakeStatus === "deduplicated",
                idempotencyKey: result.idempotencyKey ?? result.idempotency?.key ?? null,
                namespace: result.namespace ?? result.project?.namespace ?? result.candidate?.namespace ?? null,
                projectId: result.projectId ?? result.project?.id ?? result.candidate?.projectId ?? null,
                projectKey: result.projectKey ?? result.project?.key ?? result.candidate?.projectKey ?? null,
                proofStage: result.proofStage ?? result.candidate?.proofStage ?? null,
                canonicalPromoted:
                    result.canonicalPromoted === true ||
                    result.candidate?.canonicalPromoted === true ||
                    result.candidate?.canonicalWrite === true,
                privacyPolicyVersion: result.privacy?.policyVersion ?? null,
                privacyScanAttestation: result.privacy?.scanAttestation ?? null,
            };
        }
    }
    return safeAuditSummary(result);
}'''
handler = insert_before_once(
    handler,
    "function safeAuditSummary(",
    summary_helper,
    "execution result summary helper",
)

result_summary_pattern = re.compile(r"resultSummary:\s*safeAuditSummary\(([^\n]+)\)")
summary_matches = list(result_summary_pattern.finditer(handler))
if len(summary_matches) < 1:
    fail("execution result summary: no resultSummary safeAuditSummary call found")
replaced = 0
parts = []
last = 0
for match in summary_matches:
    expression = match.group(1).strip()
    parts.append(handler[last:match.start()])
    if expression in {"result", "executionResult", "providerResult"}:
        parts.append(f"resultSummary: executionResultSummary({expression})")
        replaced += 1
    else:
        parts.append(match.group(0))
    last = match.end()
parts.append(handler[last:])
handler = "".join(parts)
if replaced != 1:
    fail(f"execution result summary: expected one successful result replacement, found {replaced}")
handler_path.write_text(handler)

ledger_path = Path("src/runtime/execution-ledger-client.js")
ledger = ledger_path.read_text()
ledger = ledger.replace(".number().positive()", ".number().int().positive()")
ledger = ledger.replace(".number().nonnegative()", ".number().int().nonnegative()")

export_line_pattern = re.compile(r"exports\.ExecutionLedgerClient\s*=\s*([^\n]+);")
export_match = export_line_pattern.search(ledger)
if not export_match:
    fail("execution ledger export chain missing")
line = export_match.group(0)
if "ExecutionLedgerFinalizationError" not in line:
    line_new = line.replace(
        "exports.ExecutionLedgerClient = ",
        "exports.ExecutionLedgerClient = exports.ExecutionLedgerFinalizationError = ",
        1,
    )
    ledger = ledger[:export_match.start()] + line_new + ledger[export_match.end():]

finalization_support = r'''class ExecutionLedgerFinalizationError extends ExecutionLedgerError {
    constructor(input) {
        const failure = Object.freeze({
            schemaVersion: "1.0.0",
            safeErrorCode: "execution_finalization_ambiguous",
            summary: "ProjectOS execution outcome requires durable ledger reconciliation",
            planId: input.planId,
            expectedStatus: input.expectedStatus,
            observedStatus: input.observedStatus ?? null,
            auditObserved: input.auditObserved === true,
            reconciliationRequired: true,
            retryable: false,
            timestamp: new Date().toISOString(),
        });
        super(JSON.stringify(failure), 503);
        this.name = "ExecutionLedgerFinalizationError";
        this.code = failure.safeErrorCode;
        this.retryable = false;
        this.reconciliationRequired = true;
        this.failure = failure;
    }
}
exports.ExecutionLedgerFinalizationError = ExecutionLedgerFinalizationError;

function finalPlanFrom(value) {
    return value?.plan && typeof value.plan === "object" ? value.plan : value;
}

function terminalPlanMatches(plan, input) {
    return Boolean(
        plan &&
        plan.planId === input.planId &&
        plan.status === input.status
    );
}

function finalizationAuditMatches(record, input) {
    if (!record || typeof record !== "object" || record.planId !== input.planId) return false;
    const observedStatus =
        record.status ??
        record.outcome ??
        record.details?.status ??
        record.payload?.status ??
        record.resultSummary?.status ??
        null;
    if (observedStatus === input.status) return true;
    const event = record.event ?? record.eventType ?? record.action ?? null;
    return event === `execution_${input.status}` || event === `plan_${input.status}`;
}
'''
ledger = insert_before_once(
    ledger,
    "class ExecutionLedgerClient",
    finalization_support,
    "execution finalization support",
)

finish_signature = "async finishPlan("
if ledger.count(finish_signature) != 1:
    fail(f"finishPlan declaration: expected one, found {ledger.count(finish_signature)}")
method_start, method_end = class_method_span(ledger, finish_signature)
original_method = ledger[method_start:method_end]
renamed_method = original_method.replace(finish_signature, "async finishPlanOnce(", 1)
indent_match = re.match(r"\s*", original_method)
indent = indent_match.group(0) if indent_match else "    "
wrapper = f'''{indent}async finishPlan(vercelOidcToken, input) {{
{indent}    if (input?.status !== "completed" && input?.status !== "failed") {{
{indent}        throw new ExecutionLedgerError("Execution plan final status is invalid", 400);
{indent}    }}
{indent}    try {{
{indent}        const result = await this.finishPlanOnce(vercelOidcToken, input);
{indent}        if (!terminalPlanMatches(finalPlanFrom(result), input)) {{
{indent}            throw new Error("execution ledger returned a mismatched terminal plan");
{indent}        }}
{indent}        return result;
{indent}    }} catch (error) {{
{indent}        let observedPlan = null;
{indent}        let auditObserved = false;
{indent}        try {{
{indent}            observedPlan = finalPlanFrom(await this.getPlan(vercelOidcToken, input.planId));
{indent}        }} catch {{
{indent}            observedPlan = null;
{indent}        }}
{indent}        if (terminalPlanMatches(observedPlan, input)) {{
{indent}            try {{
{indent}                const auditResult = await this.listAudit(vercelOidcToken, 500);
{indent}                const records = Array.isArray(auditResult)
{indent}                    ? auditResult
{indent}                    : Array.isArray(auditResult?.events)
{indent}                        ? auditResult.events
{indent}                        : Array.isArray(auditResult?.items)
{indent}                            ? auditResult.items
{indent}                            : [];
{indent}                const matchedAudit = records.find((record) =>
{indent}                    finalizationAuditMatches(record, input));
{indent}                auditObserved = Boolean(matchedAudit);
{indent}                if (matchedAudit) {{
{indent}                    return {{
{indent}                        plan: observedPlan,
{indent}                        auditHash: matchedAudit.auditHash ?? matchedAudit.hash ?? null,
{indent}                        reconciled: true,
{indent}                    }};
{indent}                }}
{indent}            }} catch {{
{indent}                auditObserved = false;
{indent}            }}
{indent}        }}
{indent}        throw new ExecutionLedgerFinalizationError({{
{indent}            planId: input.planId,
{indent}            expectedStatus: input.status,
{indent}            observedStatus: observedPlan?.status ?? null,
{indent}            auditObserved,
{indent}        }});
{indent}    }}
{indent}}}

'''
ledger = ledger[:method_start] + wrapper + renamed_method + ledger[method_end:]
ledger_path.write_text(ledger)

test_path = Path("test/projectos-memory-supabase-contract-regression.test.js")
tests = test_path.read_text()
pending_start, pending_end = function_span(tests, "pendingReviewResponse")
pending_original = tests[pending_start:pending_end]
pending_renamed = pending_original.replace(
    "function pendingReviewResponse(",
    "function legacyPendingReviewResponse(",
    1,
)
fixture_wrapper = r'''

function pendingReviewResponse(args, overrides = {}) {
  const base = legacyPendingReviewResponse(args, overrides);
  const candidateId = base.candidate?.id ?? "22222222-2222-4222-8222-222222222222";
  return {
    ...base,
    candidate: {
      namespace: args.namespace,
      projectId: args.projectId ?? "33333333-3333-4333-8333-333333333333",
      projectKey: args.projectKey,
      proofStage: args.proofStage,
      idempotencyKey: args.idempotencyKey,
      ...base.candidate,
      id: candidateId,
      state: base.candidate?.state ?? base.candidate?.status ?? "pending_review",
      canonicalWrite: false,
    },
    review: {
      id: "66666666-6666-4666-8666-666666666666",
      state: "pending_review",
      candidateId,
      projectId: args.projectId ?? "33333333-3333-4333-8333-333333333333",
      namespace: args.namespace,
      ...base.review,
    },
    privacy: {
      policyVersion: "metadata_only_v1",
      scanAttestation: "evidence_privacy_v2",
      metadataOnly: true,
      rejected: false,
      ...base.privacy,
    },
    idempotency: {
      key: args.idempotencyKey,
      deduplicated: base.intakeStatus === "deduplicated",
      conflict: false,
      ...base.idempotency,
    },
    project: {
      id: args.projectId ?? "33333333-3333-4333-8333-333333333333",
      key: args.projectKey,
      namespace: args.namespace,
      ...base.project,
    },
  };
}'''
tests = tests[:pending_start] + pending_renamed + fixture_wrapper + tests[pending_end:]

if "strict Memory success response rejects unknown and mismatched trust fields" in tests:
    fail("review-round3 regression tests already present")

tests += r'''

test("strict Memory success response rejects unknown and mismatched trust fields", async () => {
  const args = evidenceArgs();
  const base = pendingReviewResponse(args);
  const cases = [
    [202, { ...base, unexpectedTrustField: "reject-me" }],
    [200, base],
    [202, { ...base, candidate: { ...base.candidate, namespace: "au" } }],
    [202, { ...base, candidate: { ...base.candidate, projectKey: "wrong-project" } }],
    [202, { ...base, candidate: { ...base.candidate, proofStage: "implemented" } }],
    [202, { ...base, review: { ...base.review, state: "approved" } }],
    [202, { ...base, idempotency: { ...base.idempotency, key: "different-key:000000000000" } }],
    [202, { ...base, privacy: { ...base.privacy, scanAttestation: "unknown" } }],
    [202, { ...base, candidate: { ...base.candidate, canonicalWrite: true } }],
  ];

  for (const [status, body] of cases) {
    await assert.rejects(
      () => submitEvidenceCandidate(args, memoryConfig, async () =>
        new Response(JSON.stringify(body), { status })),
      (error) => {
        assert.ok(error instanceof MemoryEvidenceSubmissionError);
        assert.equal(error.status, 502);
        const failure = JSON.parse(error.message);
        assert.equal(failure.safeErrorCode, "response_contract_error");
        assert.equal(failure.validationCategory, "response_contract");
        assert.equal(failure.retryable, false);
        assert.doesNotMatch(error.message, /reject-me|wrong-project|different-key|unknown/);
        return true;
      },
    );
  }
});

test("safe Memory error codes are accepted only with their exact HTTP status family", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "EVIDENCE_INTAKE_INVALID_NAMESPACE",
      }), { status: 503 })),
    (error) => {
      assert.ok(error instanceof MemoryEvidenceSubmissionError);
      assert.equal(error.status, 502);
      const failure = JSON.parse(error.message);
      assert.equal(failure.safeErrorCode, "provider_server_error");
      assert.equal(failure.validationCategory, "provider_server");
      assert.equal(failure.retryable, true);
      assert.doesNotMatch(error.message, /EVIDENCE_INTAKE_INVALID_NAMESPACE/);
      return true;
    },
  );

  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "EVIDENCE_INTAKE_INVALID_NAMESPACE",
      }), { status: 401 })),
    (error) => {
      assert.ok(error instanceof MemoryEvidenceSubmissionError);
      assert.equal(error.status, 502);
      const failure = JSON.parse(error.message);
      assert.equal(failure.safeErrorCode, "response_contract_error");
      assert.equal(failure.validationCategory, "response_contract");
      return true;
    },
  );
});

test("malformed Memory runtime limits fall back to finite safe defaults", async () => {
  const args = evidenceArgs();
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1.5, "invalid"]) {
    const result = await submitEvidenceCandidate(
      args,
      { ...memoryConfig, timeoutMs: value, maxResponseBytes: value },
      async () => new Response(JSON.stringify(pendingReviewResponse(args)), { status: 202 }),
    );
    assert.equal(result.intakeStatus, "accepted");
  }
});

test("shared MCP array normalization is bounded and exact objects stay objects", async () => {
  const exactObject = { accountId: "supabase-primary", displayName: "Primary account" };
  const exactHandler = createProjectOsMcpHandler(handlerDependencies({
    async execute() { return exactObject; },
  }));
  const exactResponse = responseRecorder();
  await exactHandler(request("supabase.list-accounts"), exactResponse);
  assert.equal(exactResponse.statusCode, 200);
  assert.deepEqual(exactResponse.body.result.structuredContent, exactObject);

  const list = Array.from({ length: 500 }, (_, index) => ({ index }));
  const listHandler = createProjectOsMcpHandler(handlerDependencies({
    async execute() { return list; },
  }));
  const listResponse = responseRecorder();
  await listHandler(request("supabase.list-accounts"), listResponse);
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.result.structuredContent.items.length, 500);

  const oversizedHandler = createProjectOsMcpHandler(handlerDependencies({
    async execute() { return Array.from({ length: 501 }, (_, index) => ({ index })); },
  }));
  const oversizedResponse = responseRecorder();
  await oversizedHandler(request("supabase.list-accounts"), oversizedResponse);
  assert.equal(oversizedResponse.statusCode, 502);
  assert.match(oversizedResponse.body.error.message, /Provider response contract/);
});
'''
test_path.write_text(tests)

ledger_test_path = Path("test/execution-ledger-finalization-contract.test.js")
ledger_test_path.write_text(r'''"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ExecutionLedgerClient,
  ExecutionLedgerFinalizationError,
} = require("../src/runtime/execution-ledger-client.js");

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "bounded-server-side-vercel-oidc-token";

function terminalPlan(status = "completed") {
  return { planId: PLAN_ID, status };
}

function clientWith(overrides = {}) {
  const client = Object.create(ExecutionLedgerClient.prototype);
  client.finishPlanOnce = overrides.finishPlanOnce ?? (async () => ({
    plan: terminalPlan(),
    auditHash: "a".repeat(64),
  }));
  client.getPlan = overrides.getPlan ?? (async () => terminalPlan());
  client.listAudit = overrides.listAudit ?? (async () => [{
    planId: PLAN_ID,
    status: "completed",
    auditHash: "b".repeat(64),
  }]);
  return client;
}

test("ordinary finalization returns only after exact terminal state is confirmed", async () => {
  const client = clientWith();
  const result = await client.finishPlan(TOKEN, {
    planId: PLAN_ID,
    status: "completed",
    durationMs: 10,
    resultSummary: { type: "memory_evidence_candidate" },
  });
  assert.equal(result.plan.planId, PLAN_ID);
  assert.equal(result.plan.status, "completed");
  assert.equal(result.reconciled, undefined);
});

test("lost finalization response succeeds only after terminal plan plus audit readback", async () => {
  const client = clientWith({
    async finishPlanOnce() { throw new Error("simulated response loss"); },
  });
  const result = await client.finishPlan(TOKEN, {
    planId: PLAN_ID,
    status: "completed",
    durationMs: 10,
    resultSummary: { type: "memory_evidence_candidate" },
  });
  assert.equal(result.plan.status, "completed");
  assert.equal(result.reconciled, true);
  assert.equal(result.auditHash, "b".repeat(64));
});

test("terminal state without exact audit proof fails closed as non-retryable reconciliation", async () => {
  const client = clientWith({
    async finishPlanOnce() { throw new Error("simulated response loss"); },
    async listAudit() { return []; },
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
      assert.equal(failure.observedStatus, "completed");
      assert.equal(failure.auditObserved, false);
      return true;
    },
  );
});

test("conflicting durable status can never be reported as provider success", async () => {
  const client = clientWith({
    async finishPlanOnce() { throw new Error("simulated response loss"); },
    async getPlan() { return terminalPlan("executing"); },
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
      const failure = JSON.parse(error.message);
      assert.equal(failure.observedStatus, "executing");
      assert.equal(failure.reconciliationRequired, true);
      return true;
    },
  );
});
''')

for path in [memory_path, handler_path, ledger_path, test_path, ledger_test_path]:
    text = path.read_text()
    if "worker1_apply_review_round3" in text or "worker1-apply-review-round3" in text:
        fail(f"temporary automation marker leaked into {path}")
