"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDACTED = void 0;
exports.redactSensitiveResult = redactSensitiveResult;
exports.containsKnownSecretMaterial = containsKnownSecretMaterial;
const REDACTED = '[REDACTED]';
exports.REDACTED = REDACTED;
const MAX_DEPTH = 24;
const SENSITIVE_KEY_PATTERN = /(?:^|[_-])(?:authorization|proxy[_-]?authorization|cookie|set[_-]?cookie|token|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|client[_-]?secret|password|passwd|passphrase|private[_-]?key|api[_-]?key|access[_-]?key|secret[_-]?key|service[_-]?role(?:[_-]?key)?|connection[_-]?string|database[_-]?url|dsn|credential|encrypted[_-]?password)(?:$|[_-])/i;
const SECRET_STRING_PATTERNS = [
    /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
    /\bgh[opurs]_[A-Za-z0-9_]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bsbp_[A-Za-z0-9_-]{20,}\b/g,
    /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/gi,
];
function sensitiveKey(key) {
    const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    return SENSITIVE_KEY_PATTERN.test(`_${normalized}_`);
}
function redactString(value) {
    let redacted = value;
    for (const pattern of SECRET_STRING_PATTERNS) {
        pattern.lastIndex = 0;
        redacted = redacted.replace(pattern, REDACTED);
    }
    return redacted;
}
function redactInternal(value, depth, seen) {
    if (depth > MAX_DEPTH)
        return '[MAX_DEPTH_REACHED]';
    if (typeof value === 'string')
        return redactString(value);
    if (value === null || typeof value !== 'object')
        return value;
    if (seen.has(value))
        return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) {
        return value.map((item) => redactInternal(item, depth + 1, seen));
    }
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
        output[key] = sensitiveKey(key)
            ? REDACTED
            : redactInternal(nested, depth + 1, seen);
    }
    return output;
}
function redactSensitiveResult(value) {
    return redactInternal(value, 0, new WeakSet());
}
function containsKnownSecretMaterial(value) {
    const rendered = JSON.stringify(redactSensitiveResult(value));
    if (!rendered)
        return false;
    return SECRET_STRING_PATTERNS.some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(rendered);
    });
}
//# sourceMappingURL=result-redaction.js.map