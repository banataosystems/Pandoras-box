"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaWebhookSignatureVerifier = exports.MetaWebhookVerificationError = void 0;
const node_crypto_1 = require("node:crypto");
const resolver_1 = require("../secrets/resolver");
function safeEqualText(left, right) {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    return leftBuffer.length === rightBuffer.length && (0, node_crypto_1.timingSafeEqual)(leftBuffer, rightBuffer);
}
class MetaWebhookVerificationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MetaWebhookVerificationError';
    }
}
exports.MetaWebhookVerificationError = MetaWebhookVerificationError;
class MetaWebhookSignatureVerifier {
    constructor(options) {
        this.appSecretRef = options.appSecretRef.trim();
        this.verifyTokenSecretRef = options.verifyTokenSecretRef.trim();
        if (!this.appSecretRef || !this.verifyTokenSecretRef) {
            throw new Error('Webhook app-secret and verify-token references are required');
        }
        this.secretResolver = options.secretResolver;
    }
    async verifyDelivery(rawBody, signatureHeader) {
        if (!signatureHeader) {
            throw new MetaWebhookVerificationError('Missing X-Hub-Signature-256 header');
        }
        const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
        if (!match) {
            throw new MetaWebhookVerificationError('Malformed X-Hub-Signature-256 header');
        }
        const secret = await (0, resolver_1.resolveRequiredSecret)(this.secretResolver, this.appSecretRef);
        const expected = (0, node_crypto_1.createHmac)('sha256', secret.value).update(rawBody).digest('hex');
        const supplied = match[1].toLowerCase();
        if (!safeEqualText(expected, supplied)) {
            throw new MetaWebhookVerificationError('Webhook signature mismatch');
        }
    }
    async verifyChallenge(mode, verifyToken, challenge) {
        if (mode !== 'subscribe' || !verifyToken || challenge === undefined) {
            throw new MetaWebhookVerificationError('Invalid webhook verification challenge');
        }
        const expected = await (0, resolver_1.resolveRequiredSecret)(this.secretResolver, this.verifyTokenSecretRef);
        if (!safeEqualText(expected.value, verifyToken)) {
            throw new MetaWebhookVerificationError('Webhook verify token mismatch');
        }
        return challenge;
    }
}
exports.MetaWebhookSignatureVerifier = MetaWebhookSignatureVerifier;
