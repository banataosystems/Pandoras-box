"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolRegistry = void 0;
exports.getAllTools = getAllTools;
exports.getRuntimeToolDefinition = getRuntimeToolDefinition;
exports.executeTool = executeTool;
const github_js_1 = require("../tools/github.js");
const memory_js_1 = require("../tools/memory.js");
const provider_api_js_1 = require("../tools/provider-api.js");
const supabase_auth_security_js_1 = require("../tools/supabase-auth-security.js");
const supabase_js_1 = require("../tools/supabase.js");
const tool_manifest_js_1 = require("./tool-manifest.js");
const result_redaction_js_1 = require("./result-redaction.js");
const githubDefinitions = {
    ...github_js_1.githubTools,
    // The server method and executor case already existed, but the tool was never
    // registered in the public catalog. The manifest inventory exposed the drift.
    'github.get-workflow-run': {
        description: 'Get one GitHub Actions workflow run by ID',
        parameters: {
            type: 'object',
            properties: {
                owner: { type: 'string', description: 'Repository owner' },
                repo: { type: 'string', description: 'Repository name' },
                runId: { type: 'number', description: 'Workflow run ID' },
            },
            required: ['owner', 'repo', 'runId'],
        },
    },
    ...provider_api_js_1.githubProviderApiTools,
};
const supabaseDefinitions = {
    ...supabase_js_1.supabaseTools,
    ...supabase_auth_security_js_1.supabaseAuthSecurityTools,
    ...provider_api_js_1.supabaseProviderApiTools,
};
const memoryDefinitions = {
    ...memory_js_1.memoryTools,
};
function buildRegistry(handler, definitions) {
    return Object.fromEntries(Object.entries(definitions).map(([name, definition]) => {
        const tool = (0, tool_manifest_js_1.getToolManifest)(name);
        if (!tool)
            throw new Error(`Tool manifest is missing for ${name}`);
        if (tool.provider !== handler) {
            throw new Error(`Tool manifest provider mismatch for ${name}`);
        }
        return [name, {
                handler,
                description: definition.description,
                inputSchema: definition.parameters,
                manifest: tool,
            }];
    }));
}
const githubRegistry = buildRegistry('github', githubDefinitions);
const supabaseRegistry = buildRegistry('supabase', supabaseDefinitions);
const memoryRegistry = buildRegistry('memory', memoryDefinitions);
exports.toolRegistry = Object.freeze({
    ...githubRegistry,
    ...supabaseRegistry,
    ...memoryRegistry,
});
const registeredNames = new Set(Object.keys(exports.toolRegistry));
for (const manifestName of Object.keys(tool_manifest_js_1.toolManifests)) {
    if (!registeredNames.has(manifestName)) {
        throw new Error(`Orphan tool manifest without registered implementation: ${manifestName}`);
    }
}
function normalizedRepository(value) {
    return value.trim().toLowerCase();
}
function allowedRepositorySet(configuration) {
    return new Set(configuration.allowedRepositories.map(normalizedRepository));
}
function assertRequiredScopes(definition, grantedScopes) {
    // Production resolvers and environment builders always populate this field.
    // Undefined is retained only for legacy direct-adapter unit fixtures.
    if (grantedScopes === undefined)
        return;
    const granted = new Set(grantedScopes.map((scope) => scope.trim()).filter(Boolean));
    const missing = definition.manifest.requiredProviderScopes.filter((scope) => !granted.has(scope));
    if (missing.length > 0) {
        throw new Error(`${definition.handler} account is missing required scope${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
    }
}
function assertGitHubAccess(definition, args, configuration) {
    if (configuration.baseUrl !== 'https://api.github.com') {
        throw new Error('GitHub API origin is not trusted');
    }
    if (definition.manifest.mutation && !configuration.allowMutations) {
        throw new Error(`GitHub mutations are disabled for account ${configuration.id}`);
    }
    assertRequiredScopes(definition, configuration.grantedScopes);
    const owner = typeof args.owner === 'string' ? args.owner : undefined;
    const repo = typeof args.repo === 'string' ? args.repo : undefined;
    const allowlist = allowedRepositorySet(configuration);
    if (owner && repo) {
        const fullName = normalizedRepository(`${owner}/${repo}`);
        if (!allowlist.has(fullName)) {
            throw new Error(`GitHub account ${configuration.id} is not allowed to access ${owner}/${repo}`);
        }
    }
}
function selectedSupabaseAccount(configuration, args) {
    const accountId = typeof args.accountId === 'string' ? args.accountId : undefined;
    if (!accountId)
        return undefined;
    return configuration.accounts.find((candidate) => candidate.id === accountId);
}
function assertSupabaseAccess(definition, args, configuration) {
    if (definition.manifest.requiredProviderScopes.length === 0 && !definition.manifest.mutation)
        return;
    const accountId = typeof args.accountId === 'string' ? args.accountId : undefined;
    if (!accountId)
        throw new Error('Supabase operation requires an explicit accountId');
    const account = selectedSupabaseAccount(configuration, args);
    if (!account)
        throw new Error(`Unknown Supabase account: ${accountId}`);
    if (definition.manifest.mutation && !account.allowMutations) {
        throw new Error(`Mutations are disabled for Supabase account ${account.id}`);
    }
    assertRequiredScopes(definition, account.grantedScopes);
}
function assertMemoryAccess(definition, args, configuration) {
    if (definition.manifest.mutation) {
        throw new Error('Pandora Memory mutations are not registered in MCPMaster');
    }
    assertRequiredScopes(definition, configuration.grantedScopes);
    // Every namespace-scoped Memory operation is checked here, not just search,
    // so a new retrieval tool cannot reach an unapproved namespace.
    if (definition.manifest.name === 'memory.search'
        || definition.manifest.name === 'memory.canonicalContext') {
        const namespace = typeof args.namespace === 'string' ? args.namespace : undefined;
        if (!namespace || !configuration.allowedNamespaces.includes(namespace)) {
            throw new Error(`Pandora Memory namespace is not allowed: ${namespace || 'missing'}`);
        }
    }
}
function repositoryFromApiUrl(value) {
    if (typeof value !== 'string')
        return undefined;
    const match = value.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)(?:\/|$)/i);
    return match?.[1];
}
function filterGitHubResult(toolName, result, configuration) {
    const allowlist = allowedRepositorySet(configuration);
    const repositoryAllowed = (fullName) => (typeof fullName === 'string' && allowlist.has(normalizedRepository(fullName)));
    if (toolName === 'github.list-repositories' && Array.isArray(result)) {
        return result.filter((repository) => (repository && typeof repository === 'object'
            && repositoryAllowed(repository.full_name)));
    }
    if (toolName === 'github.search-repositories' && result && typeof result === 'object') {
        const record = result;
        if (Array.isArray(record.items)) {
            const items = record.items.filter((repository) => (repository && typeof repository === 'object'
                && repositoryAllowed(repository.full_name)));
            return { ...record, items, total_count: items.length };
        }
    }
    if (toolName === 'github.search-issues' && result && typeof result === 'object') {
        const record = result;
        if (Array.isArray(record.items)) {
            const items = record.items.filter((issue) => {
                if (!issue || typeof issue !== 'object')
                    return false;
                const repository = repositoryFromApiUrl(issue.repository_url);
                return repository ? repositoryAllowed(repository) : false;
            });
            return { ...record, items, total_count: items.length };
        }
    }
    return result;
}
function getAllTools() {
    return Object.keys(exports.toolRegistry);
}
function getRuntimeToolDefinition(toolName) {
    return exports.toolRegistry[toolName];
}
async function executeTool(toolName, args, configuration) {
    const definition = exports.toolRegistry[toolName];
    if (!definition)
        throw new Error(`Unknown tool: ${toolName}`);
    (0, tool_manifest_js_1.assertManifestConfirmation)(toolName, args);
    const resolvedConfiguration = await configuration;
    if (definition.handler === 'github') {
        const githubConfiguration = resolvedConfiguration.github;
        if (!githubConfiguration || typeof githubConfiguration !== 'object') {
            throw new Error('GitHub configuration is missing');
        }
        const typedConfiguration = githubConfiguration;
        assertGitHubAccess(definition, args, typedConfiguration);
        (0, tool_manifest_js_1.assertHighImpactPolicy)(toolName, args);
        const result = Object.prototype.hasOwnProperty.call(provider_api_js_1.githubProviderApiTools, toolName)
            ? await (0, provider_api_js_1.executeGitHubProviderApiTool)(toolName, args, typedConfiguration)
            : await (0, github_js_1.executeGitHubTool)(toolName, args, typedConfiguration);
        return (0, result_redaction_js_1.redactSensitiveResult)(filterGitHubResult(toolName, result, typedConfiguration));
    }
    if (definition.handler === 'memory') {
        const memoryConfiguration = resolvedConfiguration.memory;
        if (!memoryConfiguration || typeof memoryConfiguration !== 'object') {
            throw new Error('Pandora Memory configuration is missing');
        }
        const typedConfiguration = memoryConfiguration;
        assertMemoryAccess(definition, args, typedConfiguration);
        (0, tool_manifest_js_1.assertHighImpactPolicy)(toolName, args);
        return (0, result_redaction_js_1.redactSensitiveResult)(await (0, memory_js_1.executeMemoryTool)(toolName, args, typedConfiguration));
    }
    const supabaseConfiguration = resolvedConfiguration.supabase;
    if (!supabaseConfiguration || typeof supabaseConfiguration !== 'object') {
        throw new Error('Supabase configuration is missing');
    }
    const typedConfiguration = supabaseConfiguration;
    assertSupabaseAccess(definition, args, typedConfiguration);
    (0, tool_manifest_js_1.assertHighImpactPolicy)(toolName, args);
    const result = Object.prototype.hasOwnProperty.call(provider_api_js_1.supabaseProviderApiTools, toolName)
        ? await (0, provider_api_js_1.executeSupabaseProviderApiTool)(toolName, args, typedConfiguration)
        : Object.prototype.hasOwnProperty.call(supabase_auth_security_js_1.supabaseAuthSecurityTools, toolName)
            ? await (0, supabase_auth_security_js_1.executeSupabaseAuthSecurityTool)(toolName, args, typedConfiguration)
            : await (0, supabase_js_1.executeSupabaseTool)(toolName, args, typedConfiguration);
    return (0, result_redaction_js_1.redactSensitiveResult)(result);
}
//# sourceMappingURL=tool-catalog.js.map