"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PandoraAgentIntelligenceKernel = void 0;
exports.canonicalAgentVendor = canonicalAgentVendor;
const agent_qualification_1 = require("./agent-qualification");
const router_1 = require("./router");
const repair_policy_1 = require("./repair-policy");
const source_authority_js_1 = require("../runtime/source-authority.js");
const VENDOR_ALIASES = [
    { canonical: 'openai', aliases: ['openai', 'chatgpt', 'codex'] },
    { canonical: 'google', aliases: ['google', 'gemini', 'jules'] },
    { canonical: 'anthropic', aliases: ['anthropic', 'claude'] },
    { canonical: 'github', aliases: ['github', 'copilot'] },
    { canonical: 'vercel', aliases: ['vercel'] },
];
function canonicalAgentVendor(value) {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!normalized)
        return '';
    const tokens = new Set(normalized.split(/\s+/));
    for (const group of VENDOR_ALIASES) {
        if (group.aliases.some((alias) => tokens.has(alias)))
            return group.canonical;
    }
    return normalized.replace(/\s+/g, '-');
}
function requireRoutingRequest(request) {
    if (!request.workItemId.trim())
        throw new Error('routing requires a non-empty work item ID');
    if (!request.repository.trim())
        throw new Error('routing requires a non-empty repository');
    (0, source_authority_js_1.assertOperationalRepository)(request.repository, 'route work to');
    if (!request.capability.trim())
        throw new Error('routing requires a non-empty capability');
    if (!Number.isFinite(request.now) || request.now < 0)
        throw new Error('routing requires a valid current time');
}
function finiteEvidenceAge(value) {
    return Number.isFinite(value) ? value : null;
}
function routeEvidence(request, decision, qualification) {
    return {
        schemaVersion: 'pandora-route-evidence-v1',
        workItemId: request.workItemId,
        repository: request.repository,
        capability: request.capability,
        primaryAgentId: decision.primary.id,
        primaryVendor: decision.primary.vendor,
        fallbackAgentIds: decision.fallbacks.map((agent) => agent.id),
        qualification: qualification.map((result) => ({
            agentId: result.candidate.id,
            vendor: result.candidate.vendor,
            qualified: result.qualified,
            blockers: [...result.blockers],
            warnings: [...result.warnings],
            evidenceAgeMs: finiteEvidenceAge(result.evidenceAgeMs),
        })),
        recordedAt: request.now,
    };
}
class PandoraAgentIntelligenceKernel {
    constructor(leases = new router_1.InMemoryBuilderLeaseStore()) {
        this.router = new router_1.ThinProjectOSRouter(leases);
    }
    routeBuilder(request, observations) {
        requireRoutingRequest(request);
        const qualification = (0, agent_qualification_1.qualifyAgents)(observations, {
            repository: request.repository,
            capability: request.capability,
            now: request.now,
            maxEvidenceAgeMs: request.maxEvidenceAgeMs,
            targetLatencyMs: request.targetLatencyMs,
        });
        const decision = this.router.route({
            workItemId: request.workItemId,
            repository: request.repository,
            maxFallbacks: request.maxFallbacks,
        }, qualification.map((result) => result.candidate), request.now);
        return { decision, qualification, evidence: routeEvidence(request, decision, qualification) };
    }
    routeIndependentReviewer(request, observations) {
        requireRoutingRequest(request);
        const builderVendor = canonicalAgentVendor(request.builderVendor);
        if (!builderVendor)
            throw new Error('review routing requires the builder vendor');
        const independent = observations.filter((observation) => canonicalAgentVendor(observation.vendor) !== builderVendor);
        if (independent.length === 0) {
            throw new Error(`no different-vendor reviewer evidence is available for ${request.workItemId}`);
        }
        const reviewRequest = {
            ...request,
            workItemId: `${request.workItemId}:review`,
        };
        const result = this.routeBuilder(reviewRequest, independent);
        if (canonicalAgentVendor(result.decision.primary.vendor) === builderVendor) {
            throw new Error('same-vendor reviewer routing was rejected');
        }
        return result;
    }
    decideRecovery(workItemId, failure) {
        if (!workItemId.trim())
            throw new Error('recovery requires a non-empty work item ID');
        const decision = (0, repair_policy_1.decideProjectOSRepair)(failure);
        return {
            decision,
            evidence: {
                schemaVersion: 'pandora-recovery-evidence-v1',
                workItemId,
                exactHeadSha: failure.exactHeadSha,
                failureKind: decision.kind,
                attempt: failure.attempt,
                nextAction: decision.nextAction,
                retryAllowed: decision.retryAllowed,
                fallbackAllowed: decision.fallbackAllowed,
                ownerActionRequired: decision.ownerActionRequired,
                invalidateReview: decision.invalidateReview,
                invalidateChecks: decision.invalidateChecks,
                reason: decision.reason,
            },
        };
    }
}
exports.PandoraAgentIntelligenceKernel = PandoraAgentIntelligenceKernel;
//# sourceMappingURL=agent-intelligence-kernel.js.map
