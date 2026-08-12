"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qualificationEvidenceFromObservation = qualificationEvidenceFromObservation;
exports.qualificationEvidenceSet = qualificationEvidenceSet;
exports.routeEvidenceEnvelope = routeEvidenceEnvelope;
const agent_intelligence_kernel_1 = require("./agent-intelligence-kernel");
function canonicalAgentKey(value) {
    return value.trim().toLowerCase();
}
function timestamp(value, label) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || parsed < 0)
        throw new Error(`${label} is invalid`);
    return parsed;
}
function nonNegativeInteger(value, label) {
    if (!Number.isInteger(value) || value < 0)
        throw new Error(`${label} is invalid`);
    return value;
}
function normalizedList(values, label) {
    if (!Array.isArray(values))
        throw new Error(`${label} is invalid`);
    const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
    if (normalized.length === 0)
        throw new Error(`${label} is empty`);
    return normalized;
}
function matchingIdentity(observation, runtime) {
    const observationId = observation.agentKey.trim();
    const runtimeId = runtime.agentKey.trim();
    if (!observationId || !runtimeId)
        throw new Error('agent identity is empty');
    if (canonicalAgentKey(observationId) !== canonicalAgentKey(runtimeId)) {
        throw new Error('agent observation and runtime proof identify different agents');
    }
    const observationVendor = (0, agent_intelligence_kernel_1.canonicalAgentVendor)(observation.vendor);
    const runtimeVendor = (0, agent_intelligence_kernel_1.canonicalAgentVendor)(runtime.vendor);
    if (!observationVendor || !runtimeVendor)
        throw new Error('agent vendor is empty');
    if (observationVendor !== runtimeVendor) {
        throw new Error('agent observation and runtime proof identify different vendors');
    }
    return { id: observationId, vendor: runtime.vendor.trim() };
}
function qualificationEvidenceFromObservation(observation, runtime) {
    const identity = matchingIdentity(observation, runtime);
    const completedAttempts = nonNegativeInteger(observation.observations, 'observation count');
    const successfulAttempts = nonNegativeInteger(observation.successes, 'success count');
    const repairCycles = nonNegativeInteger(observation.repairAttempts, 'repair attempt count');
    const reviewRejections = nonNegativeInteger(observation.reviewRejections, 'review rejection count');
    const activeLeases = nonNegativeInteger(runtime.activeLeases, 'active lease count');
    const maxConcurrentLeases = nonNegativeInteger(runtime.maxConcurrentLeases, 'maximum lease count');
    if (successfulAttempts > completedAttempts)
        throw new Error('success count exceeds observation count');
    if (activeLeases > maxConcurrentLeases)
        throw new Error('active leases exceed maximum leases');
    const observationTime = timestamp(observation.latestObservedAt, 'latest observation time');
    const runtimeTime = timestamp(runtime.verifiedAt, 'runtime verification time');
    const contextTime = runtime.contextUpdatedAt == null
        ? undefined
        : timestamp(runtime.contextUpdatedAt, 'context update time');
    const medianLatencyMs = observation.medianDurationSeconds == null
        ? undefined
        : (() => {
            if (!Number.isFinite(observation.medianDurationSeconds) || observation.medianDurationSeconds < 0) {
                throw new Error('median duration is invalid');
            }
            return Math.round(observation.medianDurationSeconds * 1000);
        })();
    return {
        id: identity.id,
        vendor: identity.vendor,
        costClass: runtime.costClass,
        repositoryScopes: normalizedList(runtime.repositoryScopes, 'repository proof'),
        phoneOnlyCompatible: runtime.phoneOnlyCompatible,
        provenCapabilities: normalizedList(observation.capabilities, 'capability evidence'),
        credentialState: runtime.credentialState,
        quotaState: runtime.quotaState,
        healthState: runtime.healthState,
        observedAt: Math.min(observationTime, runtimeTime),
        completedAttempts,
        successfulAttempts,
        reviewRejections,
        repairCycles,
        activeLeases,
        maxConcurrentLeases,
        medianLatencyMs,
        contextUpdatedAt: contextTime,
    };
}
function qualificationEvidenceSet(observations, runtimeProofs) {
    const runtimeByAgent = new Map();
    for (const runtime of runtimeProofs) {
        const key = canonicalAgentKey(runtime.agentKey);
        if (!key)
            throw new Error('runtime proof has an empty agent key');
        if (runtimeByAgent.has(key))
            throw new Error(`duplicate runtime proof for ${runtime.agentKey.trim()}`);
        runtimeByAgent.set(key, runtime);
    }
    const observed = new Set();
    return observations.map((observation) => {
        const key = canonicalAgentKey(observation.agentKey);
        if (!key)
            throw new Error('observation has an empty agent key');
        if (observed.has(key))
            throw new Error(`duplicate observation summary for ${observation.agentKey.trim()}`);
        observed.add(key);
        const runtime = runtimeByAgent.get(key);
        if (!runtime)
            throw new Error(`verified runtime proof is missing for ${observation.agentKey.trim()}`);
        return qualificationEvidenceFromObservation(observation, runtime);
    });
}
function routeEvidenceEnvelope(evidence) {
    const repository = evidence.repository.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
        throw new Error('route evidence repository is invalid');
    }
    const workItemId = evidence.workItemId.trim();
    const primaryAgentId = evidence.primaryAgentId.trim();
    if (!workItemId || !primaryAgentId)
        throw new Error('route evidence identity is incomplete');
    if (!Number.isFinite(evidence.recordedAt) || evidence.recordedAt < 0) {
        throw new Error('route evidence time is invalid');
    }
    return {
        evidenceType: 'projectos.agent_route',
        provider: 'projectos',
        externalId: `${repository}:${workItemId}:${primaryAgentId}:${Math.trunc(evidence.recordedAt)}`,
        status: 'observed',
        repository,
        payloadRedacted: evidence,
    };
}
//# sourceMappingURL=agent-observation-adapter.js.map