"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeSecurityResolver = exports.RuntimeSecurityResolverError = void 0;
const zod_1 = require("zod");
const DEFAULT_CONTROL_URL = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/mcpmaster-supabase-control';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 16384;
const RuntimeSecuritySchema = zod_1.z.object({
    adminTokenHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/),
    approvalTokenHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/),
    allowedOrigins: zod_1.z.array(zod_1.z.string().url()).min(1).max(10),
    updatedAt: zod_1.z.string().optional(),
});
const RuntimeSecurityResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    security: RuntimeSecuritySchema,
});
class RuntimeSecurityResolverError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'RuntimeSecurityResolverError';
        this.status = status;
    }
}
exports.RuntimeSecurityResolverError = RuntimeSecurityResolverError;
function validatedEndpoint(raw) {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:'
        || endpoint.hostname !== 'jcyqixttuebxqqfkjonq.supabase.co'
        || endpoint.pathname !== '/functions/v1/mcpmaster-supabase-control'
        || endpoint.username
        || endpoint.password
        || endpoint.search
        || endpoint.hash) {
        throw new RuntimeSecurityResolverError('Runtime security endpoint is not trusted');
    }
    return endpoint.toString();
}
class RuntimeSecurityResolver {
    constructor(options = {}) {
        this.endpoint = validatedEndpoint(options.endpoint || DEFAULT_CONTROL_URL);
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
        this.fetchFn = options.fetchFn || globalThis.fetch;
    }
    async resolve(vercelOidcToken) {
        const token = vercelOidcToken?.trim();
        if (!token || token.length < 20) {
            throw new RuntimeSecurityResolverError('Vercel OIDC runtime token is required');
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
                body: JSON.stringify({ action: 'runtime_security' }),
                signal: controller.signal,
                redirect: 'error',
            });
            const declaredLength = Number(response.headers?.get('content-length') || '0');
            if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
                throw new RuntimeSecurityResolverError('Runtime security response is too large');
            }
            const body = await response.text();
            if (Buffer.byteLength(body, 'utf8') > this.maxResponseBytes) {
                throw new RuntimeSecurityResolverError('Runtime security response is too large');
            }
            if (!response.ok) {
                throw new RuntimeSecurityResolverError(`Runtime security request failed with status ${response.status}`, response.status);
            }
            let parsed;
            try {
                parsed = JSON.parse(body);
            }
            catch {
                throw new RuntimeSecurityResolverError('Runtime security control returned invalid JSON');
            }
            return RuntimeSecurityResponseSchema.parse(parsed).security;
        }
        catch (error) {
            if (error instanceof RuntimeSecurityResolverError)
                throw error;
            if (error instanceof zod_1.z.ZodError) {
                throw new RuntimeSecurityResolverError('Runtime security control returned invalid configuration');
            }
            if (error instanceof Error && error.name === 'AbortError') {
                throw new RuntimeSecurityResolverError('Runtime security request timed out');
            }
            throw new RuntimeSecurityResolverError('Runtime security request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.RuntimeSecurityResolver = RuntimeSecurityResolver;
//# sourceMappingURL=runtime-security-resolver.js.map