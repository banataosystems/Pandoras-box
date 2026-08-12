"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeRateLimitClient = exports.RuntimeRateLimitError = void 0;
const zod_1 = require("zod");
const DEFAULT_CONTROL_URL = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/mcpmaster-supabase-control';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 64000;
const RateLimitInputSchema = zod_1.z.object({
    keyHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/),
    limit: zod_1.z.number().int().min(1).max(10000),
    windowSeconds: zod_1.z.number().int().min(1).max(3600),
});
const RateLimitResultSchema = zod_1.z.object({
    allowed: zod_1.z.boolean(),
    limit: zod_1.z.number().int().positive(),
    remaining: zod_1.z.number().int().nonnegative(),
    count: zod_1.z.number().int().positive(),
    resetAt: zod_1.z.string().min(1),
    windowSeconds: zod_1.z.number().int().positive(),
});
const RateLimitResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    rateLimit: RateLimitResultSchema,
});
class RuntimeRateLimitError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'RuntimeRateLimitError';
        this.status = status;
    }
}
exports.RuntimeRateLimitError = RuntimeRateLimitError;
function validatedEndpoint(raw) {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:'
        || endpoint.hostname !== 'jcyqixttuebxqqfkjonq.supabase.co'
        || endpoint.pathname !== '/functions/v1/mcpmaster-supabase-control'
        || endpoint.username
        || endpoint.password
        || endpoint.search
        || endpoint.hash) {
        throw new RuntimeRateLimitError('Runtime rate limit endpoint is not trusted');
    }
    return endpoint.toString();
}
class RuntimeRateLimitClient {
    constructor(options = {}) {
        this.endpoint = validatedEndpoint(options.endpoint || DEFAULT_CONTROL_URL);
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
        this.fetchFn = options.fetchFn || globalThis.fetch;
    }
    async consume(vercelOidcToken, input) {
        const token = vercelOidcToken?.trim();
        if (!token || token.length < 20) {
            throw new RuntimeRateLimitError('Vercel OIDC runtime token is required');
        }
        let validatedInput;
        try {
            validatedInput = RateLimitInputSchema.parse(input);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                throw new RuntimeRateLimitError('Runtime rate limit request is invalid');
            }
            throw error;
        }
        const encoded = JSON.stringify({
            action: 'runtime_rate_limit_consume',
            ...validatedInput,
        });
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
            const declaredLength = Number(response.headers?.get('content-length') || '0');
            if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
                throw new RuntimeRateLimitError('Runtime rate limit response is too large');
            }
            const body = await response.text();
            if (Buffer.byteLength(body, 'utf8') > this.maxResponseBytes) {
                throw new RuntimeRateLimitError('Runtime rate limit response is too large');
            }
            if (!response.ok) {
                throw new RuntimeRateLimitError(`Runtime rate limit request failed with status ${response.status}`, response.status);
            }
            let parsed;
            try {
                parsed = JSON.parse(body);
            }
            catch {
                throw new RuntimeRateLimitError('Runtime rate limit returned invalid JSON');
            }
            return RateLimitResponseSchema.parse(parsed).rateLimit;
        }
        catch (error) {
            if (error instanceof RuntimeRateLimitError)
                throw error;
            if (error instanceof zod_1.z.ZodError) {
                throw new RuntimeRateLimitError('Runtime rate limit returned an invalid response');
            }
            if (error instanceof Error && error.name === 'AbortError') {
                throw new RuntimeRateLimitError('Runtime rate limit request timed out');
            }
            throw new RuntimeRateLimitError('Runtime rate limit request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.RuntimeRateLimitClient = RuntimeRateLimitClient;
//# sourceMappingURL=runtime-rate-limit-client.js.map