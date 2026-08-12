"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vercelFunctionConfig = void 0;
exports.normalizeVercelApiUrl = normalizeVercelApiUrl;
exports.applyVercelCors = applyVercelCors;
exports.handleMcpMasterApi = handleMcpMasterApi;
const http_server_js_1 = require("./http-server.js");
const runtime_security_resolver_js_1 = require("./runtime/runtime-security-resolver.js");
const DEFAULT_PRODUCTION_ORIGIN = 'https://mcpmaster.vercel.app';
const ALLOWED_METHODS = 'GET,POST,OPTIONS';
const ALLOWED_HEADERS = [
    'Authorization',
    'Content-Type',
    'X-Approval-Token',
    'X-Approver-Id',
    'X-Request-Id',
].join(',');
let app;
let runtimeSecurityResolver;
function runtime() {
    if (!app)
        app = (0, http_server_js_1.createHttpApp)();
    return app;
}
function securityResolver() {
    if (!runtimeSecurityResolver)
        runtimeSecurityResolver = new runtime_security_resolver_js_1.RuntimeSecurityResolver();
    return runtimeSecurityResolver;
}
function headerValue(value) {
    return Array.isArray(value) ? value[0] : value;
}
function configuredOrigins() {
    return (process.env.CORS_ALLOWED_ORIGINS || DEFAULT_PRODUCTION_ORIGIN)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}
exports.vercelFunctionConfig = {
    api: {
        bodyParser: false,
    },
    maxDuration: 60,
};
function normalizeVercelApiUrl(originalUrl) {
    const normalizedUrl = (originalUrl || '/').replace(/^\/api(?=\/|\?|$)/, '') || '/';
    return normalizedUrl.startsWith('?') ? `/${normalizedUrl}` : normalizedUrl;
}
async function applyVercelCors(request, response, resolver = securityResolver()) {
    const origin = headerValue(request.headers.origin);
    if (!origin)
        return false;
    let allowedOrigins = configuredOrigins();
    const oidcToken = headerValue(request.headers['x-vercel-oidc-token'])
        || process.env.VERCEL_OIDC_TOKEN
        || undefined;
    if (oidcToken) {
        try {
            const security = await resolver.resolve(oidcToken);
            allowedOrigins = security.allowedOrigins;
        }
        catch {
            // Fail closed for any origin not present in the local canonical fallback.
        }
    }
    if (!allowedOrigins.includes(origin)) {
        response.status(403).json({
            ok: false,
            error: {
                code: 'CORS_ORIGIN_NOT_ALLOWED',
                message: 'Origin is not allowed.',
            },
        });
        return true;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    response.setHeader('Vary', 'Origin');
    // The inner Express app retains its local/Docker CORS policy. Remove the
    // already validated Vercel Origin so it cannot reject a remotely authorized
    // production alias or add a broader header.
    delete request.headers.origin;
    if (request.method === 'OPTIONS') {
        response.status(204).end();
        return true;
    }
    return false;
}
async function handleMcpMasterApi(request, response) {
    request.url = normalizeVercelApiUrl(request.url);
    if (await applyVercelCors(request, response))
        return;
    return runtime()(request, response);
}
//# sourceMappingURL=vercel-handler.js.map