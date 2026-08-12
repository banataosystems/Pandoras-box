"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qualifyAgent = qualifyAgent;
exports.qualifyAgents = qualifyAgents;
const FUTURE_EVIDENCE_SKEW_MS = 60000;
const clamp = (value) => Math.max(0, Math.min(100, value));
function finiteNonNegative(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}
function validNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}
function successScore(evidence) {
    const attempts = Math.floor(finiteNonNegative(evidence.completedAttempts));
    const successes = Math.min(attempts, Math.floor(finiteNonNegative(evidence.successfulAttempts)));
    const reviewRejections = Math.floor(finiteNonNegative(evidence.reviewRejections));
    const repairCycles = Math.floor(finiteNonNegative(evidence.repairCycles));
    if (attempts === 0)
        return 40;
    const smoothed = ((successes + 2) / (attempts + 4)) * 100;
    const qualityPenalty = Math.min(35, reviewRejections * 8 + repairCycles * 3);
    return clamp(smoothed - qualityPenalty);
}
function quotaScore(state) {
    if (state === 'available')
        return 100;
    if (state === 'limited')
        return 45;
    return 0;
}
function healthScore(state) {
    if (state === 'healthy')
        return 100;
    if (state === 'degraded')
        return 45;
    return 0;
}
function loadScore(activeLeases, maxConcurrentLeases) {
    const maximum = Math.floor(finiteNonNegative(maxConcurrentLeases));
    const active = Math.floor(finiteNonNegative(activeLeases));
    if (maximum <= 0 || active >= maximum)
        return 0;
    return clamp((1 - active / maximum) * 100);
}
function contextScore(contextUpdatedAt, now, maxAgeMs) {
    if (!Number.isFinite(now) || !Number.isFinite(contextUpdatedAt))
        return 0;
    const observed = Number(contextUpdatedAt);
    if (observed > now + FUTURE_EVIDENCE_SKEW_MS)
        return 0;
    const age = Math.max(0, now - observed);
    if (age >= maxAgeMs)
        return 0;
    return clamp((1 - age / maxAgeMs) * 100);
}
function latencyScore(medianLatencyMs, targetLatencyMs) {
    if (!Number.isFinite(medianLatencyMs))
        return 35;
    const latency = Math.max(0, Number(medianLatencyMs));
    if (latency <= targetLatencyMs)
        return 100;
    return clamp((targetLatencyMs / latency) * 100);
}
function qualifyAgent(evidence, request) {
    const agentId = evidence.id.trim();
    const vendor = evidence.vendor.trim();
    const maxEvidenceAgeMs = Number.isFinite(request.maxEvidenceAgeMs)
        ? Math.max(60000, Math.floor(request.maxEvidenceAgeMs))
        : 24 * 60 * 60 * 1000;
    const targetLatencyMs = Number.isFinite(request.targetLatencyMs)
        ? Math.max(1000, Math.floor(request.targetLatencyMs))
        : 10 * 60 * 1000;
    const requestTimeValid = Number.isFinite(request.now) && request.now >= 0;
    const evidenceTimeValid = Number.isFinite(evidence.observedAt) && evidence.observedAt >= 0;
    const evidenceFromFuture = requestTimeValid
        && evidenceTimeValid
        && evidence.observedAt > request.now + FUTURE_EVIDENCE_SKEW_MS;
    const evidenceAgeMs = requestTimeValid && evidenceTimeValid && !evidenceFromFuture
        ? Math.max(0, request.now - evidence.observedAt)
        : Number.POSITIVE_INFINITY;
    const blockers = [];
    const warnings = [];
    const repositoryProven = evidence.repositoryScopes.includes(request.repository);
    const capabilityProven = evidence.provenCapabilities.includes(request.capability);
    if (!agentId)
        blockers.push('agent ID is empty');
    if (!vendor)
        blockers.push('agent vendor is empty');
    if (!requestTimeValid)
        blockers.push('qualification request time is invalid');
    if (!evidenceTimeValid)
        blockers.push('qualification evidence time is invalid');
    if (evidenceFromFuture)
        blockers.push('qualification evidence is from the future');
    if (!evidence.phoneOnlyCompatible)
        blockers.push('agent is not phone-only compatible');
    if (!repositoryProven)
        blockers.push(`repository proof is missing for ${request.repository}`);
    if (!capabilityProven)
        blockers.push(`capability proof is missing for ${request.capability}`);
    if (evidence.credentialState !== 'ready')
        blockers.push(`credential state is ${evidence.credentialState}`);
    if (evidence.quotaState === 'exhausted' || evidence.quotaState === 'unknown') {
        blockers.push(`quota state is ${evidence.quotaState}`);
    }
    if (evidence.healthState === 'unavailable' || evidence.healthState === 'unknown') {
        blockers.push(`health state is ${evidence.healthState}`);
    }
    if (!evidenceFromFuture && evidenceAgeMs > maxEvidenceAgeMs)
        blockers.push('qualification evidence is stale');
    const counters = [
        ['completed attempts', evidence.completedAttempts],
        ['successful attempts', evidence.successfulAttempts],
        ['review rejections', evidence.reviewRejections],
        ['repair cycles', evidence.repairCycles],
        ['active leases', evidence.activeLeases],
        ['maximum concurrent leases', evidence.maxConcurrentLeases],
    ];
    for (const [label, value] of counters) {
        if (!validNonNegativeInteger(value))
            blockers.push(`${label} evidence is invalid`);
    }
    if (validNonNegativeInteger(evidence.completedAttempts)
        && validNonNegativeInteger(evidence.successfulAttempts)
        && evidence.successfulAttempts > evidence.completedAttempts)
        blockers.push('successful attempts exceed completed attempts');
    if (evidence.medianLatencyMs !== undefined
        && (!Number.isFinite(evidence.medianLatencyMs) || evidence.medianLatencyMs < 0))
        blockers.push('median latency evidence is invalid');
    if (evidence.contextUpdatedAt !== undefined
        && (!Number.isFinite(evidence.contextUpdatedAt) || evidence.contextUpdatedAt < 0))
        blockers.push('context update time is invalid');
    if (loadScore(evidence.activeLeases, evidence.maxConcurrentLeases) === 0) {
        blockers.push('agent has no available lease capacity');
    }
    if (evidence.quotaState === 'limited')
        warnings.push('agent quota is limited');
    if (evidence.healthState === 'degraded')
        warnings.push('agent health is degraded');
    if (evidence.completedAttempts < 3)
        warnings.push('success evidence has a small sample size');
    const candidate = {
        id: agentId,
        vendor,
        eligible: blockers.length === 0,
        repositoryScopes: [...new Set(evidence.repositoryScopes)].sort(),
        phoneOnlyCompatible: evidence.phoneOnlyCompatible,
        costClass: evidence.costClass,
        specialtyScore: capabilityProven ? 100 : 0,
        successScore: successScore(evidence),
        quotaScore: quotaScore(evidence.quotaState),
        healthScore: healthScore(evidence.healthState),
        loadScore: loadScore(evidence.activeLeases, evidence.maxConcurrentLeases),
        contextScore: contextScore(evidence.contextUpdatedAt, request.now, maxEvidenceAgeMs),
        latencyScore: latencyScore(evidence.medianLatencyMs, targetLatencyMs),
    };
    return { candidate, qualified: candidate.eligible, blockers, warnings, evidenceAgeMs };
}
function qualifyAgents(evidence, request) {
    const ids = new Set();
    return evidence
        .map((entry) => {
        const canonicalId = entry.id.trim().toLowerCase();
        if (!canonicalId)
            throw new Error('agent qualification requires a non-empty ID');
        if (ids.has(canonicalId)) {
            throw new Error(`duplicate agent qualification evidence for ${entry.id.trim()}`);
        }
        ids.add(canonicalId);
        return qualifyAgent(entry, request);
    })
        .sort((left, right) => {
        if (left.qualified !== right.qualified)
            return left.qualified ? -1 : 1;
        if (left.candidate.id < right.candidate.id)
            return -1;
        if (left.candidate.id > right.candidate.id)
            return 1;
        return 0;
    });
}
//# sourceMappingURL=agent-qualification.js.map