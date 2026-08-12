"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseControlResolver = exports.SupabaseControlResolverError = void 0;
const zod_1 = require("zod");
const DEFAULT_CONTROL_URL = 'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/mcpmaster-supabase-control';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 1000000;
const AccountSchema = zod_1.z.object({
    id: zod_1.z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
    label: zod_1.z.string().min(1).max(160),
    authMode: zod_1.z.enum(['pat', 'oauth']).default('pat'),
    token: zod_1.z.string().min(1),
    allowMutations: zod_1.z.boolean().default(false),
    allowedOrganizationSlugs: zod_1.z.array(zod_1.z.string().min(1)).default([]),
    allowedProjectRefs: zod_1.z.array(zod_1.z.string().regex(/^[a-z0-9]{20}$/)).default([]),
    grantedScopes: zod_1.z.array(zod_1.z.string().min(1)).default([]),
});
const CatalogResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    accounts: zod_1.z.array(AccountSchema).min(1),
});
class SupabaseControlResolverError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'SupabaseControlResolverError';
        this.status = status;
    }
}
exports.SupabaseControlResolverError = SupabaseControlResolverError;
function validatedEndpoint(raw) {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:'
        || endpoint.hostname !== 'jcyqixttuebxqqfkjonq.supabase.co'
        || endpoint.pathname !== '/functions/v1/mcpmaster-supabase-control'
        || endpoint.username
        || endpoint.password
        || endpoint.search
        || endpoint.hash) {
        throw new SupabaseControlResolverError('Supabase control endpoint is not trusted');
    }
    return endpoint.toString();
}
class SupabaseControlResolver {
    constructor(options = {}) {
        this.endpoint = validatedEndpoint(options.endpoint || DEFAULT_CONTROL_URL);
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
        this.fetchFn = options.fetchFn || globalThis.fetch;
    }
    async resolve(vercelOidcToken) {
        const token = vercelOidcToken?.trim();
        if (!token || token.length < 20) {
            throw new SupabaseControlResolverError('Vercel OIDC runtime token is required');
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
                body: JSON.stringify({ action: 'catalog' }),
                signal: controller.signal,
                redirect: 'error',
            });
            const declaredLength = Number(response.headers?.get('content-length') || '0');
            if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
                throw new SupabaseControlResolverError('Supabase control response is too large');
            }
            const body = await response.text();
            if (Buffer.byteLength(body, 'utf8') > this.maxResponseBytes) {
                throw new SupabaseControlResolverError('Supabase control response is too large');
            }
            if (!response.ok) {
                throw new SupabaseControlResolverError(`Supabase control request failed with status ${response.status}`, response.status);
            }
            let parsed;
            try {
                parsed = JSON.parse(body);
            }
            catch {
                throw new SupabaseControlResolverError('Supabase control returned invalid JSON');
            }
            const catalog = CatalogResponseSchema.parse(parsed);
            const accounts = catalog.accounts.map((account) => ({
                id: account.id,
                label: account.label,
                authMode: account.authMode,
                token: account.token,
                allowMutations: account.allowMutations,
                allowedOrganizationSlugs: account.allowedOrganizationSlugs,
                allowedProjectRefs: account.allowedProjectRefs,
                grantedScopes: account.grantedScopes,
            }));
            return {
                accounts,
                timeoutMs: Number(process.env.SUPABASE_MANAGEMENT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
                maxResponseBytes: Number(process.env.SUPABASE_MANAGEMENT_MAX_RESPONSE_BYTES || DEFAULT_MAX_RESPONSE_BYTES),
            };
        }
        catch (error) {
            if (error instanceof SupabaseControlResolverError)
                throw error;
            if (error instanceof zod_1.z.ZodError) {
                throw new SupabaseControlResolverError('Supabase control returned an invalid account catalog');
            }
            if (error instanceof Error && error.name === 'AbortError') {
                throw new SupabaseControlResolverError('Supabase control request timed out');
            }
            throw new SupabaseControlResolverError('Supabase control request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.SupabaseControlResolver = SupabaseControlResolver;
//# sourceMappingURL=supabase-control-resolver.js.map