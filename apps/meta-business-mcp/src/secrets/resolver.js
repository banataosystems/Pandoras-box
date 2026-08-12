"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemorySecretResolver = exports.SecretResolutionError = void 0;
exports.resolveRequiredSecret = resolveRequiredSecret;
class SecretResolutionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SecretResolutionError';
    }
}
exports.SecretResolutionError = SecretResolutionError;
async function resolveRequiredSecret(resolver, secretRef) {
    const normalizedRef = secretRef.trim();
    if (!normalizedRef) {
        throw new SecretResolutionError('A non-empty server-side secret reference is required');
    }
    const resolved = await resolver.resolve(normalizedRef);
    if (!resolved.value || !resolved.value.trim()) {
        throw new SecretResolutionError(`Secret reference did not resolve to a value: ${normalizedRef}`);
    }
    return {
        ...resolved,
        value: resolved.value.trim(),
    };
}
class InMemorySecretResolver {
    constructor(initialValues = {}) {
        this.values = new Map();
        for (const [reference, value] of Object.entries(initialValues)) {
            this.values.set(reference, typeof value === 'string' ? { value } : { ...value });
        }
    }
    async resolve(secretRef) {
        const value = this.values.get(secretRef);
        if (!value) {
            throw new SecretResolutionError(`Unknown secret reference: ${secretRef}`);
        }
        return { ...value };
    }
}
exports.InMemorySecretResolver = InMemorySecretResolver;
