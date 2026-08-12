"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyProjectOSFailure = classifyProjectOSFailure;
exports.decideProjectOSRepair = decideProjectOSRepair;
const includesAny = (value, patterns) => patterns.some((pattern) => value.includes(pattern));
function stoppedForInvalidEvidence(reason) {
    return {
        kind: 'unknown',
        retryAllowed: false,
        maxAttempts: 1,
        invalidateReview: false,
        invalidateChecks: false,
        fallbackAllowed: false,
        ownerActionRequired: false,
        nextAction: 'stop',
        reason,
    };
}
function classifyProjectOSFailure(evidence) {
    const message = `${evidence.source} ${evidence.checkName ?? ''} ${evidence.message}`.toLowerCase();
    const status = evidence.providerStatus;
    if (includesAny(message, ['quota', 'rate limit', 'capacity exhausted', 'review limit'])) {
        return message.includes('review') ? 'review-capacity' : 'quota';
    }
    if (includesAny(message, ['credential', 'oauth token', 'api key', 'unauthorized', 'expired token'])) {
        return 'credential';
    }
    if (includesAny(message, ['merge conflict', 'conflicting files', 'not mergeable']))
        return 'merge-conflict';
    if (includesAny(message, ['permission denied', 'forbidden', 'insufficient permission']))
        return 'permission';
    if (includesAny(message, ['product decision', 'owner decision', 'requirements unclear']))
        return 'product-decision';
    const explicitlyTransient = status === 408
        || status === 429
        || (typeof status === 'number' && status >= 500)
        || includesAny(message, [
            'timeout',
            'timed out',
            'runner lost',
            'network error',
            'temporarily unavailable',
            'service unavailable',
        ]);
    if (explicitlyTransient) {
        return evidence.source.toLowerCase().includes('provider') ? 'provider-outage' : 'transient-check';
    }
    const explicitlyDeterministic = includesAny(message, [
        'assertion',
        'typecheck',
        'type-check',
        'lint',
        'format',
        'test failed',
        'tests failed',
        'compile',
        'migration failed',
        'schema mismatch',
        'vulnerability found',
        'dependency violation',
    ]);
    if (explicitlyDeterministic || includesAny(message, ['database', 'codeql', 'dependency review'])) {
        return 'deterministic-check';
    }
    return 'unknown';
}
function decideProjectOSRepair(evidence) {
    if (!Number.isInteger(evidence.attempt) || evidence.attempt < 1) {
        return stoppedForInvalidEvidence('Failure evidence has an invalid attempt number; stop rather than reset retry limits.');
    }
    if (evidence.exactHeadSha !== undefined && !/^[0-9a-f]{40}$/.test(evidence.exactHeadSha)) {
        return stoppedForInvalidEvidence('Failure evidence is not bound to a valid exact head SHA.');
    }
    const kind = classifyProjectOSFailure(evidence);
    const attempt = evidence.attempt;
    if (kind === 'deterministic-check') {
        return {
            kind,
            retryAllowed: attempt < 3,
            maxAttempts: 3,
            invalidateReview: true,
            invalidateChecks: true,
            fallbackAllowed: false,
            ownerActionRequired: false,
            nextAction: attempt < 3 ? 'repair-code' : 'stop',
            reason: attempt < 3
                ? 'Repair the evidenced failure, create a new exact head, and rerun every gate.'
                : 'The bounded repair limit is exhausted; preserve evidence and stop.',
        };
    }
    if (kind === 'transient-check' || kind === 'provider-outage') {
        return {
            kind,
            retryAllowed: attempt < 2,
            maxAttempts: 2,
            invalidateReview: false,
            invalidateChecks: true,
            fallbackAllowed: attempt >= 2,
            ownerActionRequired: false,
            nextAction: attempt < 2 ? 'rerun-check' : 'switch-agent',
            reason: attempt < 2
                ? 'One bounded retry is allowed because no source repair is indicated.'
                : 'The retry limit is exhausted; use an eligible proven fallback or stop.',
        };
    }
    if (kind === 'review-capacity') {
        return {
            kind,
            retryAllowed: false,
            maxAttempts: 1,
            invalidateReview: false,
            invalidateChecks: false,
            fallbackAllowed: true,
            ownerActionRequired: false,
            nextAction: 'switch-agent',
            reason: 'Use another proven different-vendor reviewer; never treat quota failure as approval.',
        };
    }
    if (kind === 'quota') {
        return {
            kind,
            retryAllowed: false,
            maxAttempts: 1,
            invalidateReview: false,
            invalidateChecks: false,
            fallbackAllowed: true,
            ownerActionRequired: false,
            nextAction: 'switch-agent',
            reason: 'Route to included proven capacity before considering any metered option.',
        };
    }
    if (kind === 'credential') {
        return {
            kind,
            retryAllowed: false,
            maxAttempts: 1,
            invalidateReview: false,
            invalidateChecks: false,
            fallbackAllowed: true,
            ownerActionRequired: true,
            nextAction: 'refresh-credential',
            reason: 'A missing or expired credential requires an authorized credential repair or a proven fallback.',
        };
    }
    if (kind === 'merge-conflict') {
        return {
            kind,
            retryAllowed: attempt < 2,
            maxAttempts: 2,
            invalidateReview: true,
            invalidateChecks: true,
            fallbackAllowed: false,
            ownerActionRequired: false,
            nextAction: attempt < 2 ? 'resolve-conflict' : 'stop',
            reason: 'Resolve without rewriting published history, then revalidate the new exact head.',
        };
    }
    if (kind === 'permission') {
        return {
            kind,
            retryAllowed: false,
            maxAttempts: 1,
            invalidateReview: false,
            invalidateChecks: false,
            fallbackAllowed: false,
            ownerActionRequired: true,
            nextAction: 'request-decision',
            reason: 'The required permission is unavailable and cannot be guessed or bypassed.',
        };
    }
    if (kind === 'product-decision') {
        return {
            kind,
            retryAllowed: false,
            maxAttempts: 1,
            invalidateReview: false,
            invalidateChecks: false,
            fallbackAllowed: false,
            ownerActionRequired: true,
            nextAction: 'request-decision',
            reason: 'The next step depends on a genuine owner or product decision.',
        };
    }
    return stoppedForInvalidEvidence('The failure is not classified safely enough for automatic action.');
}
//# sourceMappingURL=repair-policy.js.map