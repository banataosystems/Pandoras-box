"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionLedgerClient = exports.ExecutionLedgerFinalizationError = exports.ExecutionLedgerError = void 0;
const zod_1 = require("zod");
const mandatory_intake_js_1 = require("./mandatory-intake.js");
const plan_memory_context_js_1 = require("./plan-memory-context.js");
const plan_context_ledger_client_js_1 = require("./plan-context-ledger-client.js");
const DEFAULT_CONTROL_URL = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/mcpmaster-supabase-control';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RESPONSE_BYTES = 512000;
const FINALIZATION_RETRY_ATTEMPTS = 3;
const RiskSchema = zod_1.z.enum(['read', 'write', 'destructive']);
const PlanStatusSchema = zod_1.z.enum([
    'pending_approval',
    'approved',
    'executing',
    'completed',
    'failed',
    'expired',
]);
const FinalPlanStatusSchema = zod_1.z.enum(['completed', 'failed']);
const IntakeLifecycleStatusSchema = zod_1.z.enum([
    'accepted',
    'analyzing',
    'planned',
    'executing',
    'completed',
    'blocked',
    'rejected',
]);
const ProjectKeySchema = zod_1.z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const PlanSchema = zod_1.z.object({
    planId: zod_1.z.string().uuid(),
    requestId: zod_1.z.string().uuid(),
    tool: zod_1.z.string().min(1).optional(),
    risk: RiskSchema.optional(),
    args: zod_1.z.record(zod_1.z.unknown()).optional(),
    payloadHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/).optional(),
    status: PlanStatusSchema,
    expiresAt: zod_1.z.string().optional(),
    createdAt: zod_1.z.string().optional(),
    approvedAt: zod_1.z.string().nullable().optional(),
    claimedAt: zod_1.z.string().nullable().optional(),
    completedAt: zod_1.z.string().nullable().optional(),
    durationMs: zod_1.z.number().int().nonnegative().nullable().optional(),
    intakeId: zod_1.z.string().uuid().optional(),
    projectId: zod_1.z.string().uuid().optional(),
    projectKey: ProjectKeySchema.optional(),
    intakeStatus: IntakeLifecycleStatusSchema.optional(),
    memoryContext: zod_1.z.record(zod_1.z.unknown()).optional(),
    memoryContextHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/).optional(),
    memoryContextRecorded: zod_1.z.boolean().optional(),
});
const PlanResponseSchema = zod_1.z.object({ ok: zod_1.z.literal(true), plan: PlanSchema });
const PlanListResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    plans: zod_1.z.array(PlanSchema).max(500),
});
const AuditEventSchema = zod_1.z.object({
    sequence: zod_1.z.number().int().positive(),
    planId: zod_1.z.string().uuid().nullable().optional(),
    requestId: zod_1.z.string().uuid().nullable().optional(),
    eventType: zod_1.z.string(),
    status: zod_1.z.string(),
    tool: zod_1.z.string().nullable().optional(),
    risk: RiskSchema.nullable().optional(),
    payloadHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
    details: zod_1.z.record(zod_1.z.unknown()).default({}),
    previousHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/),
    eventHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/),
    occurredAt: zod_1.z.string(),
});
const AuditResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    events: zod_1.z.array(AuditEventSchema),
});
const VerificationResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    verification: zod_1.z.object({
        valid: zod_1.z.boolean(),
        eventCount: zod_1.z.number().int().nonnegative().optional(),
        lastHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/).optional(),
        failedSequence: zod_1.z.number().int().positive().optional(),
        reason: zod_1.z.string().optional(),
    }),
});
class ExecutionLedgerError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ExecutionLedgerError';
        this.status = status;
    }
}
exports.ExecutionLedgerError = ExecutionLedgerError;
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
function validatedEndpoint(raw) {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:'
        || endpoint.hostname !== 'jcyqixttuebxqqfkjonq.supabase.co'
        || endpoint.pathname !== '/functions/v1/mcpmaster-supabase-control'
        || endpoint.username
        || endpoint.password
        || endpoint.search
        || endpoint.hash) {
        throw new ExecutionLedgerError('Execution ledger endpoint is not trusted');
    }
    return endpoint.toString();
}
function delay(milliseconds) {
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
class ExecutionLedgerClient {
    constructor(options = {}) {
        this.endpoint = validatedEndpoint(options.endpoint || DEFAULT_CONTROL_URL);
        this.timeoutMs = boundedPositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
        this.maxResponseBytes = boundedPositiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES);
        this.fetchFn = options.fetchFn || globalThis.fetch;
        this.enforceMandatoryIntake = (0, mandatory_intake_js_1.shouldEnforceMandatoryIntake)();
        this.intakeProvider = options.intakeProvider === undefined
            ? (this.enforceMandatoryIntake ? new mandatory_intake_js_1.ProjectOSExecutionIntakeProvider() : undefined)
            : options.intakeProvider || undefined;
        const automaticContext = (0, plan_memory_context_js_1.shouldHydratePlanMemoryContext)();
        this.contextProvider = options.contextProvider === undefined
            ? (automaticContext ? new plan_memory_context_js_1.PandoraPlanMemoryContextProvider() : undefined)
            : options.contextProvider || undefined;
        this.contextLedger = options.contextLedger === undefined
            ? (automaticContext ? new plan_context_ledger_client_js_1.PlanContextLedgerClient() : undefined)
            : options.contextLedger || undefined;
    }
    async createPlan(vercelOidcToken, input) {
        // Reject oversized provider payloads before intake, Memory, or provider-control traffic.
        this.assertRequestSize({ action: 'execution_plan_create', ...input });
        let intake;
        let intakeId = input.intakeId;
        if (!intakeId && this.intakeProvider) {
            try {
                intake = await this.intakeProvider.accept(vercelOidcToken, {
                    requestId: input.requestId,
                    tool: input.tool,
                    args: input.args,
                });
                intakeId = intake.intakeId;
            }
            catch (error) {
                throw new ExecutionLedgerError(`Mandatory ProjectOS intake failed: ${error instanceof Error ? error.name : 'unknown'}`, 503);
            }
        }
        if (this.enforceMandatoryIntake && !intakeId) {
            throw new ExecutionLedgerError('Mandatory ProjectOS intake is required', 503);
        }
        if (intakeId && !zod_1.z.string().uuid().safeParse(intakeId).success) {
            throw new ExecutionLedgerError('Execution intake ID is invalid', 400);
        }
        const createPayload = {
            action: 'execution_plan_create',
            ...input,
            intakeId,
        };
        this.assertRequestSize(createPayload);
        // Intake is intentionally completed before Memory retrieval, so every subsequent production
        // operation is already linked to the canonical Pandoras-Box workspace.
        let hydrated;
        if (this.contextProvider) {
            try {
                hydrated = await this.contextProvider.hydrate(vercelOidcToken, {
                    tool: input.tool,
                    args: input.args,
                });
            }
            catch (error) {
                hydrated = (0, plan_memory_context_js_1.createUnavailablePlanMemoryContext)({
                    tool: input.tool,
                    args: input.args,
                }, error);
            }
        }
        const parsed = await this.request(vercelOidcToken, createPayload);
        const durablePlan = PlanResponseSchema.parse(parsed).plan;
        const plan = PlanSchema.parse({
            ...durablePlan,
            ...(intake ? {
                intakeId: intake.intakeId,
                projectId: intake.projectId,
                projectKey: intake.projectKey,
                intakeStatus: intake.status,
            } : {}),
        });
        if (!hydrated)
            return plan;
        const memoryContextRecorded = this.contextLedger
            ? await this.contextLedger.attach(vercelOidcToken, {
                planId: plan.planId,
                requestId: input.requestId,
                contextHash: hydrated.contextHash,
                contextEnvelope: hydrated.envelope,
            })
            : false;
        return PlanSchema.parse({
            ...plan,
            memoryContext: hydrated.envelope,
            memoryContextHash: hydrated.contextHash,
            memoryContextRecorded,
        });
    }
    async approvePlan(vercelOidcToken, planId, approvedBy) {
        const parsed = await this.request(vercelOidcToken, {
            action: 'execution_plan_approve',
            planId,
            approvedBy,
        });
        return PlanResponseSchema.parse(parsed).plan;
    }
    async claimPlan(vercelOidcToken, planId) {
        const parsed = await this.request(vercelOidcToken, {
            action: 'execution_plan_claim',
            planId,
        });
        return PlanResponseSchema.parse(parsed).plan;
    }
    async finishPlan(vercelOidcToken, input) {
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
    async listAudit(vercelOidcToken, limit) {
        const parsed = await this.request(vercelOidcToken, {
            action: 'execution_audit_list',
            limit,
        });
        return AuditResponseSchema.parse(parsed).events;
    }
    async listPlans(vercelOidcToken, limit) {
        const parsed = await this.request(vercelOidcToken, {
            action: 'execution_plan_list',
            limit,
        });
        return PlanListResponseSchema.parse(parsed).plans;
    }
    async verifyAudit(vercelOidcToken) {
        const parsed = await this.request(vercelOidcToken, {
            action: 'execution_audit_verify',
        });
        return VerificationResponseSchema.parse(parsed).verification;
    }
    assertRequestSize(payload) {
        if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 256000) {
            throw new ExecutionLedgerError('Execution ledger request is too large', 413);
        }
    }
    async request(vercelOidcToken, payload) {
        const token = vercelOidcToken?.trim();
        if (!token || token.length < 20) {
            throw new ExecutionLedgerError('Vercel OIDC runtime token is required');
        }
        this.assertRequestSize(payload);
        const encoded = JSON.stringify(payload);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchFn(this.endpoint, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: encoded,
                signal: controller.signal,
                redirect: 'error',
            });
            const body = await readBoundedResponse(response, this.maxResponseBytes);
            if (!response.ok) {
                let code = 'request_failed';
                try {
                    const parsed = JSON.parse(body);
                    if (typeof parsed.error === 'string')
                        code = parsed.error;
                }
                catch {
                    // Preserve normalized error without provider response content.
                }
                throw new ExecutionLedgerError(`Execution ledger request failed with status ${response.status}: ${code}`, response.status);
            }
            try {
                return JSON.parse(body);
            }
            catch {
                throw new ExecutionLedgerError('Execution ledger returned invalid JSON');
            }
        }
        catch (error) {
            if (error instanceof ExecutionLedgerError)
                throw error;
            if (error instanceof zod_1.z.ZodError) {
                throw new ExecutionLedgerError('Execution ledger returned an invalid response');
            }
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ExecutionLedgerError('Execution ledger request timed out');
            }
            throw new ExecutionLedgerError('Execution ledger request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.ExecutionLedgerClient = ExecutionLedgerClient;
//# sourceMappingURL=execution-ledger-client.js.map