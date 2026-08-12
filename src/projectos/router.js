"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThinProjectOSRouter = exports.InMemoryBuilderLeaseStore = void 0;
const score = (agent) => agent.specialtyScore * 0.25 +
    agent.successScore * 0.2 +
    agent.quotaScore * 0.15 +
    agent.healthScore * 0.15 +
    agent.loadScore * 0.1 +
    agent.contextScore * 0.1 +
    agent.latencyScore * 0.05;
const compareAgentIds = (left, right) => {
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    return 0;
};
const normalizeFallbackLimit = (value) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
class InMemoryBuilderLeaseStore {
    constructor() {
        this.leases = new Map();
    }
    acquire(workItemId, agentId, now, ttlMs) {
        const current = this.leases.get(workItemId);
        if (current && current.expiresAt > now) {
            throw new Error(`active builder lease already exists for ${workItemId}`);
        }
        const lease = {
            workItemId,
            agentId,
            acquiredAt: now,
            expiresAt: now + ttlMs,
        };
        this.leases.set(workItemId, lease);
        return lease;
    }
    get(workItemId, now) {
        const current = this.leases.get(workItemId);
        if (!current)
            return undefined;
        if (current.expiresAt <= now) {
            this.leases.delete(workItemId);
            return undefined;
        }
        return current;
    }
    release(workItemId, agentId) {
        const current = this.leases.get(workItemId);
        if (!current || current.agentId !== agentId)
            return false;
        return this.leases.delete(workItemId);
    }
}
exports.InMemoryBuilderLeaseStore = InMemoryBuilderLeaseStore;
const defaultBuilderLeaseStore = new InMemoryBuilderLeaseStore();
class ThinProjectOSRouter {
    constructor(leases = defaultBuilderLeaseStore, leaseTtlMs = 15 * 60 * 1000) {
        this.leases = leases;
        this.leaseTtlMs = leaseTtlMs;
    }
    route(request, agents, now) {
        const existing = this.leases.get(request.workItemId, now);
        if (existing) {
            throw new Error(`duplicate dispatch blocked for ${request.workItemId}`);
        }
        const baseEligible = agents.filter((agent) => agent.eligible &&
            agent.phoneOnlyCompatible &&
            agent.repositoryScopes.includes(request.repository));
        const includedCapacity = baseEligible.filter((agent) => agent.costClass !== "metered");
        const routingPool = includedCapacity.length > 0 ? includedCapacity : baseEligible;
        const eligible = routingPool.sort((a, b) => score(b) - score(a) || compareAgentIds(a.id, b.id));
        if (eligible.length === 0) {
            throw new Error(`no eligible phone-only agent for ${request.repository}`);
        }
        const primary = eligible[0];
        const fallbackLimit = normalizeFallbackLimit(request.maxFallbacks);
        const fallbacks = eligible.slice(1, 1 + fallbackLimit);
        const lease = this.leases.acquire(request.workItemId, primary.id, now, this.leaseTtlMs);
        return { primary, fallbacks, lease };
    }
}
exports.ThinProjectOSRouter = ThinProjectOSRouter;
//# sourceMappingURL=router.js.map