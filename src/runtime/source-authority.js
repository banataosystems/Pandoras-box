"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourceAuthorityPolicy = void 0;
exports.repositorySourceStatus = repositorySourceStatus;
exports.isOperationalRepository = isOperationalRepository;
exports.assertOperationalRepository = assertOperationalRepository;
const fs_1 = require("node:fs");
const path_1 = require("node:path");

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const POLICY_PATH = (0, path_1.resolve)(__dirname, '..', '..', 'SOURCE_AUTHORITY_POLICY.json');

function loadPolicy() {
    const parsed = JSON.parse((0, fs_1.readFileSync)(POLICY_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || parsed.mode !== 'fail_closed') {
        throw new Error('source authority policy is missing or not fail closed');
    }
    if (!Array.isArray(parsed.deprecated_operational_sources)) {
        throw new Error('source authority policy has no deprecated operational sources');
    }
    return Object.freeze(parsed);
}

exports.sourceAuthorityPolicy = loadPolicy();

function normalizedRepository(repository) {
    if (typeof repository !== 'string')
        return '';
    const normalized = repository.trim();
    return REPOSITORY.test(normalized) ? normalized.toLowerCase() : '';
}

function repositorySourceStatus(repository, policy = exports.sourceAuthorityPolicy) {
    const normalized = normalizedRepository(repository);
    if (!normalized)
        return 'invalid';
    const [owner] = normalized.split('/');
    for (const source of policy.deprecated_operational_sources) {
        if (!source || source.status !== 'historical_only')
            continue;
        const value = typeof source.value === 'string' ? source.value.trim().toLowerCase() : '';
        if ((source.type === 'github_owner' && owner === value)
            || (source.type === 'github_repository' && normalized === value)) {
            return 'historical_only';
        }
    }
    return 'operational';
}

function isOperationalRepository(repository, policy = exports.sourceAuthorityPolicy) {
    return repositorySourceStatus(repository, policy) === 'operational';
}

function assertOperationalRepository(repository, action = 'operate on') {
    const status = repositorySourceStatus(repository);
    if (status === 'invalid')
        throw new Error(`repository is invalid: ${repository}`);
    if (status !== 'operational') {
        throw new Error(`source authority rejected ${action} historical-only repository ${repository}`);
    }
}
