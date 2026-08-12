"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryMetaWebhookHealthStore = void 0;
class InMemoryMetaWebhookHealthStore {
    constructor() {
        this.health = new Map();
    }
    state(pageId) {
        const existing = this.health.get(pageId);
        if (existing) {
            return existing;
        }
        const created = {
            pageId,
            signatureVerificationEnabled: true,
            pendingDeliveries: 0,
            failedDeliveries: 0,
        };
        this.health.set(pageId, created);
        return created;
    }
    async recordAccepted(pageId, receivedAt) {
        const value = this.state(pageId);
        value.lastVerifiedAt = receivedAt;
        value.lastDeliveryAt = receivedAt;
    }
    async recordRejected(pageId, receivedAt) {
        if (!pageId) {
            return;
        }
        const value = this.state(pageId);
        value.lastDeliveryAt = receivedAt;
        value.failedDeliveries += 1;
    }
    async getWebhookHealth(pageId) {
        const value = this.health.get(pageId);
        if (!value) {
            return {
                pageId,
                status: 'unconfigured',
                signatureVerificationEnabled: true,
                pendingDeliveries: 0,
                failedDeliveries: 0,
            };
        }
        return {
            pageId,
            status: value.failedDeliveries > 0 ? 'degraded' : 'healthy',
            signatureVerificationEnabled: value.signatureVerificationEnabled,
            lastVerifiedAt: value.lastVerifiedAt,
            lastDeliveryAt: value.lastDeliveryAt,
            pendingDeliveries: value.pendingDeliveries,
            failedDeliveries: value.failedDeliveries,
        };
    }
}
exports.InMemoryMetaWebhookHealthStore = InMemoryMetaWebhookHealthStore;
