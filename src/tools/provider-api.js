"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseProviderApiTools = exports.githubProviderApiTools = void 0;
exports.executeGitHubProviderApiTool = executeGitHubProviderApiTool;
exports.executeSupabaseProviderApiTool = executeSupabaseProviderApiTool;
const zod_1 = require("zod");
const GITHUB_API_ORIGIN = 'https://api.github.com';
const SUPABASE_API_ORIGIN = 'https://api.supabase.com/v1';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RESPONSE_BYTES = 2000000;
const ReadMethodSchema = zod_1.z.enum(['GET', 'HEAD']).default('GET');
const WriteMethodSchema = zod_1.z.enum(['POST', 'PUT', 'PATCH']);
const PathSegmentsSchema = zod_1.z.array(zod_1.z.string().min(1).max(512)
    .refine((value) => !value.includes('\0'), 'Path segment contains a null byte')
    .refine((value) => value !== '.' && value !== '..', 'Path traversal segments are not allowed')).max(32).default([]);
const QueryValueSchema = zod_1.z.union([
    zod_1.z.string(),
    zod_1.z.number().finite(),
    zod_1.z.boolean(),
    zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.number().finite(), zod_1.z.boolean()])).max(100),
]);
const QuerySchema = zod_1.z.record(QueryValueSchema).default({});
const GitHubBaseArgsSchema = zod_1.z.object({
    owner: zod_1.z.string().min(1),
    repo: zod_1.z.string().min(1),
    pathSegments: PathSegmentsSchema,
    query: QuerySchema,
});
const GitHubReadArgsSchema = GitHubBaseArgsSchema.extend({ method: ReadMethodSchema });
const GitHubWriteArgsSchema = GitHubBaseArgsSchema.extend({
    method: WriteMethodSchema,
    body: zod_1.z.unknown().optional(),
    confirmation: zod_1.z.string().min(1),
});
const GitHubDeleteArgsSchema = GitHubBaseArgsSchema.extend({
    body: zod_1.z.unknown().optional(),
    confirmation: zod_1.z.string().min(1),
});
const SupabaseAccountArgsSchema = zod_1.z.object({ accountId: zod_1.z.string().min(1) });
const SupabaseProjectArgsSchema = SupabaseAccountArgsSchema.extend({
    projectRef: zod_1.z.string().regex(/^[a-z0-9]{20}$/),
});
const SupabaseProjectReadArgsSchema = SupabaseProjectArgsSchema.extend({
    method: ReadMethodSchema,
    pathSegments: PathSegmentsSchema,
    query: QuerySchema,
});
const SupabaseProjectWriteArgsSchema = SupabaseProjectArgsSchema.extend({
    method: WriteMethodSchema,
    pathSegments: PathSegmentsSchema,
    query: QuerySchema,
    body: zod_1.z.unknown().optional(),
    confirmation: zod_1.z.string().min(1),
});
const SupabaseProjectDeleteArgsSchema = SupabaseProjectArgsSchema.extend({
    pathSegments: PathSegmentsSchema,
    query: QuerySchema,
    body: zod_1.z.unknown().optional(),
    confirmation: zod_1.z.string().min(1),
});
const SupabaseOrganizationBaseArgsSchema = SupabaseAccountArgsSchema.extend({
    organizationSlug: zod_1.z.string().min(1),
    pathSegments: PathSegmentsSchema,
    query: QuerySchema,
});
const SupabaseOrganizationReadArgsSchema = SupabaseOrganizationBaseArgsSchema.extend({
    method: ReadMethodSchema,
});
const SupabaseOrganizationWriteArgsSchema = SupabaseOrganizationBaseArgsSchema.extend({
    method: WriteMethodSchema,
    body: zod_1.z.unknown().optional(),
    confirmation: zod_1.z.string().min(1),
});
const SupabaseOrganizationDeleteArgsSchema = SupabaseOrganizationBaseArgsSchema.extend({
    body: zod_1.z.unknown().optional(),
    confirmation: zod_1.z.string().min(1),
});
const SupabaseBranchBaseArgsSchema = SupabaseProjectArgsSchema.extend({
    branchIdOrRef: zod_1.z.string().min(1).max(160),
    pathSegments: PathSegmentsSchema,
    query: QuerySchema,
});
const SupabaseBranchReadArgsSchema = SupabaseBranchBaseArgsSchema.extend({ method: ReadMethodSchema });
const SupabaseBranchWriteArgsSchema = SupabaseBranchBaseArgsSchema.extend({
    method: WriteMethodSchema,
    body: zod_1.z.unknown().optional(),
    confirmation: zod_1.z.string().min(1),
});
const SupabaseBranchDeleteArgsSchema = SupabaseBranchBaseArgsSchema.extend({
    body: zod_1.z.unknown().optional(),
    confirmation: zod_1.z.string().min(1),
});
function encodeSegments(segments) {
    return segments.map((segment) => encodeURIComponent(segment)).join('/');
}
function encodedSuffix(segments) {
    return segments.length > 0 ? `/${encodeSegments(segments)}` : '';
}
function rawSuffix(segments) {
    return segments.length > 0 ? `/${segments.join('/')}` : '';
}
function normalizedSupabasePath(segments) {
    return segments.map((segment) => {
        let normalized = segment.normalize('NFKC').trim().toLowerCase();
        for (let attempt = 0; attempt <= segment.length; attempt += 1) {
            try {
                const decoded = decodeURIComponent(normalized);
                if (decoded === normalized)
                    break;
                normalized = decoded.normalize('NFKC').trim().toLowerCase();
            }
            catch {
                throw new Error('Supabase Management API path contains invalid encoding');
            }
        }
        return normalized;
    }).join('/').replace(/\/{2,}/g, '/');
}
function assertProjectMutationPathAllowed(pathSegments) {
    const normalizedPath = normalizedSupabasePath(pathSegments);
    const normalizedSegments = normalizedPath.split('/');
    if (normalizedSegments.some((segment) => segment === '.' || segment === '..')) {
        throw new Error('Path traversal segments are not allowed');
    }
    if (normalizedPath === 'config/auth' || normalizedPath.startsWith('config/auth/')) {
        throw new Error('Supabase Auth configuration is reserved for dedicated security tools');
    }
}
function buildQuery(query) {
    const params = new URLSearchParams();
    for (const [key, rawValue] of Object.entries(query)) {
        if (rawValue === undefined)
            continue;
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const value of values)
            params.append(key, String(value));
    }
    const rendered = params.toString();
    return rendered ? `?${rendered}` : '';
}
function selectedHeaders(headers) {
    if (!headers)
        return {};
    const names = [
        'content-type', 'content-length', 'etag', 'last-modified', 'link', 'location',
        'content-range', 'x-total-count', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
    ];
    return Object.fromEntries(names
        .map((name) => [name, headers.get(name)])
        .filter((entry) => typeof entry[1] === 'string'));
}
async function parseResponse(response, method, maxResponseBytes, providerName) {
    const declaredLength = Number(response.headers?.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        throw new Error(`${providerName} response exceeded size limit`);
    }
    if (!response.ok)
        throw new Error(`${providerName} request failed with ${response.status}`);
    if (method === 'HEAD')
        return { status: response.status, headers: selectedHeaders(response.headers) };
    if (response.text) {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
            throw new Error(`${providerName} response exceeded size limit`);
        }
        if (!text.trim())
            return { status: response.status, headers: selectedHeaders(response.headers) };
        try {
            return JSON.parse(text);
        }
        catch {
            return { status: response.status, headers: selectedHeaders(response.headers), body: text };
        }
    }
    if (response.json)
        return response.json();
    return { status: response.status, headers: selectedHeaders(response.headers) };
}
async function providerRequest(fetchFn, url, method, headers, query, body, timeoutMs, maxResponseBytes, providerName) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchFn(`${url}${buildQuery(query)}`, {
            method,
            headers,
            body: body === undefined || method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body),
            signal: controller.signal,
            redirect: 'error',
        });
        return await parseResponse(response, method, maxResponseBytes, providerName);
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`${providerName} request timed out`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }
}
function githubHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'MCPMaster-GitHub-Control/2.0',
        'X-GitHub-Api-Version': '2022-11-28',
    };
}
async function githubRepositoryRequest(configuration, method, owner, repo, pathSegments, query, body, fetchFn = globalThis.fetch) {
    if (configuration.baseUrl !== GITHUB_API_ORIGIN)
        throw new Error('GitHub API origin is not trusted');
    const url = `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${encodedSuffix(pathSegments)}`;
    return providerRequest(fetchFn, url, method, githubHeaders(configuration.token), query, body, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RESPONSE_BYTES, 'GitHub API');
}
async function executeGitHubProviderApiTool(tool, args, configuration, fetchFn) {
    switch (tool) {
        case 'github.read-repository-api': {
            const input = GitHubReadArgsSchema.parse(args);
            return githubRepositoryRequest(configuration, input.method, input.owner, input.repo, input.pathSegments, input.query, undefined, fetchFn);
        }
        case 'github.write-repository-api': {
            const input = GitHubWriteArgsSchema.parse(args);
            const expected = `${input.method} ${input.owner}/${input.repo}${rawSuffix(input.pathSegments)}`;
            if (input.confirmation !== expected)
                throw new Error(`Confirmation must exactly equal "${expected}"`);
            return githubRepositoryRequest(configuration, input.method, input.owner, input.repo, input.pathSegments, input.query, input.body, fetchFn);
        }
        case 'github.delete-repository-api': {
            const input = GitHubDeleteArgsSchema.parse(args);
            const expected = `DELETE ${input.owner}/${input.repo}${rawSuffix(input.pathSegments)}`;
            if (input.confirmation !== expected)
                throw new Error(`Confirmation must exactly equal "${expected}"`);
            return githubRepositoryRequest(configuration, 'DELETE', input.owner, input.repo, input.pathSegments, input.query, input.body, fetchFn);
        }
        default:
            throw new Error(`Unknown GitHub provider API tool: ${tool}`);
    }
}
function supabaseAccount(configuration, accountId) {
    const account = configuration.accounts.find((candidate) => candidate.id === accountId);
    if (!account)
        throw new Error(`Unknown Supabase account: ${accountId}`);
    return account;
}
function assertSupabaseMutationAllowed(account) {
    if (!account.allowMutations)
        throw new Error(`Mutations are disabled for Supabase account ${account.id}`);
}
function assertOrganizationAllowed(account, organizationSlug) {
    if (account.allowedOrganizationSlugs.length === 0
        || !account.allowedOrganizationSlugs.includes(organizationSlug))
        throw new Error(`Supabase account ${account.id} is not allowed to access organization ${organizationSlug}`);
}
function assertProjectRefAllowed(account, projectRef) {
    if ((account.allowedProjectRefs.length === 0 && account.allowedOrganizationSlugs.length === 0)
        || (account.allowedProjectRefs.length > 0 && !account.allowedProjectRefs.includes(projectRef))) {
        throw new Error(`Supabase account ${account.id} is not allowed to access project ${projectRef}`);
    }
}
function supabaseHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'MCPMaster-Supabase-Control/2.0',
    };
}
async function supabaseRequest(account, configuration, path, method, query, body, fetchFn = globalThis.fetch) {
    if (!path.startsWith('/') || path.includes('://'))
        throw new Error('Supabase Management API path is not trusted');
    return providerRequest(fetchFn, `${SUPABASE_API_ORIGIN}${path}`, method, supabaseHeaders(account.token), query, body, configuration.timeoutMs || DEFAULT_TIMEOUT_MS, configuration.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES, 'Supabase Management API');
}
async function ensureProjectAllowed(account, configuration, projectRef, fetchFn) {
    assertProjectRefAllowed(account, projectRef);
    if (account.allowedOrganizationSlugs.length === 0)
        return;
    const project = await supabaseRequest(account, configuration, `/projects/${encodeURIComponent(projectRef)}`, 'GET', {}, undefined, fetchFn);
    const organizationSlug = project && typeof project === 'object'
        ? project.organization_slug
        : undefined;
    if (typeof organizationSlug !== 'string' || !account.allowedOrganizationSlugs.includes(organizationSlug)) {
        throw new Error(`Supabase account ${account.id} is not allowed to access project ${projectRef}`);
    }
}
async function ensureBranchAllowed(account, configuration, projectRef, branchIdOrRef, fetchFn) {
    await ensureProjectAllowed(account, configuration, projectRef, fetchFn);
    const data = await supabaseRequest(account, configuration, `/projects/${encodeURIComponent(projectRef)}/branches`, 'GET', {}, undefined, fetchFn);
    const branches = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray(data.branches)
            ? data.branches
            : [];
    const match = branches.some((candidate) => {
        if (!candidate || typeof candidate !== 'object')
            return false;
        const branch = candidate;
        return [branch.id, branch.ref, branch.name].some((value) => value === branchIdOrRef);
    });
    if (!match)
        throw new Error(`Branch ${branchIdOrRef} is not visible under allowed project ${projectRef}`);
}
function assertConfirmation(actual, expected) {
    if (actual !== expected)
        throw new Error(`Confirmation must exactly equal "${expected}"`);
}
async function executeSupabaseProviderApiTool(tool, args, configuration, fetchFn) {
    const providerFetch = fetchFn;
    switch (tool) {
        case 'supabase.read-project-api': {
            const input = SupabaseProjectReadArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            await ensureProjectAllowed(account, configuration, input.projectRef, providerFetch);
            return supabaseRequest(account, configuration, `/projects/${encodeURIComponent(input.projectRef)}${encodedSuffix(input.pathSegments)}`, input.method, input.query, undefined, providerFetch);
        }
        case 'supabase.write-project-api': {
            const input = SupabaseProjectWriteArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            assertSupabaseMutationAllowed(account);
            assertProjectMutationPathAllowed(input.pathSegments);
            await ensureProjectAllowed(account, configuration, input.projectRef, providerFetch);
            assertConfirmation(input.confirmation, `${input.method} PROJECT ${input.projectRef}${rawSuffix(input.pathSegments)}`);
            return supabaseRequest(account, configuration, `/projects/${encodeURIComponent(input.projectRef)}${encodedSuffix(input.pathSegments)}`, input.method, input.query, input.body, providerFetch);
        }
        case 'supabase.delete-project-api': {
            const input = SupabaseProjectDeleteArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            assertSupabaseMutationAllowed(account);
            assertProjectMutationPathAllowed(input.pathSegments);
            await ensureProjectAllowed(account, configuration, input.projectRef, providerFetch);
            assertConfirmation(input.confirmation, `DELETE PROJECT ${input.projectRef}${rawSuffix(input.pathSegments)}`);
            return supabaseRequest(account, configuration, `/projects/${encodeURIComponent(input.projectRef)}${encodedSuffix(input.pathSegments)}`, 'DELETE', input.query, input.body, providerFetch);
        }
        case 'supabase.read-organization-api': {
            const input = SupabaseOrganizationReadArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            assertOrganizationAllowed(account, input.organizationSlug);
            return supabaseRequest(account, configuration, `/organizations/${encodeURIComponent(input.organizationSlug)}${encodedSuffix(input.pathSegments)}`, input.method, input.query, undefined, providerFetch);
        }
        case 'supabase.write-organization-api': {
            const input = SupabaseOrganizationWriteArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            assertSupabaseMutationAllowed(account);
            assertOrganizationAllowed(account, input.organizationSlug);
            assertConfirmation(input.confirmation, `${input.method} ORGANIZATION ${input.organizationSlug}${rawSuffix(input.pathSegments)}`);
            return supabaseRequest(account, configuration, `/organizations/${encodeURIComponent(input.organizationSlug)}${encodedSuffix(input.pathSegments)}`, input.method, input.query, input.body, providerFetch);
        }
        case 'supabase.delete-organization-api': {
            const input = SupabaseOrganizationDeleteArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            assertSupabaseMutationAllowed(account);
            assertOrganizationAllowed(account, input.organizationSlug);
            assertConfirmation(input.confirmation, `DELETE ORGANIZATION ${input.organizationSlug}${rawSuffix(input.pathSegments)}`);
            return supabaseRequest(account, configuration, `/organizations/${encodeURIComponent(input.organizationSlug)}${encodedSuffix(input.pathSegments)}`, 'DELETE', input.query, input.body, providerFetch);
        }
        case 'supabase.read-branch-api': {
            const input = SupabaseBranchReadArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            await ensureBranchAllowed(account, configuration, input.projectRef, input.branchIdOrRef, providerFetch);
            return supabaseRequest(account, configuration, `/branches/${encodeURIComponent(input.branchIdOrRef)}${encodedSuffix(input.pathSegments)}`, input.method, input.query, undefined, providerFetch);
        }
        case 'supabase.write-branch-api': {
            const input = SupabaseBranchWriteArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            assertSupabaseMutationAllowed(account);
            await ensureBranchAllowed(account, configuration, input.projectRef, input.branchIdOrRef, providerFetch);
            assertConfirmation(input.confirmation, `${input.method} BRANCH ${input.projectRef}:${input.branchIdOrRef}${rawSuffix(input.pathSegments)}`);
            return supabaseRequest(account, configuration, `/branches/${encodeURIComponent(input.branchIdOrRef)}${encodedSuffix(input.pathSegments)}`, input.method, input.query, input.body, providerFetch);
        }
        case 'supabase.delete-branch-api': {
            const input = SupabaseBranchDeleteArgsSchema.parse(args);
            const account = supabaseAccount(configuration, input.accountId);
            assertSupabaseMutationAllowed(account);
            await ensureBranchAllowed(account, configuration, input.projectRef, input.branchIdOrRef, providerFetch);
            assertConfirmation(input.confirmation, `DELETE BRANCH ${input.projectRef}:${input.branchIdOrRef}${rawSuffix(input.pathSegments)}`);
            return supabaseRequest(account, configuration, `/branches/${encodeURIComponent(input.branchIdOrRef)}${encodedSuffix(input.pathSegments)}`, 'DELETE', input.query, input.body, providerFetch);
        }
        default:
            throw new Error(`Unknown Supabase provider API tool: ${tool}`);
    }
}
const repositoryProperties = {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
};
const accountProperty = { accountId: { type: 'string', description: 'Configured MCPMaster Supabase account ID' } };
const projectProperties = {
    ...accountProperty,
    projectRef: { type: 'string', description: 'Exact 20-character Supabase project ref' },
};
const genericProperties = {
    pathSegments: {
        type: 'array', items: { type: 'string' },
        description: 'Provider path segments after the selected repository/project/organization/branch',
    },
    query: { type: 'object', additionalProperties: true, description: 'Query parameters' },
};
exports.githubProviderApiTools = {
    'github.read-repository-api': {
        description: 'Call any GET or HEAD GitHub REST endpoint under one allowlisted repository',
        parameters: {
            type: 'object',
            properties: { ...repositoryProperties, ...genericProperties, method: { type: 'string', enum: ['GET', 'HEAD'] } },
            required: ['owner', 'repo'],
        },
    },
    'github.write-repository-api': {
        description: 'Call any POST, PUT, or PATCH GitHub REST endpoint under one allowlisted repository',
        parameters: {
            type: 'object',
            properties: {
                ...repositoryProperties, ...genericProperties,
                method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
                body: { description: 'JSON request body' },
                confirmation: { type: 'string', description: 'METHOD owner/repo/path' },
            },
            required: ['owner', 'repo', 'method', 'confirmation'],
        },
    },
    'github.delete-repository-api': {
        description: 'Call any DELETE GitHub REST endpoint under one allowlisted repository; classified as destructive',
        parameters: {
            type: 'object',
            properties: {
                ...repositoryProperties, ...genericProperties,
                body: { description: 'Optional JSON request body' },
                confirmation: { type: 'string', description: 'DELETE owner/repo/path' },
            },
            required: ['owner', 'repo', 'confirmation'],
        },
    },
};
exports.supabaseProviderApiTools = {
    'supabase.read-project-api': {
        description: 'Call any GET or HEAD Management API endpoint under one allowlisted Supabase project',
        parameters: {
            type: 'object', properties: { ...projectProperties, ...genericProperties, method: { type: 'string', enum: ['GET', 'HEAD'] } },
            required: ['accountId', 'projectRef'],
        },
    },
    'supabase.write-project-api': {
        description: 'Call any POST, PUT, or PATCH Management API endpoint under one allowlisted Supabase project',
        parameters: {
            type: 'object',
            properties: {
                ...projectProperties, ...genericProperties, method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
                body: { description: 'JSON request body' }, confirmation: { type: 'string', description: 'METHOD PROJECT projectRef/path' },
            },
            required: ['accountId', 'projectRef', 'method', 'confirmation'],
        },
    },
    'supabase.delete-project-api': {
        description: 'Call any DELETE Management API endpoint under one allowlisted Supabase project; classified as destructive',
        parameters: {
            type: 'object',
            properties: { ...projectProperties, ...genericProperties, body: {}, confirmation: { type: 'string' } },
            required: ['accountId', 'projectRef', 'confirmation'],
        },
    },
    'supabase.read-organization-api': {
        description: 'Call any GET or HEAD Management API endpoint under one allowlisted Supabase organization',
        parameters: {
            type: 'object',
            properties: { ...accountProperty, organizationSlug: { type: 'string' }, ...genericProperties, method: { type: 'string', enum: ['GET', 'HEAD'] } },
            required: ['accountId', 'organizationSlug'],
        },
    },
    'supabase.write-organization-api': {
        description: 'Call any POST, PUT, or PATCH Management API endpoint under one allowlisted Supabase organization',
        parameters: {
            type: 'object',
            properties: {
                ...accountProperty, organizationSlug: { type: 'string' }, ...genericProperties,
                method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] }, body: {}, confirmation: { type: 'string' },
            },
            required: ['accountId', 'organizationSlug', 'method', 'confirmation'],
        },
    },
    'supabase.delete-organization-api': {
        description: 'Call any DELETE Management API endpoint under one allowlisted Supabase organization; classified as destructive',
        parameters: {
            type: 'object',
            properties: { ...accountProperty, organizationSlug: { type: 'string' }, ...genericProperties, body: {}, confirmation: { type: 'string' } },
            required: ['accountId', 'organizationSlug', 'confirmation'],
        },
    },
    'supabase.read-branch-api': {
        description: 'Call any GET or HEAD Management API endpoint under a branch verified against an allowlisted project',
        parameters: {
            type: 'object',
            properties: { ...projectProperties, branchIdOrRef: { type: 'string' }, ...genericProperties, method: { type: 'string', enum: ['GET', 'HEAD'] } },
            required: ['accountId', 'projectRef', 'branchIdOrRef'],
        },
    },
    'supabase.write-branch-api': {
        description: 'Call any POST, PUT, or PATCH Management API endpoint under a branch verified against an allowlisted project',
        parameters: {
            type: 'object',
            properties: {
                ...projectProperties, branchIdOrRef: { type: 'string' }, ...genericProperties,
                method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] }, body: {}, confirmation: { type: 'string' },
            },
            required: ['accountId', 'projectRef', 'branchIdOrRef', 'method', 'confirmation'],
        },
    },
    'supabase.delete-branch-api': {
        description: 'Call any DELETE Management API endpoint under a branch verified against an allowlisted project; classified as destructive',
        parameters: {
            type: 'object',
            properties: { ...projectProperties, branchIdOrRef: { type: 'string' }, ...genericProperties, body: {}, confirmation: { type: 'string' } },
            required: ['accountId', 'projectRef', 'branchIdOrRef', 'confirmation'],
        },
    },
};
//# sourceMappingURL=provider-api.js.map