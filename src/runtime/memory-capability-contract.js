"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCapabilityContractError = exports.SEARCH_PATH = exports.CONTRACT_PATH = exports.EXPECTED_CONTEXT_SECTIONS = void 0;
exports.validateMemoryCapabilityContract = validateMemoryCapabilityContract;
exports.sanitizeFullCapacityMemorySearch = sanitizeFullCapacityMemorySearch;
const node_crypto_1 = require("node:crypto");

const EXPECTED_CONTRACT_ID = 'pandora-projectos-memory-puzzle';
const EXPECTED_AUTHORITY_REPOSITORY = 'banataosystems/pandoras-box-memory';
const EXPECTED_CONSUMER_REPOSITORY = 'banataosystems/Pandoras-box';
const EXPECTED_MEMORY_ORIGIN = 'https://pandorasbox-memory.vercel.app';
exports.CONTRACT_PATH = '/.well-known/pandora-projectos-memory-contract-v1.json';
exports.SEARCH_PATH = '/api/projectos/memory/search';
exports.EXPECTED_CONTEXT_SECTIONS = Object.freeze([
    'adaptive_profile',
    'style_profile',
    'project_context',
    'people_context',
    'risk_warnings',
    'open_loops',
    'latest_context_pack',
    'daily_context_pack',
    'recent_events',
    'semantic_matches',
    'canonical_records',
    'approved_record_count',
    'requested_canon_statuses',
    'retrieval_mode',
    'retrieval_reasoning_summary',
    'warnings',
]);
const ARRAY_SECTIONS = Object.freeze([
    'adaptive_profile',
    'style_profile',
    'project_context',
    'people_context',
    'risk_warnings',
    'open_loops',
    'recent_events',
    'semantic_matches',
    'canonical_records',
]);
const PACK_SECTIONS = Object.freeze(['latest_context_pack', 'daily_context_pack']);
const MAX_CONTEXT_ITEMS = 50;
const MAX_STATUS_ITEMS = 10;
const MAX_WARNING_ITEMS = 100;
const MAX_SHORT_TEXT = 500;
const MAX_REASONING_TEXT = 4000;

class MemoryCapabilityContractError extends Error {
    constructor(message, code = 'MEMORY_CAPABILITY_CONTRACT_INVALID') {
        super(message);
        this.name = 'MemoryCapabilityContractError';
        this.code = code;
    }
}
exports.MemoryCapabilityContractError = MemoryCapabilityContractError;

function fail(message, code) {
    throw new MemoryCapabilityContractError(message, code);
}
function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function requiredObject(value, label) {
    if (!isPlainObject(value))
        fail(`${label} must be an object`);
    return value;
}
function requiredString(value, label, maximum = MAX_SHORT_TEXT) {
    if (typeof value !== 'string')
        fail(`${label} must be a string`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum)
        fail(`${label} is empty or exceeds its bound`);
    return normalized;
}
function requiredBoolean(value, label) {
    if (typeof value !== 'boolean')
        fail(`${label} must be a boolean`);
    return value;
}
function requiredNonnegativeInteger(value, label) {
    if (!Number.isInteger(value) || value < 0)
        fail(`${label} must be a non-negative integer`);
    return value;
}
function boundedStringArray(value, label, maximumItems, maximumLength = MAX_SHORT_TEXT) {
    if (!Array.isArray(value) || value.length > maximumItems)
        fail(`${label} must be a bounded array`);
    return value.map((item, index) => requiredString(item, `${label}[${index}]`, maximumLength));
}
function boundedObjectArray(value, label) {
    if (!Array.isArray(value) || value.length > MAX_CONTEXT_ITEMS)
        fail(`${label} must be an array with at most ${MAX_CONTEXT_ITEMS} entries`);
    return value.map((item, index) => requiredObject(item, `${label}[${index}]`));
}
function semanticHash(value) {
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
function semverMajor(value, label) {
    const parsed = requiredString(value, label, 40).match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!parsed)
        fail(`${label} must be a semantic version`);
    return Number(parsed[1]);
}
function capabilityMap(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 50)
        fail('capabilities must be a non-empty bounded array');
    const map = new Map();
    for (const [index, item] of value.entries()) {
        const capability = requiredObject(item, `capabilities[${index}]`);
        const id = requiredString(capability.id, `capabilities[${index}].id`, 160);
        if (map.has(id))
            fail(`duplicate capability id: ${id}`);
        map.set(id, capability);
    }
    return map;
}
function exactSet(actual, expected, label) {
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const missing = [...expectedSet].filter((value) => !actualSet.has(value));
    const unknown = [...actualSet].filter((value) => !expectedSet.has(value));
    if (missing.length > 0 || unknown.length > 0) {
        fail(`${label} mismatch; missing=${missing.join(',') || 'none'} unknown=${unknown.join(',') || 'none'}`, 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
}
function endpoint(contract, name, method, path) {
    const endpoints = requiredObject(contract.endpoints, 'endpoints');
    const value = requiredObject(endpoints[name], `endpoints.${name}`);
    if (requiredString(value.method, `endpoints.${name}.method`, 12) !== method
        || requiredString(value.path, `endpoints.${name}.path`, 240) !== path) {
        fail(`endpoints.${name} is incompatible`, 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
    return value;
}
function validateMemoryCapabilityContract(input) {
    const contract = requiredObject(input, 'capability contract');
    if (semverMajor(contract.schema_version, 'schema_version') !== 1
        || semverMajor(contract.contract_version, 'contract_version') !== 1) {
        fail('Only v1 Pandora Memory capability contracts are supported', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
    if (requiredString(contract.contract_id, 'contract_id', 160) !== EXPECTED_CONTRACT_ID)
        fail('Pandora Memory capability contract id is not trusted', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    const authority = requiredObject(contract.authority, 'authority');
    if (requiredString(authority.repository, 'authority.repository', 240) !== EXPECTED_AUTHORITY_REPOSITORY
        || requiredString(authority.service_origin, 'authority.service_origin', 240) !== EXPECTED_MEMORY_ORIGIN) {
        fail('Pandora Memory capability authority is not trusted', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
    const consumer = requiredObject(contract.consumer, 'consumer');
    if (requiredString(consumer.repository, 'consumer.repository', 240) !== EXPECTED_CONSUMER_REPOSITORY)
        fail('Pandora Memory capability consumer is not trusted', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    const compatibility = requiredObject(contract.compatibility, 'compatibility');
    const consumerMajors = compatibility.supported_consumer_major_versions;
    if (!Array.isArray(consumerMajors) || !consumerMajors.includes(1))
        fail('Pandora Memory contract does not support this consumer major version', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    if (compatibility.unknown_required_capability !== 'fail_closed'
        || compatibility.missing_required_context_section !== 'degrade_and_require_provider_verification'
        || compatibility.hash_algorithm !== 'sha256') {
        fail('Pandora Memory compatibility policy is weaker than required', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
    endpoint(contract, 'contract', 'GET', exports.CONTRACT_PATH);
    const healthEndpoint = endpoint(contract, 'health', 'GET', '/api/projectos/health');
    const searchEndpoint = endpoint(contract, 'search', 'POST', exports.SEARCH_PATH);
    if (healthEndpoint.required !== true || searchEndpoint.required !== true)
        fail('Required Pandora Memory endpoints are not mandatory', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    const capabilities = capabilityMap(contract.capabilities);
    for (const id of ['memory.health', 'memory.full_context_search']) {
        const capability = capabilities.get(id);
        if (!capability || capability.required !== true || capability.safe_read !== true || capability.canonical_write !== false)
            fail(`required capability ${id} is missing or unsafe`, 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
    const fullSearch = capabilities.get('memory.full_context_search');
    const responseSections = boundedStringArray(fullSearch.response_sections, 'memory.full_context_search.response_sections', 50, 160);
    exactSet(responseSections, exports.EXPECTED_CONTEXT_SECTIONS, 'full-context response sections');
    const contextSections = contract.context_sections;
    if (!Array.isArray(contextSections) || contextSections.length > 50)
        fail('context_sections must be a bounded array');
    const requiredSections = [];
    const seen = new Set();
    for (const [index, item] of contextSections.entries()) {
        const section = requiredObject(item, `context_sections[${index}]`);
        const field = requiredString(section.field, `context_sections[${index}].field`, 160);
        if (seen.has(field))
            fail(`duplicate context section: ${field}`);
        seen.add(field);
        if (requiredBoolean(section.required, `context_sections[${index}].required`))
            requiredSections.push(field);
        requiredString(section.consumer_duty, `context_sections[${index}].consumer_duty`, 240);
    }
    exactSet(requiredSections, exports.EXPECTED_CONTEXT_SECTIONS, 'required context sections');
    const evidence = capabilities.get('memory.evidence_candidate_submission');
    if (evidence && (evidence.canonical_write !== false
        || evidence.automatic_promotion !== false
        || evidence.review_gate !== 'human_review_required')) {
        fail('Evidence candidate capability bypasses human review', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
    const privacy = requiredObject(contract.privacy, 'privacy');
    for (const field of [
        'persist_raw_provider_arguments',
        'persist_raw_provider_results',
        'persist_raw_errors',
        'persist_secrets_or_credentials',
        'persist_direct_sensitive_identifiers',
    ]) {
        if (privacy[field] !== false)
            fail(`privacy.${field} must remain false`, 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
    const promotion = requiredObject(contract.promotion_policy, 'promotion_policy');
    if (promotion.automatic_canonical_promotion !== false
        || promotion.human_review_required !== true
        || promotion.history_is_superseded_not_overwritten !== true) {
        fail('Pandora Memory promotion policy is incompatible', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    }
    return Object.freeze({
        id: contract.contract_id,
        version: contract.contract_version,
        schemaVersion: contract.schema_version,
        authorityRepository: authority.repository,
        authorityOrigin: authority.service_origin,
        requiredSections: Object.freeze([...requiredSections]),
        semanticHash: semanticHash(contract),
    });
}
function sanitizePack(value, label) {
    if (value === null)
        return null;
    return requiredObject(value, label);
}
function sanitizeFullCapacityMemorySearch(input, verifiedContract) {
    if (!verifiedContract || verifiedContract.id !== EXPECTED_CONTRACT_ID)
        fail('A verified Pandora Memory capability contract is required', 'MEMORY_CAPABILITY_CONTRACT_INCOMPATIBLE');
    const response = requiredObject(input, 'memory search response');
    if (response.ok !== true)
        fail('Pandora Memory search response is not successful', 'MEMORY_SEARCH_CONTRACT_INVALID');
    if (response.namespace !== 'real_life')
        fail('Pandora Memory search namespace is not real_life', 'MEMORY_SEARCH_CONTRACT_INVALID');
    const observedSections = verifiedContract.requiredSections.filter((field) => Object.prototype.hasOwnProperty.call(response, field));
    const missingRequiredSections = verifiedContract.requiredSections.filter((field) => !Object.prototype.hasOwnProperty.call(response, field));
    if (missingRequiredSections.length > 0) {
        fail(`Pandora Memory omitted required context sections: ${missingRequiredSections.join(', ')}`, 'MEMORY_SEARCH_REQUIRED_SECTION_MISSING');
    }
    const search = {
        ok: true,
        namespace: 'real_life',
        current_task: response.current_task === null || response.current_task === undefined
            ? null
            : requiredString(response.current_task, 'current_task', 2000),
    };
    for (const field of ARRAY_SECTIONS)
        search[field] = boundedObjectArray(response[field], field);
    for (const field of PACK_SECTIONS)
        search[field] = sanitizePack(response[field], field);
    search.approved_record_count = requiredNonnegativeInteger(response.approved_record_count, 'approved_record_count');
    search.requested_canon_statuses = boundedStringArray(response.requested_canon_statuses, 'requested_canon_statuses', MAX_STATUS_ITEMS, 80);
    search.retrieval_mode = requiredString(response.retrieval_mode, 'retrieval_mode', 80);
    search.retrieval_reasoning_summary = requiredString(response.retrieval_reasoning_summary, 'retrieval_reasoning_summary', MAX_REASONING_TEXT);
    search.warnings = boundedStringArray(response.warnings, 'warnings', MAX_WARNING_ITEMS, MAX_SHORT_TEXT);
    return {
        search,
        coverage: Object.freeze({
            requiredSections: Object.freeze([...verifiedContract.requiredSections]),
            observedSections: Object.freeze([...observedSections]),
            missingRequiredSections: Object.freeze([]),
            utilizationPercentage: 100,
        }),
    };
}
