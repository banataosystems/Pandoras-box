"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanContextLedgerClient = exports.PlanContextLedgerError = void 0;
const zod_1 = require("zod");
const DEFAULT_CONTEXT_URL = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/mcpmaster-plan-context';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESPONSE_BYTES = 128000;
const ATTACH_RETRY_ATTEMPTS = 3;
const RecordedContextSchema = zod_1.z.object({
    planId: zod_1.z.string().uuid(),
    requestId: zod_1.z.string().uuid(),
    contextHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/),
    status: zod_1.z.enum(['available', 'empty', 'unavailable']),
    namespace: zod_1.z.literal('real_life'),
    recordedAt: zod_1.z.string(),
});
const ContextResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    context: RecordedContextSchema,
});
class PlanContextLedgerError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'PlanContextLedgerError';
        this.status = status;
    }
}
exports.PlanContextLedgerError = PlanContextLedgerError;
function validatedEndpoint(raw) {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:'
        || endpoint.hostname !== 'jcyqixttuebxqqfkjonq.supabase.co'
        || endpoint.pathname !== '/functions/v1/mcpmaster-plan-context'
        || endpoint.username
        || endpoint.password
        || endpoint.search
        || endpoint.hash) {
        throw new PlanContextLedgerError('Plan context endpoint is not trusted');
    }
    return endpoint.toString();
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
class PlanContextLedgerClient {
    constructor(options = {}) {
        this.endpoint = validatedEndpoint(options.endpoint || DEFAULT_CONTEXT_URL);
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
        this.fetchFn = options.fetchFn || globalThis.fetch;
    }
    async attach(vercelOidcToken, input) {
        let lastError;
        for (let attempt = 1; attempt <= ATTACH_RETRY_ATTEMPTS; attempt += 1) {
            try {
                const recorded = await this.request(vercelOidcToken, {
                    action: 'plan_context_attach',
                    ...input,
                });
                if (recorded.planId !== input.planId
                    || recorded.requestId !== input.requestId
                    || recorded.contextHash !== input.contextHash
                    || recorded.status !== input.contextEnvelope.status
                    || recorded.namespace !== input.contextEnvelope.namespace) {
                    throw new PlanContextLedgerError('Plan context endpoint returned mismatched evidence');
                }
                return true;
            }
            catch (error) {
                lastError = error;
                if (attempt < ATTACH_RETRY_ATTEMPTS)
                    await delay(50 * attempt);
            }
        }
        console.error(JSON.stringify({
            event: 'plan_context_reconciliation_required',
            planId: input.planId,
            requestId: input.requestId,
            contextHash: input.contextHash,
            attempts: ATTACH_RETRY_ATTEMPTS,
            errorType: lastError instanceof Error ? lastError.name : 'unknown',
        }));
        return false;
    }
    async request(vercelOidcToken, payload) {
        const token = vercelOidcToken?.trim();
        if (!token || token.length < 20) {
            throw new PlanContextLedgerError('Vercel OIDC runtime token is required');
        }
        const encoded = JSON.stringify(payload);
        if (Buffer.byteLength(encoded, 'utf8') > 64000) {
            throw new PlanContextLedgerError('Plan context request is too large', 413);
        }
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
            const declared = Number(response.headers?.get('content-length') || '0');
            if (Number.isFinite(declared) && declared > this.maxResponseBytes) {
                throw new PlanContextLedgerError('Plan context response is too large');
            }
            const body = await response.text();
            if (Buffer.byteLength(body, 'utf8') > this.maxResponseBytes) {
                throw new PlanContextLedgerError('Plan context response is too large');
            }
            if (!response.ok) {
                throw new PlanContextLedgerError(`Plan context request failed with status ${response.status}`, response.status);
            }
            try {
                return ContextResponseSchema.parse(JSON.parse(body)).context;
            }
            catch {
                throw new PlanContextLedgerError('Plan context endpoint returned an invalid response');
            }
        }
        catch (error) {
            if (error instanceof PlanContextLedgerError)
                throw error;
            if (error instanceof Error && error.name === 'AbortError') {
                throw new PlanContextLedgerError('Plan context request timed out');
            }
            throw new PlanContextLedgerError('Plan context request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.PlanContextLedgerClient = PlanContextLedgerClient;
//# sourceMappingURL=plan-context-ledger-client.js.map