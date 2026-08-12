"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.READ_ONLY_MEMORY_CAPABILITIES = void 0;
exports.buildMemoryStatusView = buildMemoryStatusView;
const memory_governance_1 = require("./memory-governance");
/**
 * MCPMaster holds only `memory:health` and `memory:read`. Every mutating
 * capability is therefore unavailable, and saying so is part of the contract.
 */
exports.READ_ONLY_MEMORY_CAPABILITIES = Object.freeze({
    write: false,
    approve: false,
    supersede: false,
    revoke: false,
    resolveConflict: false,
    synchronize: false,
    retryFailed: false,
    rebuildIndex: false,
});
const CAPABILITY_NOTE = 'MCPMaster holds read-only Memory access (memory:health, memory:read). '
    + 'Approve, reject, supersede, revoke, conflict resolution, synchronization, '
    + 'retry, and index rebuild are performed in Pandora Memory by an authorized '
    + 'reviewer and are not available from this screen.';
function summarize(record, standing) {
    const approvalLabel = standing === 'canonical'
        ? 'Approved — canonical'
        : standing === 'provisional'
            ? 'Approved — provisional'
            : 'Proposed — awaiting review';
    return {
        id: record.id,
        title: record.title,
        recordType: record.memoryType,
        standing,
        approvalLabel,
        updatedAt: record.updatedAt,
        sourceSummary: record.sourceSummary,
        provenance: record.provenance,
    };
}
/**
 * Build the status the Control Tower renders.
 *
 * `connected_but_empty` is deliberately distinct from `degraded`: the first
 * means Memory answered truthfully that it holds nothing approved for this
 * project, which is the expected state before the seed package is reviewed.
 * Collapsing the two would make a working system look broken.
 */
function buildMemoryStatusView(input) {
    const base = {
        canonicalOrigin: input.canonicalOrigin,
        namespace: input.namespace ?? null,
        capabilities: { ...exports.READ_ONLY_MEMORY_CAPABILITIES },
        unavailableCapabilityNote: CAPABILITY_NOTE,
        canonicalRecords: [],
        proposedRecords: [],
        conflicts: [],
        warnings: [],
        warningCount: 0,
        approvedCount: 0,
        proposedCount: 0,
        retrievalMode: null,
        freshestRecordAt: null,
    };
    if (input.failure) {
        return {
            ...base,
            state: input.failure.kind,
            headline: input.failure.kind === 'unauthorized'
                ? 'Pandora Memory refused this service principal'
                : 'Pandora Memory is unreachable',
            detail: input.failure.message,
            fallbackAuthority: 'GitHub and Supabase',
            degradedReasons: [input.failure.message],
        };
    }
    if (!input.response) {
        return {
            ...base,
            state: 'unavailable',
            headline: 'Pandora Memory is unreachable',
            detail: 'No response was received from the canonical Memory origin.',
            fallbackAuthority: 'GitHub and Supabase',
            degradedReasons: ['No response was received from the canonical Memory origin.'],
        };
    }
    const context = (0, memory_governance_1.evaluateCanonicalContext)(input.response, {
        maxAgeMs: input.maxAgeMs,
        now: input.now,
    });
    const proposedRecords = context.proposed.map((record) => summarize(record, 'proposed'));
    const canonicalRecords = context.canonical.map((record) => summarize(record, record.trust === 'approved_canonical' ? 'canonical' : 'provisional'));
    const common = {
        ...base,
        namespace: input.response.namespace ?? input.namespace ?? null,
        retrievalMode: context.retrievalMode,
        warnings: context.warnings,
        warningCount: context.warnings.length,
        conflicts: context.conflicts.map((conflict) => ({
            subject: conflict.subject,
            reason: conflict.reason,
        })),
        freshestRecordAt: context.freshestRecordAt,
        approvedCount: canonicalRecords.length,
        proposedCount: proposedRecords.length,
        proposedRecords,
        degradedReasons: context.degradedReasons,
    };
    if (!context.degraded) {
        return {
            ...common,
            state: 'healthy',
            headline: 'Pandora Memory is serving approved canonical context',
            detail: `${canonicalRecords.length} approved record${canonicalRecords.length === 1 ? '' : 's'} available for this project.`,
            fallbackAuthority: null,
            canonicalRecords,
        };
    }
    // Degraded with no approved records and nothing else wrong is the honest
    // "connected but empty" case, not a fault.
    const onlyEmptiness = context.conflicts.length === 0
        && context.degradedReasons.every((reason) => /no approved canonical records/i.test(reason));
    if (onlyEmptiness) {
        return {
            ...common,
            state: 'connected_but_empty',
            headline: 'Pandora Memory is connected but holds no approved records',
            detail: proposedRecords.length > 0
                ? `${proposedRecords.length} record${proposedRecords.length === 1 ? '' : 's'} remain proposed and pending review.`
                : 'No approved canonical records exist for this project yet.',
            fallbackAuthority: 'GitHub and Supabase',
        };
    }
    return {
        ...common,
        state: 'degraded',
        headline: 'Approved canonical context is unavailable',
        detail: context.conflicts.length > 0
            ? `${context.conflicts.length} unresolved conflict${context.conflicts.length === 1 ? '' : 's'} must be resolved by a reviewer.`
            : context.degradedReasons[0] ?? 'Memory context cannot be trusted.',
        fallbackAuthority: 'GitHub and Supabase',
    };
}
//# sourceMappingURL=memory-status.js.map