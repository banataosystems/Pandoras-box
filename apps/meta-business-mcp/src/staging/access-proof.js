"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaStagingAccessProofRunner = void 0;
exports.loadMetaStagingAccessProofConfig = loadMetaStagingAccessProofConfig;
const node_crypto_1 = require("node:crypto");
const official_read_provider_1 = require("../meta/official-read-provider");
const resolver_1 = require("../secrets/resolver");
const GRAPH_API_ORIGIN = 'https://graph.facebook.com';
const REQUIRED_READ_SCOPES = ['pages_read_engagement', 'pages_show_list'];
function optional(value) {
    const normalized = value?.trim();
    return normalized || undefined;
}
function required(environment, name) {
    const value = optional(environment[name]);
    if (!value) {
        throw new Error(`${name} is required for Meta staging access proof`);
    }
    return value;
}
function booleanValue(value, defaultValue) {
    if (value === undefined || value.trim() === '') {
        return defaultValue;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }
    throw new Error(`Expected true or false, received: ${value}`);
}
function integerValue(value, defaultValue, minimum, maximum, name) {
    if (value === undefined || value.trim() === '') {
        return defaultValue;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
}
function numericId(value, name) {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
        throw new Error(`${name} must be a numeric Meta identifier`);
    }
    return normalized;
}
function apiVersion(value) {
    const normalized = value.trim();
    if (!/^v\d+\.\d+$/.test(normalized)) {
        throw new Error('META_GRAPH_API_VERSION must match v<major>.<minor>');
    }
    return normalized;
}
function allowedPageIds(environment) {
    const values = required(environment, 'META_ALLOWED_PAGE_IDS')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (values.length === 0 || values.some((value) => value.includes('*'))) {
        throw new Error('META_ALLOWED_PAGE_IDS must contain exact Page IDs without wildcards');
    }
    return [...new Set(values.map((value) => numericId(value, 'META_ALLOWED_PAGE_IDS')))].sort();
}
function loadMetaStagingAccessProofConfig(environment = process.env) {
    if (environment.MCPMASTER_ENVIRONMENT !== 'staging') {
        throw new Error('MCPMASTER_ENVIRONMENT must be exactly staging');
    }
    if (!booleanValue(environment.META_STAGING_ACCESS_PROOF_ENABLED, false)) {
        throw new Error('META_STAGING_ACCESS_PROOF_ENABLED must be true');
    }
    if (booleanValue(environment.META_EXTERNAL_WRITES_ENABLED, false)) {
        throw new Error('Meta staging access proof refuses to run while external writes are enabled');
    }
    const expectedPageId = numericId(required(environment, 'META_STAGING_EXPECTED_PAGE_ID'), 'META_STAGING_EXPECTED_PAGE_ID');
    if (!allowedPageIds(environment).includes(expectedPageId)) {
        throw new Error('META_STAGING_EXPECTED_PAGE_ID must be present in META_ALLOWED_PAGE_IDS');
    }
    return {
        apiVersion: apiVersion(required(environment, 'META_GRAPH_API_VERSION')),
        expectedAppId: numericId(required(environment, 'META_APP_ID'), 'META_APP_ID'),
        expectedPageId,
        userAccessTokenSecretRef: required(environment, 'META_STAGING_META_USER_TOKEN_SECRET_REF'),
        debuggerAccessTokenSecretRef: required(environment, 'META_STAGING_META_DEBUGGER_TOKEN_SECRET_REF'),
        requestTimeoutMs: integerValue(environment.META_STAGING_ACCESS_PROOF_TIMEOUT_MS, 10000, 1000, 30000, 'META_STAGING_ACCESS_PROOF_TIMEOUT_MS'),
        maxResponseBytes: integerValue(environment.META_STAGING_ACCESS_PROOF_MAX_RESPONSE_BYTES, 256 * 1024, 16 * 1024, 1024 * 1024, 'META_STAGING_ACCESS_PROOF_MAX_RESPONSE_BYTES'),
    };
}
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : {};
}
function stringValue(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function numberValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function stringArray(value) {
    return Array.isArray(value)
        ? value.map(stringValue).filter((item) => Boolean(item))
        : [];
}
function parseGraphResponse(response, maxResponseBytes) {
    if (Buffer.byteLength(response.bodyText, 'utf8') > maxResponseBytes) {
        throw new Error('Meta access-proof response exceeded the configured size limit');
    }
    let parsed;
    try {
        parsed = JSON.parse(response.bodyText);
    }
    catch {
        throw new Error('Meta access-proof endpoint returned invalid JSON');
    }
    const body = record(parsed);
    if (response.status < 200 || response.status >= 300 || body.error !== undefined) {
        const error = record(body.error);
        const code = numberValue(error.code);
        throw new Error(`Meta access-proof request failed${code === undefined ? '' : ` with code ${code}`}`);
    }
    return body;
}
function identityHash(userId) {
    return (0, node_crypto_1.createHash)('sha256').update(`meta-user:${userId}`, 'utf8').digest('hex').slice(0, 16);
}
function expiryIsPast(value, nowMs) {
    const seconds = numberValue(value);
    return seconds !== undefined && seconds > 0 && seconds * 1000 <= nowMs;
}
class MetaStagingAccessProofRunner {
    constructor(options) {
        this.options = options;
        this.transport = options.transport ?? new official_read_provider_1.FetchMetaHttpTransport();
        this.now = options.now ?? Date.now;
    }
    async run() {
        const userToken = await (0, resolver_1.resolveRequiredSecret)(this.options.secretResolver, this.options.config.userAccessTokenSecretRef);
        const debuggerToken = await (0, resolver_1.resolveRequiredSecret)(this.options.secretResolver, this.options.config.debuggerAccessTokenSecretRef);
        const checks = [];
        const debugStartedAt = this.now();
        const debugUrl = new URL(`${GRAPH_API_ORIGIN}/${this.options.config.apiVersion}/debug_token`);
        debugUrl.searchParams.set('input_token', userToken.value);
        const debugResponse = await this.transport.send({
            method: 'GET',
            url: debugUrl.toString(),
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${debuggerToken.value}`,
                'user-agent': 'MCPMaster-Meta-Staging-Access-Proof/1.0',
            },
            timeoutMs: this.options.config.requestTimeoutMs,
        });
        const debug = record(parseGraphResponse(debugResponse, this.options.config.maxResponseBytes).data);
        if (debug.is_valid !== true) {
            throw new Error('Meta user token is not valid');
        }
        if (stringValue(debug.type) !== 'USER') {
            throw new Error('Meta access proof requires a human USER token');
        }
        if (String(debug.app_id ?? '') !== this.options.config.expectedAppId) {
            throw new Error('Meta token was not issued by the expected staging App ID');
        }
        const userId = stringValue(debug.user_id);
        if (!userId) {
            throw new Error('Meta token debug response did not include a user identity');
        }
        const nowMs = this.now();
        if (expiryIsPast(debug.expires_at, nowMs) || expiryIsPast(debug.data_access_expires_at, nowMs)) {
            throw new Error('Meta user token or data access has expired');
        }
        checks.push({
            name: 'human_token_provenance',
            ok: true,
            durationMs: this.now() - debugStartedAt,
            detail: 'valid human token issued by the expected staging App ID',
        });
        const scopes = [...new Set(stringArray(debug.scopes))].sort();
        const missingScopes = REQUIRED_READ_SCOPES.filter((scope) => !scopes.includes(scope));
        if (missingScopes.length > 0) {
            throw new Error(`Meta user token is missing required read scopes: ${missingScopes.join(', ')}`);
        }
        checks.push({
            name: 'least_privilege_read_scopes',
            ok: true,
            durationMs: 0,
            detail: 'required Page discovery and read-engagement scopes are present',
        });
        const pagesStartedAt = this.now();
        const pagesUrl = new URL(`${GRAPH_API_ORIGIN}/${this.options.config.apiVersion}/me/accounts`);
        pagesUrl.searchParams.set('fields', 'id,name,tasks');
        const pagesResponse = await this.transport.send({
            method: 'GET',
            url: pagesUrl.toString(),
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${userToken.value}`,
                'user-agent': 'MCPMaster-Meta-Staging-Access-Proof/1.0',
            },
            timeoutMs: this.options.config.requestTimeoutMs,
        });
        const pageRows = parseGraphResponse(pagesResponse, this.options.config.maxResponseBytes).data;
        const pages = Array.isArray(pageRows) ? pageRows.map(record) : [];
        const page = pages.find((item) => String(item.id ?? '') === this.options.config.expectedPageId);
        if (!page) {
            throw new Error('Authenticated Meta user cannot access the expected allowlisted Page ID');
        }
        const pageTasks = [...new Set(stringArray(page.tasks))].sort();
        checks.push({
            name: 'allowlisted_page_access',
            ok: true,
            durationMs: this.now() - pagesStartedAt,
            detail: 'authenticated human can access the exact allowlisted Page ID',
        });
        checks.push({
            name: 'external_write_boundary',
            ok: true,
            durationMs: 0,
            detail: 'proof performed only token inspection and Page-list reads; connector unchanged',
        });
        return {
            environment: 'staging',
            externalWritesEnabled: false,
            appId: this.options.config.expectedAppId,
            pageId: this.options.config.expectedPageId,
            tokenType: 'USER',
            userIdentityHash: identityHash(userId),
            scopes,
            pageTasks,
            checks,
            completedAt: new Date(this.now()).toISOString(),
        };
    }
}
exports.MetaStagingAccessProofRunner = MetaStagingAccessProofRunner;
