"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadOperatorPublicConfig = loadOperatorPublicConfig;
const DEFAULT_SUPABASE_URL = 'https://jcyqixttuebxqqfkjonq.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LGu6ncwUVEYI5THBjSV-3g_71AInQZt';
const DEFAULT_ORGANIZATION_ID = '2270b266-59da-4c39-bfd9-9f8d08352af0';
const DEFAULT_ALLOWED_ORIGINS = [
    'https://mcpmaster.vercel.app',
];
function configuredValue(environment, names, fallback) {
    for (const name of names) {
        const value = environment[name]?.trim();
        if (value)
            return value;
    }
    return fallback;
}
function httpsOrigin(value, name) {
    const url = new URL(value);
    if (url.protocol !== 'https:'
        || url.username
        || url.password
        || url.search
        || url.hash) {
        throw new Error(`${name} must be an HTTPS origin`);
    }
    return url.origin;
}
function uuid(value, name) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error(`${name} must be a UUID`);
    }
    return value;
}
function publishableKey(value) {
    if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value)) {
        throw new Error('The operator API requires a modern Supabase publishable key');
    }
    return value;
}
function allowedOrigins(value) {
    const origins = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => {
        if (origin.includes('*')) {
            throw new Error('Operator API origins cannot contain wildcards');
        }
        return httpsOrigin(origin, 'Operator API origin');
    });
    if (origins.length === 0 || origins.length > 10) {
        throw new Error('Operator API origins must contain between one and ten exact origins');
    }
    return [...new Set(origins)];
}
function loadOperatorPublicConfig(environment = process.env) {
    const supabaseUrl = httpsOrigin(configuredValue(environment, ['MCPMASTER_OPERATOR_SUPABASE_URL', 'SUPABASE_URL'], DEFAULT_SUPABASE_URL), 'Supabase URL');
    const supabasePublishableKey = publishableKey(configuredValue(environment, ['MCPMASTER_OPERATOR_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'], DEFAULT_SUPABASE_PUBLISHABLE_KEY));
    const organizationId = uuid(configuredValue(environment, ['MCPMASTER_OPERATOR_ORGANIZATION_ID', 'META_REMOTE_MCP_ORGANIZATION_ID'], DEFAULT_ORGANIZATION_ID), 'Operator organization ID');
    const origins = allowedOrigins(configuredValue(environment, ['MCPMASTER_OPERATOR_ALLOWED_ORIGINS', 'META_REMOTE_MCP_ALLOWED_ORIGINS'], DEFAULT_ALLOWED_ORIGINS.join(',')));
    const requestsPerMinute = Number.parseInt(environment.MCPMASTER_OPERATOR_REQUESTS_PER_MINUTE || '60', 10);
    if (!Number.isInteger(requestsPerMinute)
        || requestsPerMinute < 5
        || requestsPerMinute > 300) {
        throw new Error('MCPMASTER_OPERATOR_REQUESTS_PER_MINUTE must be between 5 and 300');
    }
    return {
        supabaseUrl,
        supabasePublishableKey,
        organizationId,
        allowedOrigins: origins,
        requestsPerMinute,
    };
}
//# sourceMappingURL=operator-public-config.js.map