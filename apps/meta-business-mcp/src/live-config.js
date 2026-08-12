"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMetaLiveConfig = loadMetaLiveConfig;
const config_1 = require("./config");
function optional(value) {
    const normalized = value?.trim();
    return normalized || undefined;
}
function parseBoolean(value, defaultValue) {
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
function parseInteger(value, defaultValue, minimum, maximum, variableName) {
    if (value === undefined || value.trim() === '') {
        return defaultValue;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${variableName} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
}
function graphApiVersion(value) {
    const normalized = optional(value);
    if (!normalized || !/^v\d+\.\d+$/.test(normalized)) {
        throw new Error('META_GRAPH_API_VERSION must match v<major>.<minor>');
    }
    return normalized;
}
function loadMetaLiveConfig(environment = process.env) {
    if (optional(environment.META_WEBHOOK_VERIFY_TOKEN)) {
        throw new Error('META_WEBHOOK_VERIFY_TOKEN is forbidden. Configure a server-side secret reference instead.');
    }
    const base = (0, config_1.loadMetaBusinessConfig)(environment);
    if (!base.networkEnabled) {
        throw new Error('Live Meta configuration requires META_NETWORK_ENABLED=true');
    }
    const config = {
        ...base,
        graphApiVersion: graphApiVersion(environment.META_GRAPH_API_VERSION),
        webhooksEnabled: parseBoolean(environment.META_WEBHOOKS_ENABLED, false),
        webhookVerifyTokenSecretRef: optional(environment.META_WEBHOOK_VERIFY_TOKEN_SECRET_REF),
        requestTimeoutMs: parseInteger(environment.META_REQUEST_TIMEOUT_MS, 10000, 1000, 30000, 'META_REQUEST_TIMEOUT_MS'),
        webhookMaxBodyBytes: parseInteger(environment.META_WEBHOOK_MAX_BODY_BYTES, 256 * 1024, 1024, 1024 * 1024, 'META_WEBHOOK_MAX_BODY_BYTES'),
    };
    if (config.webhooksEnabled && !config.webhookVerifyTokenSecretRef) {
        throw new Error('Meta webhook mode is missing required configuration: META_WEBHOOK_VERIFY_TOKEN_SECRET_REF');
    }
    return config;
}
