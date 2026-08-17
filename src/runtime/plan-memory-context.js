"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PandoraPlanMemoryContextProvider = void 0;
exports.hashPlanMemoryContextEnvelope = hashPlanMemoryContextEnvelope;
exports.createUnavailablePlanMemoryContext = createUnavailablePlanMemoryContext;
exports.shouldHydratePlanMemoryContext = shouldHydratePlanMemoryContext;
const node_crypto_1 = require("node:crypto");
const memory_js_1 = require("../tools/memory.js");
const memory_capability_contract_js_1 = require("./memory-capability-contract.js");
const DEFAULT_MEMORY_ORIGIN = 'https://pandorasbox-memory.vercel.app';
const CONTEXT_SCHEMA_VERSION = '2.0.0';
const MAX_IDENTIFIER_LENGTH = 240;
const MAX_HIGHLIGHT_LENGTH = 1000;
const MAX_HIGHLIGHTS_PER_KIND = 3;
const MAX_WARNINGS = 10;
const SAFE_IDENTIFIER_KEYS = new Set([
    'owner',
    'org',
    'organization',
    'repo',
    'repository',
    'repository_full_name',
    'projectId',
    'project_id',
    'projectRef',
    'project_ref',
    'branch',
    'issue_number',
    'pr_number',
    'deploymentId',
    'deployment_id',
    'teamId',
    'team_id',
    'domain',
]);
const EMPTY_COUNTS = Object.freeze({
    adaptiveProfile: 0,
    styleProfile: 0,
    projectContext: 0,
    peopleContext: 0,
    riskWarnings: 0,
    openLoops: 0,
    latestContextPack: 0,
    dailyContextPack: 0,
    recentEvents: 0,
    semanticMatches: 0,
    canonicalRecords: 0,
    approvedRecords: 0,
});
const EMPTY_HIGHLIGHTS = Object.freeze({
    adaptive: [],
    style: [],
    project: [],
    people: [],
    risks: [],
    openLoops: [],
    latestContextPack: [],
    dailyContextPack: [],
    recent: [],
    semantic: [],
    canonical: [],
});
function sha256(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value, 'utf8').digest('hex');
}
function boundedText(value, maximum = MAX_HIGHLIGHT_LENGTH) {
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return undefined;
    return normalized.slice(0, maximum);
}
function safeIdentifiers(args) {
    const identifiers = {};
    for (const [key, value] of Object.entries(args)) {
        if (!SAFE_IDENTIFIER_KEYS.has(key))
            continue;
        if (typeof value !== 'string' && typeof value !== 'number')
            continue;
        const normalized = String(value).replace(/\s+/g, ' ').trim();
        if (!normalized || normalized.length > MAX_IDENTIFIER_LENGTH)
            continue;
        identifiers[key] = normalized;
    }
    return Object.fromEntries(Object.entries(identifiers).sort(([left], [right]) => left.localeCompare(right)));
}
function contextQuery(tool, identifiers) {
    const parts = [`ProjectOS durable plan context for ${tool}`];
    for (const [key, value] of Object.entries(identifiers)) {
        parts.push(`${key} ${value}`);
    }
    return parts.join('; ').slice(0, 4000);
}
function firstText(record, keys) {
    for (const key of keys) {
        const value = boundedText(record[key]);
        if (value)
            return value;
    }
    return undefined;
}
function collectHighlights(values, keys) {
    if (!Array.isArray(values))
        return [];
    const results = [];
    for (const item of values) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const text = firstText(item, keys);
        if (text && !results.includes(text))
            results.push(text);
        if (results.length >= MAX_HIGHLIGHTS_PER_KIND)
            break;
    }
    return results;
}
function collectContextPackHighlights(pack) {
    if (!pack || typeof pack !== 'object' || Array.isArray(pack))
        return [];
    const results = [];
    const primary = firstText(pack, ['summary', 'title']);
    if (primary)
        results.push(primary);
    if (Array.isArray(pack.key_points)) {
        for (const point of pack.key_points) {
            const text = boundedText(point)
                || (point && typeof point === 'object' && !Array.isArray(point)
                    ? firstText(point, ['summary', 'text', 'title'])
                    : undefined);
            if (text && !results.includes(text))
                results.push(text);
            if (results.length >= MAX_HIGHLIGHTS_PER_KIND)
                break;
        }
    }
    return results.slice(0, MAX_HIGHLIGHTS_PER_KIND);
}
function warningList(values) {
    if (!Array.isArray(values))
        return [];
    return values
        .map((value) => boundedText(value, 300))
        .filter((value) => Boolean(value))
        .slice(0, MAX_WARNINGS);
}
function stringList(values, maximumItems = 10, maximumLength = 80) {
    if (!Array.isArray(values))
        return [];
    return values
        .map((value) => boundedText(value, maximumLength))
        .filter((value) => Boolean(value))
        .slice(0, maximumItems);
}
function unavailableContract() {
    return {
        status: 'unavailable',
        id: 'pandora-projectos-memory-puzzle',
        path: memory_capability_contract_js_1.CONTRACT_PATH,
        compatible: false,
        requiredSections: [...memory_capability_contract_js_1.EXPECTED_CONTEXT_SECTIONS],
        observedSections: [],
        missingRequiredSections: [...memory_capability_contract_js_1.EXPECTED_CONTEXT_SECTIONS],
        utilizationPercentage: 0,
    };
}
function emptyEnvelope(now, tool, identifiers, queryHash, failure) {
    return {
        schemaVersion: CONTEXT_SCHEMA_VERSION,
        status: failure ? 'unavailable' : 'empty',
        source: 'pandora-memory',
        namespace: 'real_life',
        retrievedAt: now.toISOString(),
        queryHash,
        queryBasis: { tool, identifiers },
        counts: { ...EMPTY_COUNTS },
        highlights: Object.fromEntries(Object.entries(EMPTY_HIGHLIGHTS).map(([key, value]) => [key, [...value]])),
        retrieval: {
            mode: undefined,
            reasoningSummary: undefined,
            requestedCanonStatuses: [],
            approvedRecordCount: 0,
        },
        capabilityContract: unavailableContract(),
        fallbackRequired: Boolean(failure),
        warnings: failure ? ['memory_context_unavailable'] : [],
        ...(failure ? { failure } : {}),
    };
}
function hashPlanMemoryContextEnvelope(envelope) {
    return sha256(JSON.stringify(envelope));
}
function createUnavailablePlanMemoryContext(input, error, now = new Date()) {
    const identifiers = safeIdentifiers(input.args);
    const queryHash = sha256(contextQuery(input.tool, identifiers));
    const envelope = emptyEnvelope(now, input.tool, identifiers, queryHash, {
        type: error instanceof Error ? error.name : 'unknown',
        ...(error instanceof memory_js_1.PandoraMemoryError && error.status ? { status: error.status } : {}),
        ...(error instanceof memory_capability_contract_js_1.MemoryCapabilityContractError ? { code: error.code } : {}),
    });
    return { envelope, contextHash: hashPlanMemoryContextEnvelope(envelope) };
}
class PandoraPlanMemoryContextProvider {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || process.env.PANDORA_MEMORY_BASE_URL || DEFAULT_MEMORY_ORIGIN;
        this.timeoutMs = options.timeoutMs || 8000;
        this.maxResponseBytes = options.maxResponseBytes || 500000;
        this.fetchFn = options.fetchFn;
        this.now = options.now || (() => new Date());
    }
    async hydrate(vercelOidcToken, input) {
        const identifiers = safeIdentifiers(input.args);
        const query = contextQuery(input.tool, identifiers);
        const queryHash = sha256(query);
        const now = this.now();
        try {
            const memory = new memory_js_1.PandoraMemoryMCPServer({
                baseUrl: this.baseUrl,
                oidcToken: vercelOidcToken,
                allowedNamespaces: ['real_life'],
                grantedScopes: ['memory:health', 'memory:read'],
                timeoutMs: this.timeoutMs,
                maxResponseBytes: this.maxResponseBytes,
            }, this.fetchFn);
            const contract = (0, memory_capability_contract_js_1.validateMemoryCapabilityContract)(await memory.request(memory_capability_contract_js_1.CONTRACT_PATH, 'GET'));
            const rawSearch = await memory.request(memory_capability_contract_js_1.SEARCH_PATH, 'POST', {
                namespace: 'real_life',
                query,
                current_task: `Prepare a durable ProjectOS plan for ${input.tool}`,
                max_items: 12,
                include_semantic: true,
                include_profiles: true,
                include_recent: true,
                include_open_loops: true,
                canon_statuses: ['approved'],
            });
            const { search, coverage } = (0, memory_capability_contract_js_1.sanitizeFullCapacityMemorySearch)(rawSearch, contract);
            const highlights = {
                adaptive: collectHighlights(search.adaptive_profile, ['summary', 'title']),
                style: collectHighlights(search.style_profile, ['summary', 'title']),
                project: collectHighlights(search.project_context, ['summary', 'title']),
                people: collectHighlights(search.people_context, ['summary', 'title']),
                risks: collectHighlights(search.risk_warnings, ['summary', 'description', 'title']),
                openLoops: collectHighlights(search.open_loops, ['next_action', 'description', 'title']),
                latestContextPack: collectContextPackHighlights(search.latest_context_pack),
                dailyContextPack: collectContextPackHighlights(search.daily_context_pack),
                recent: collectHighlights(search.recent_events, ['summary', 'extracted_summary']),
                semantic: collectHighlights(search.semantic_matches, ['summary', 'extracted_summary']),
                canonical: collectHighlights(search.canonical_records, ['title', 'body', 'source_summary']),
            };
            const counts = {
                adaptiveProfile: search.adaptive_profile.length,
                styleProfile: search.style_profile.length,
                projectContext: search.project_context.length,
                peopleContext: search.people_context.length,
                riskWarnings: search.risk_warnings.length,
                openLoops: search.open_loops.length,
                latestContextPack: search.latest_context_pack ? 1 : 0,
                dailyContextPack: search.daily_context_pack ? 1 : 0,
                recentEvents: search.recent_events.length,
                semanticMatches: search.semantic_matches.length,
                canonicalRecords: search.canonical_records.length,
                approvedRecords: search.approved_record_count,
            };
            const hasContext = Object.values(counts).some((count) => count > 0)
                || Object.values(highlights).some((items) => items.length > 0);
            const envelope = {
                schemaVersion: CONTEXT_SCHEMA_VERSION,
                status: hasContext ? 'available' : 'empty',
                source: 'pandora-memory',
                namespace: 'real_life',
                retrievedAt: now.toISOString(),
                queryHash,
                queryBasis: { tool: input.tool, identifiers },
                counts,
                highlights,
                retrieval: {
                    mode: boundedText(search.retrieval_mode, 80),
                    reasoningSummary: boundedText(search.retrieval_reasoning_summary, 1000),
                    requestedCanonStatuses: stringList(search.requested_canon_statuses),
                    approvedRecordCount: search.approved_record_count,
                },
                capabilityContract: {
                    status: 'verified',
                    id: contract.id,
                    version: contract.version,
                    schemaVersion: contract.schemaVersion,
                    semanticHash: contract.semanticHash,
                    authorityRepository: contract.authorityRepository,
                    authorityOrigin: contract.authorityOrigin,
                    path: memory_capability_contract_js_1.CONTRACT_PATH,
                    compatible: true,
                    requiredSections: [...coverage.requiredSections],
                    observedSections: [...coverage.observedSections],
                    missingRequiredSections: [...coverage.missingRequiredSections],
                    utilizationPercentage: coverage.utilizationPercentage,
                },
                fallbackRequired: false,
                warnings: warningList(search.warnings),
            };
            return { envelope, contextHash: hashPlanMemoryContextEnvelope(envelope) };
        }
        catch (error) {
            return createUnavailablePlanMemoryContext(input, error, now);
        }
    }
}
exports.PandoraPlanMemoryContextProvider = PandoraPlanMemoryContextProvider;
function shouldHydratePlanMemoryContext() {
    if (process.env.PANDORA_MEMORY_PLAN_CONTEXT_ENABLED === 'false')
        return false;
    return process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';
}
//# sourceMappingURL=plan-memory-context.js.map
