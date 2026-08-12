"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetaRemoteMcpApp = createMetaRemoteMcpApp;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const supabase_bearer_1 = require("../auth/supabase-bearer");
const processor_1 = require("../webhooks/processor");
const signature_1 = require("../webhooks/signature");
const handler_1 = require("./handler");
class FixedWindowRateLimiter {
    constructor(limit, now) {
        this.limit = limit;
        this.now = now;
        this.values = new Map();
    }
    consume(key) {
        const current = this.now();
        const existing = this.values.get(key);
        if (!existing || current - existing.windowStartedAt >= 60000) {
            this.values.set(key, { windowStartedAt: current, count: 1 });
            return { allowed: true, retryAfterSeconds: 0 };
        }
        if (existing.count >= this.limit) {
            const remaining = Math.max(1, 60000 - (current - existing.windowStartedAt));
            return { allowed: false, retryAfterSeconds: Math.ceil(remaining / 1000) };
        }
        existing.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
    }
}
function originAllowed(origin, allowedOrigins) {
    if (!origin) {
        return true;
    }
    try {
        return allowedOrigins.includes(new URL(origin).origin);
    }
    catch {
        return false;
    }
}
function acceptsMcpResponse(value) {
    const normalized = value?.toLowerCase() ?? '';
    return normalized.includes('*/*')
        || (normalized.includes('application/json') && normalized.includes('text/event-stream'));
}
function isInitialize(message) {
    return message.method === 'initialize';
}
function protocolVersionAllowed(value) {
    const version = value?.trim() || '2025-03-26';
    return handler_1.SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(version);
}
function setSecureResponseHeaders(response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
}
function jsonRpcHttpError(response, status, message) {
    setSecureResponseHeaders(response);
    response.status(status).json({
        jsonrpc: '2.0',
        error: { code: -32000, message },
        id: null,
    });
}
function resolveOperatorUiDirectory(options) {
    return options.operatorUiDirectory
        ?? process.env.MCPMASTER_CONTROL_TOWER_DIR
        ?? node_path_1.default.resolve(process.cwd(), 'apps/control-tower');
}
function loadOperatorUiDocument(directory) {
    try {
        return (0, node_fs_1.readFileSync)(node_path_1.default.join(directory, 'index.html'), 'utf8');
    }
    catch {
        return undefined;
    }
}
function createMetaRemoteMcpApp(options) {
    const app = (0, express_1.default)();
    const limiter = new FixedWindowRateLimiter(options.requestsPerMinute, options.now ?? Date.now);
    const operatorUiDirectory = resolveOperatorUiDirectory(options);
    const operatorUiHtml = loadOperatorUiDocument(operatorUiDirectory);
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
    app.use('/control-tower', express_1.default.static(operatorUiDirectory, {
        fallthrough: true,
        index: false,
        maxAge: '1h',
        setHeaders(response, filePath) {
            response.setHeader('X-Content-Type-Options', 'nosniff');
            if (filePath.endsWith('.html')) {
                response.setHeader('Cache-Control', 'no-store');
            }
        },
    }));
    app.get('/', (_request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (!operatorUiHtml) {
            response.status(503).json({
                status: 'operator_ui_unavailable',
                service: 'mcpmaster-meta-business-mcp',
            });
            return;
        }
        response.type('html').status(200).send(operatorUiHtml);
    });
    app.get('/health', (_request, response) => {
        setSecureResponseHeaders(response);
        response.json({
            status: 'ok',
            service: 'mcpmaster-meta-business-mcp',
            operatorUi: operatorUiHtml ? 'available' : 'unavailable',
            operatorApi: options.operatorApi ? 'available' : 'unavailable',
            externalWritesEnabled: false,
        });
    });
    app.use((request, response, next) => {
        if (options.requireHttps && !request.secure) {
            setSecureResponseHeaders(response);
            response.status(426).json({ status: 'https_required' });
            return;
        }
        next();
    });
    if (options.operatorApi) {
        app.use('/api/operator', options.operatorApi);
        app.use('/operator/api', options.operatorApi);
    }
    if (options.webhookVerifier) {
        app.get('/webhooks/meta', async (request, response) => {
            try {
                const challenge = await options.webhookVerifier?.verifyChallenge(typeof request.query['hub.mode'] === 'string' ? request.query['hub.mode'] : undefined, typeof request.query['hub.verify_token'] === 'string'
                    ? request.query['hub.verify_token']
                    : undefined, typeof request.query['hub.challenge'] === 'string'
                    ? request.query['hub.challenge']
                    : undefined);
                response.type('text/plain').status(200).send(challenge);
            }
            catch (error) {
                response.status(error instanceof signature_1.MetaWebhookVerificationError ? 403 : 500).send('Forbidden');
            }
        });
    }
    if (options.webhookProcessor) {
        app.post('/webhooks/meta', express_1.default.raw({
            type: 'application/json',
            limit: options.webhookBodyLimitBytes ?? 256 * 1024,
        }), async (request, response) => {
            try {
                if (!Buffer.isBuffer(request.body)) {
                    response.status(400).json({ status: 'rejected' });
                    return;
                }
                const result = await options.webhookProcessor?.process(request.body, request.header('x-hub-signature-256'));
                setSecureResponseHeaders(response);
                response.status(200).json(result);
            }
            catch (error) {
                const status = error instanceof signature_1.MetaWebhookVerificationError
                    ? 401
                    : error instanceof processor_1.MetaWebhookProcessingError
                        ? 400
                        : 500;
                setSecureResponseHeaders(response);
                response.status(status).json({
                    status: 'rejected',
                    code: error instanceof processor_1.MetaWebhookProcessingError ? error.code : 'webhook_rejected',
                });
            }
        });
    }
    const authenticate = async (request, response) => {
        if (!originAllowed(request.header('origin'), options.allowedOrigins)) {
            jsonRpcHttpError(response, 403, 'Forbidden origin');
            return null;
        }
        try {
            const identity = await options.authenticator.authenticate(request.header('authorization'));
            const membership = await options.membershipResolver.resolve(options.organizationId, identity.userId, identity.accessToken);
            if (!membership) {
                jsonRpcHttpError(response, 403, 'Active organization membership required');
                return null;
            }
            return { identity, membership };
        }
        catch (error) {
            if (error instanceof supabase_bearer_1.BearerAuthenticationError) {
                response.setHeader('WWW-Authenticate', 'Bearer');
                jsonRpcHttpError(response, error.status, error.message);
                return null;
            }
            jsonRpcHttpError(response, 503, 'Authentication service unavailable');
            return null;
        }
    };
    app.get('/mcp', async (request, response) => {
        if (!await authenticate(request, response)) {
            return;
        }
        response.setHeader('Allow', 'POST, GET');
        response.status(405).send('Method Not Allowed');
    });
    app.delete('/mcp', async (request, response) => {
        if (!await authenticate(request, response)) {
            return;
        }
        response.setHeader('Allow', 'POST, GET');
        response.status(405).send('Method Not Allowed');
    });
    app.post('/mcp', express_1.default.json({
        type: ['application/json', 'application/*+json'],
        limit: options.requestBodyLimitBytes,
        strict: true,
    }), async (request, response) => {
        if (!acceptsMcpResponse(request.header('accept'))) {
            jsonRpcHttpError(response, 406, 'Accept must include application/json and text/event-stream');
            return;
        }
        const message = request.body;
        if (Array.isArray(message) || typeof message !== 'object' || message === null) {
            jsonRpcHttpError(response, 400, 'MCP request body must be one JSON-RPC message');
            return;
        }
        if (!isInitialize(message) && !protocolVersionAllowed(request.header('mcp-protocol-version'))) {
            jsonRpcHttpError(response, 400, 'Unsupported MCP protocol version');
            return;
        }
        const actor = await authenticate(request, response);
        if (!actor) {
            return;
        }
        const rate = limiter.consume(actor.identity.userId);
        if (!rate.allowed) {
            response.setHeader('Retry-After', String(rate.retryAfterSeconds));
            jsonRpcHttpError(response, 429, 'Rate limit exceeded');
            return;
        }
        const result = await options.handler.handle(message, actor);
        setSecureResponseHeaders(response);
        if (result.notification) {
            response.status(202).end();
            return;
        }
        response.type('application/json').status(200).json(result.response);
    });
    app.use((error, _request, response, _next) => {
        if (error instanceof SyntaxError) {
            jsonRpcHttpError(response, 400, 'Invalid JSON request body');
            return;
        }
        jsonRpcHttpError(response, 500, 'Internal server error');
    });
    return app;
}
