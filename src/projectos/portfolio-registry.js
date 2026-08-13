"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePortfolioRegistry = validatePortfolioRegistry;
exports.requireManagedRepository = requireManagedRepository;
const source_authority_js_1 = require("../runtime/source-authority.js");
const OWNER_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SUPABASE_PROJECT_REF = /^[a-z0-9]{20}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMMUTABLE_RED_APPLE = /^https:\/\/raw\.githubusercontent\.com\/mbanatao\/Battle\/[0-9a-f]{40}\/public\/brand\/banatao\/red-apple-mark-96\.png$/;
const VISIBILITIES = new Set(['public', 'private']);
const ACCESS_MODES = new Set(['managed', 'discovery-only']);
const PRODUCT_CLASSES = new Set([
    'core-product',
    'control-infrastructure',
    'unqualified',
    'qualification-required',
]);
const BRAND_STATUSES = new Set([
    'verified',
    'required',
    'not-applicable-until-qualified',
    'required-if-confirmed-product',
]);
function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function validHttpsOrigin(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && url.origin === value
            && !url.username
            && !url.password
            && !url.search
            && !url.hash;
    }
    catch {
        return false;
    }
}
function validateBackendMapping(entry, repository, errors) {
    const backend = record(entry.backend);
    const deployment = text(entry.productionDeployment);
    if (!backend && !deployment)
        return;
    if (!validHttpsOrigin(deployment)) {
        errors.push(`managed backend product requires an exact HTTPS production origin: ${repository}`);
    }
    if (!backend) {
        errors.push(`backend mapping is required when productionDeployment is set: ${repository}`);
        return;
    }
    if (text(backend.provider) !== 'supabase') {
        errors.push(`unsupported backend provider for ${repository}`);
    }
    if (!text(backend.projectName)) {
        errors.push(`backend projectName is required for ${repository}`);
    }
    if (!SUPABASE_PROJECT_REF.test(text(backend.projectRef))) {
        errors.push(`invalid Supabase projectRef for ${repository}`);
    }
    if (text(backend.accessPath) !== 'projectos-control-plane-only') {
        errors.push(`backend access must go through ProjectOS for ${repository}`);
    }
    if (text(backend.credentialSource) !== 'projectos-vault') {
        errors.push(`backend credentials must come from the ProjectOS vault for ${repository}`);
    }
    if (!OWNER_REPOSITORY.test(text(backend.excludedRepository))) {
        errors.push(`invalid excluded backend repository for ${repository}`);
    }
}
function validateCanonicalEuropayMapping(entries, errors) {
    const fong = entries.find((entry) => text(entry.productId) === 'fong');
    if (!fong) {
        errors.push('canonical Europay / Fong product is missing');
        return;
    }
    const backend = record(fong.backend);
    if (text(fong.repository) !== 'mbanatao/fong'
        || text(fong.accessMode) !== 'managed'
        || text(fong.productionDeployment) !== 'https://eden-eco.vercel.app'
        || text(backend?.provider) !== 'supabase'
        || text(backend?.projectName) !== 'e-mango'
        || text(backend?.projectRef) !== 'czsjwmasypvgcnewrlcf'
        || text(backend?.accessPath) !== 'projectos-control-plane-only'
        || text(backend?.credentialSource) !== 'projectos-vault'
        || text(backend?.excludedRepository) !== 'mbanatao/e-mango') {
        errors.push('canonical Europay mapping must be fong -> eden-eco.vercel.app -> e-mango Supabase through ProjectOS');
    }
    const excluded = entries.find((entry) => text(entry.repository) === 'mbanatao/e-mango');
    if (!excluded
        || text(excluded.accessMode) !== 'discovery-only'
        || text(excluded.sourceRole) !== 'excluded') {
        errors.push('mbanatao/e-mango must remain an excluded discovery-only source repository');
    }
}
function validatePortfolioRegistry(registry) {
    const errors = [];
    const warnings = [];
    const productIds = new Set();
    const repositories = new Set();
    const managedRepositories = [];
    const discoveryOnlyRepositories = [];
    const rawRegistry = record(registry);
    if (!rawRegistry) {
        return {
            valid: false,
            errors: ['portfolio registry must be an object'],
            warnings,
            managedRepositories,
            discoveryOnlyRepositories,
        };
    }
    if (registry.schemaVersion !== '1.0.0')
        errors.push('unsupported portfolio registry schema');
    if (!ISO_DATE.test(text(registry.observedDate)))
        errors.push('observedDate must be YYYY-MM-DD');
    if (!text(registry.githubOwner))
        errors.push('githubOwner is required');
    if (!IMMUTABLE_RED_APPLE.test(text(registry.brandStandard?.canonicalAsset))) {
        errors.push('brand standard must use the immutable approved Red Apple asset');
    }
    const entries = Array.isArray(registry.repositories) ? registry.repositories : [];
    if (entries.length === 0)
        errors.push('portfolio registry must contain at least one repository');
    const validEntries = [];
    for (const rawEntry of entries) {
        const entry = record(rawEntry);
        if (!entry) {
            errors.push('portfolio registry contains an invalid or null repository entry');
            continue;
        }
        validEntries.push(entry);
        const productId = text(entry.productId);
        const repository = text(entry.repository);
        const displayName = text(entry.displayName);
        const qualification = text(entry.qualification);
        const visibility = text(entry.visibility);
        const defaultBranch = text(entry.defaultBranch);
        const accessMode = text(entry.accessMode);
        const productClass = text(entry.productClass);
        const brandStatus = text(entry.brandStatus);
        const sourceRole = text(entry.sourceRole);
        if (!PRODUCT_ID.test(productId))
            errors.push(`invalid productId: ${productId || '<empty>'}`);
        if (productIds.has(productId))
            errors.push(`duplicate productId: ${productId}`);
        productIds.add(productId);
        if (!OWNER_REPOSITORY.test(repository))
            errors.push(`invalid repository: ${repository || '<empty>'}`);
        if (repositories.has(repository.toLowerCase()))
            errors.push(`duplicate repository: ${repository}`);
        repositories.add(repository.toLowerCase());
        const [owner] = repository.split('/');
        if (owner !== registry.githubOwner)
            errors.push(`repository owner mismatch: ${repository}`);
        if (!displayName)
            errors.push(`displayName is required for ${repository}`);
        if (!VISIBILITIES.has(visibility)) {
            errors.push(`invalid visibility for ${repository}: ${visibility || '<empty>'}`);
        }
        if (!defaultBranch) {
            errors.push(`defaultBranch is required for ${repository}`);
        }
        else if (defaultBranch !== 'main') {
            warnings.push(`${repository} does not use main as its default branch`);
        }
        if (!qualification)
            errors.push(`qualification evidence is required for ${repository}`);
        if (!PRODUCT_CLASSES.has(productClass)) {
            errors.push(`invalid productClass for ${repository}: ${productClass || '<empty>'}`);
        }
        if (!BRAND_STATUSES.has(brandStatus)) {
            errors.push(`invalid brand status for ${repository}: ${brandStatus || '<empty>'}`);
        }
        if (sourceRole && sourceRole !== 'excluded') {
            errors.push(`invalid sourceRole for ${repository}: ${sourceRole}`);
        }
        if (sourceRole === 'excluded' && accessMode !== 'discovery-only') {
            errors.push(`excluded source repository must remain discovery-only: ${repository}`);
        }
        if (accessMode === 'managed') {
            managedRepositories.push(repository);
            if (productClass === 'unqualified' || productClass === 'qualification-required'
                || qualification === 'repository-ownership-only') {
                errors.push(`managed repository lacks product qualification: ${repository}`);
            }
            if (brandStatus === 'not-applicable-until-qualified'
                || brandStatus === 'required-if-confirmed-product') {
                errors.push(`managed product cannot skip the Red Apple standard: ${repository}`);
            }
            validateBackendMapping(entry, repository, errors);
        }
        else if (accessMode === 'discovery-only') {
            discoveryOnlyRepositories.push(repository);
            if (productClass === 'core-product' || productClass === 'control-infrastructure') {
                warnings.push(`core repository is discovery-only: ${repository}`);
            }
            if (entry.backend || entry.productionDeployment) {
                errors.push(`discovery-only repository cannot declare a governed backend: ${repository}`);
            }
        }
        else if (!ACCESS_MODES.has(accessMode)) {
            errors.push(`invalid accessMode for ${repository}: ${accessMode || '<empty>'}`);
        }
    }
    validateCanonicalEuropayMapping(validEntries, errors);
    managedRepositories.sort();
    discoveryOnlyRepositories.sort();
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        managedRepositories,
        discoveryOnlyRepositories,
    };
}
function requireManagedRepository(registry, repository) {
    (0, source_authority_js_1.assertOperationalRepository)(repository, 'manage');
    const validation = validatePortfolioRegistry(registry);
    if (!validation.valid)
        throw new Error(`invalid portfolio registry: ${validation.errors.join('; ')}`);
    const normalized = text(repository).toLowerCase();
    const entry = registry.repositories.find((candidate) => candidate.repository.toLowerCase() === normalized);
    if (!entry)
        throw new Error(`repository is not registered: ${repository}`);
    if (entry.accessMode !== 'managed') {
        throw new Error(`repository is discovery-only and requires qualification: ${entry.repository}`);
    }
    return entry;
}
//# sourceMappingURL=portfolio-registry.js.map
