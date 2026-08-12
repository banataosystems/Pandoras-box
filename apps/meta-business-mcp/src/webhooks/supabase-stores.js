"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseMetaWebhookHealthStore = exports.SupabaseMetaWebhookClaimStore = void 0;
const rest_client_1 = require("../supabase/rest-client");
function serviceClient(options) {
    return new rest_client_1.SupabaseRestClient({
        supabaseUrl: options.supabaseUrl,
        apiKey: options.serviceKey,
        accessToken: options.serviceKey,
        fetchFn: options.fetchFn,
        timeoutMs: options.timeoutMs,
    });
}
function payloadHashFromDeliveryId(deliveryId) {
    const match = /^meta:([0-9a-f]{64})$/.exec(deliveryId);
    if (!match) {
        throw new Error('Meta webhook delivery ID must contain a SHA-256 payload hash');
    }
    return match[1];
}
class SupabaseMetaWebhookClaimStore {
    constructor(options) {
        this.client = serviceClient(options);
        this.organizationId = options.organizationId;
        this.installationId = options.installationId;
    }
    async claim(deliveryId, expiresAt) {
        const payload = await this.client.requestJson('/rest/v1/rpc/claim_meta_webhook_delivery', {
            method: 'POST',
            body: JSON.stringify({
                p_organization_id: this.organizationId,
                p_installation_id: this.installationId,
                p_delivery_id: deliveryId,
                p_payload_hash: payloadHashFromDeliveryId(deliveryId),
                p_expires_at: expiresAt,
            }),
        });
        if (typeof payload !== 'boolean') {
            throw new Error('Supabase returned an invalid webhook claim response');
        }
        return payload;
    }
}
exports.SupabaseMetaWebhookClaimStore = SupabaseMetaWebhookClaimStore;
function rowToHealth(value, pageId) {
    const row = typeof value === 'object' && value !== null
        ? value
        : {};
    const failedDeliveries = row.failed_deliveries;
    const pendingDeliveries = row.pending_deliveries;
    if (row.page_id !== pageId
        || typeof row.signature_verification_enabled !== 'boolean'
        || typeof failedDeliveries !== 'number'
        || typeof pendingDeliveries !== 'number') {
        throw new Error('Supabase returned an invalid Meta webhook health row');
    }
    return {
        pageId,
        status: failedDeliveries > 0 ? 'degraded' : 'healthy',
        signatureVerificationEnabled: row.signature_verification_enabled,
        lastVerifiedAt: typeof row.last_verified_at === 'string' ? row.last_verified_at : undefined,
        lastDeliveryAt: typeof row.last_delivery_at === 'string' ? row.last_delivery_at : undefined,
        pendingDeliveries,
        failedDeliveries,
    };
}
class SupabaseMetaWebhookHealthStore {
    constructor(options) {
        this.client = serviceClient(options);
        this.organizationId = options.organizationId;
    }
    async recordAccepted(pageId, receivedAt) {
        await this.record(pageId, receivedAt, true);
    }
    async recordRejected(pageId, receivedAt) {
        if (!pageId) {
            return;
        }
        await this.record(pageId, receivedAt, false);
    }
    async record(pageId, receivedAt, accepted) {
        await this.client.requestJson('/rest/v1/rpc/record_meta_webhook_health', {
            method: 'POST',
            body: JSON.stringify({
                p_organization_id: this.organizationId,
                p_page_id: pageId,
                p_accepted: accepted,
                p_received_at: receivedAt,
            }),
        });
    }
    async getWebhookHealth(pageId) {
        const query = new URLSearchParams({
            select: 'page_id,signature_verification_enabled,last_verified_at,last_delivery_at,pending_deliveries,failed_deliveries',
            organization_id: `eq.${this.organizationId}`,
            page_id: `eq.${pageId}`,
            limit: '1',
        });
        const payload = await this.client.requestJson(`/rest/v1/meta_webhook_health?${query.toString()}`);
        if (!Array.isArray(payload) || payload.length === 0) {
            return {
                pageId,
                status: 'unconfigured',
                signatureVerificationEnabled: true,
                pendingDeliveries: 0,
                failedDeliveries: 0,
            };
        }
        return rowToHealth(payload[0], pageId);
    }
}
exports.SupabaseMetaWebhookHealthStore = SupabaseMetaWebhookHealthStore;
