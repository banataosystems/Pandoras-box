"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaWebhookProcessor = exports.MetaWebhookProcessingError = exports.InMemoryMetaWebhookClaimStore = void 0;
const node_crypto_1 = require("node:crypto");
const index_1 = require("../../../../packages/shared-security/dist/index");
class InMemoryMetaWebhookClaimStore {
    constructor(now = () => new Date()) {
        this.claims = new Map();
        this.now = now;
    }
    async claim(deliveryId, expiresAt) {
        const now = this.now().getTime();
        for (const [key, expiresAtMs] of this.claims.entries()) {
            if (expiresAtMs <= now) {
                this.claims.delete(key);
            }
        }
        if (this.claims.has(deliveryId)) {
            return false;
        }
        this.claims.set(deliveryId, Date.parse(expiresAt));
        return true;
    }
}
exports.InMemoryMetaWebhookClaimStore = InMemoryMetaWebhookClaimStore;
class MetaWebhookProcessingError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'MetaWebhookProcessingError';
        this.code = code;
    }
}
exports.MetaWebhookProcessingError = MetaWebhookProcessingError;
function record(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function stringValue(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function arrays(value) {
    return Array.isArray(value) ? value : [];
}
function eventTypesForEntry(entry) {
    const types = new Set();
    for (const changeValue of arrays(entry.changes)) {
        const field = stringValue(record(changeValue).field);
        if (field) {
            types.add(`change:${field}`);
        }
    }
    for (const messagingValue of arrays(entry.messaging)) {
        const messaging = record(messagingValue);
        for (const candidate of ['message', 'postback', 'read', 'delivery', 'reaction']) {
            if (messaging[candidate] !== undefined) {
                types.add(`messaging:${candidate}`);
            }
        }
    }
    return [...types].sort();
}
function parsePayload(rawBody) {
    try {
        return record(JSON.parse(rawBody.toString('utf8')));
    }
    catch {
        throw new MetaWebhookProcessingError('invalid_json', 'Webhook body must be valid JSON');
    }
}
class MetaWebhookProcessor {
    constructor(options) {
        this.signatureVerifier = options.signatureVerifier;
        this.claimStore = options.claimStore;
        this.healthStore = options.healthStore;
        this.allowedPageIds = options.allowedPageIds;
        this.maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;
        this.replayWindowSeconds = options.replayWindowSeconds ?? 24 * 60 * 60;
        this.now = options.now ?? (() => new Date());
        if (!Number.isInteger(this.maxBodyBytes) || this.maxBodyBytes < 1024 || this.maxBodyBytes > 1024 * 1024) {
            throw new Error('Webhook maximum body size must be between 1024 and 1048576 bytes');
        }
        if (!Number.isInteger(this.replayWindowSeconds) || this.replayWindowSeconds < 60 || this.replayWindowSeconds > 7 * 24 * 60 * 60) {
            throw new Error('Webhook replay window must be between 60 seconds and 7 days');
        }
    }
    async process(rawBody, signatureHeader) {
        if (rawBody.length === 0 || rawBody.length > this.maxBodyBytes) {
            throw new MetaWebhookProcessingError('invalid_body_size', 'Webhook body size is outside the allowed range');
        }
        await this.signatureVerifier.verifyDelivery(rawBody, signatureHeader);
        const receivedAt = this.now().toISOString();
        const payloadHash = (0, node_crypto_1.createHash)('sha256').update(rawBody).digest('hex');
        const deliveryId = `meta:${payloadHash}`;
        const expiresAt = new Date(this.now().getTime() + this.replayWindowSeconds * 1000).toISOString();
        const firstSeen = await this.claimStore.claim(deliveryId, expiresAt);
        if (!firstSeen) {
            return { status: 'duplicate', deliveryId, payloadHash, receivedAt };
        }
        const payload = parsePayload(rawBody);
        if (payload.object !== 'page') {
            return {
                status: 'ignored',
                deliveryId,
                payloadHash,
                reason: 'unsupported_object',
                receivedAt,
            };
        }
        const entries = arrays(payload.entry).map(record);
        if (entries.length === 0) {
            return {
                status: 'ignored',
                deliveryId,
                payloadHash,
                reason: 'empty_delivery',
                receivedAt,
            };
        }
        if (entries.length > 100) {
            throw new MetaWebhookProcessingError('too_many_entries', 'Webhook delivery contains too many entries');
        }
        const pageIds = [...new Set(entries.map((entry) => stringValue(entry.id)).filter((value) => Boolean(value)))];
        if (pageIds.length !== entries.length) {
            throw new MetaWebhookProcessingError('missing_page_id', 'Every webhook entry must contain a Page ID');
        }
        const disallowed = pageIds.find((pageId) => !(0, index_1.isPageAllowed)(pageId, this.allowedPageIds));
        if (disallowed) {
            await this.healthStore.recordRejected(disallowed, receivedAt);
            throw new MetaWebhookProcessingError('page_not_allowlisted', `Webhook Page is not allowlisted: ${disallowed}`);
        }
        const eventTypes = [...new Set(entries.flatMap(eventTypesForEntry))].sort();
        for (const pageId of pageIds) {
            await this.healthStore.recordAccepted(pageId, receivedAt);
        }
        return {
            status: 'accepted',
            deliveryId,
            payloadHash,
            pageIds,
            eventTypes,
            receivedAt,
        };
    }
}
exports.MetaWebhookProcessor = MetaWebhookProcessor;
