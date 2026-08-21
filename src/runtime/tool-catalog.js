"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolRegistry = void 0;
exports.getAllTools = getAllTools;
exports.getRuntimeToolDefinition = getRuntimeToolDefinition;
exports.executeTool = executeTool;
const github_js_1 = require("../tools/github.js");
const github_project_bootstrap_js_1 = require("../tools/github-project-bootstrap.js");
const flutterflow_js_1 = require("../tools/flutterflow.js");
const memory_js_1 = require("../tools/memory.js");
const provider_api_js_1 = require("../tools/provider-api.js");
const supabase_auth_security_js_1 = require("../tools/supabase-auth-security.js");
const supabase_js_1 = require("../tools/supabase.js");
const tool_manifest_js_1 = require("./tool-manifest.js");
const result_redaction_js_1 = require("./result-redaction.js");
const source_authority_js_1 = require("./source-authority.js");
const githubDefinitions = {
    ...github_js_1.githubTools,
    ...github_project_bootstrap_js_1.githubProjectBootstrapTools,
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
const flutterFlowDefinitions = {
    ...flutterflow_js_1.flutterFlowTools,
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
const flutterFlowRegistry = buildRegistry('flutterflow', flutterFlowDefinitions);
exports.toolRegistry = Object.freeze({
    ...githubRegistry,
    ...supabaseRegistry,
    ...flutterFlowRegistry,
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
    if (definition.manifest.name === 'github.create-repository') {
        const configuredLogin = typeof configuration.login === 'string' ? configuration.login.trim() : '';
        if (!owner || !configuredLogin || owner.toLowerCase() !== configuredLogin.toLowerCase()) {
            throw new Error('GitHub repository creation is limited to the configured account login');
        }
        if (typeof configuration.registerRepository !== 'function') {
            throw new Error('GitHub repository creation requires the Pandora durable repository registrar');
        }
        if (args.startBuild === true && configuration.grantedScopes !== undefined
            && !configuration.grantedScopes.includes('issues:write')) {
            throw new Error('GitHub initial build dispatch requires issues:write before repository creation');
        }
        if (typeof args.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(args.name)) {
            throw new Error('GitHub repository name is invalid');
        }
        return;
    }
    const repo = typeof args.repo === 'string' ? args.repo : undefined;
    const allowlist = allowedRepositorySet(configuration);
    if (owner && repo) {
        const fullName = normalizedRepository(`${owner}/${repo}`);
        if (!allowlist.has(fullName)) {
            throw new Error(`GitHub account ${configuration.id} is not allowed to access ${owner}/${repo}`);
        }
        if (definition.manifest.mutation) {
            (0, source_authority_js_1.assertOperationalRepository)(`${owner}/${repo}`, 'mutate');
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
    if (definition.manifest.mutation && configuration.allowMutations !== true) {
        throw new Error('Pandora Memory mutations are disabled');
    }
    assertRequiredScopes(definition, configuration.grantedScopes);
    // All Memory tools except health are namespace-scoped. Keep this generic so
    // adding a write-capable tool cannot silently bypass namespace enforcement.
    if (definition.manifest.name !== 'memory.health') {
        const namespace = typeof args.namespace === 'string' ? args.namespace : undefined;
        if (!namespace || !configuration.allowedNamespaces.includes(namespace)) {
            throw new Error(`Pandora Memory namespace is not allowed: ${namespace || 'missing'}`);
        }
    }
}
function selectedFlutterFlowAccount(configuration, args) {
    const accountId = typeof args.accountId === 'string' ? args.accountId : undefined;
    if (!accountId)
        return undefined;
    return configuration.accounts.find((candidate) => candidate.id === accountId);
}
function assertFlutterFlowAccess(definition, args, configuration) {
    if (definition.manifest.name === 'flutterflow.list-accounts')
        return;
    const accountId = typeof args.accountId === 'string' ? args.accountId : undefined;
    if (!accountId)
        throw new Error('FlutterFlow operation requires an explicit accountId');
    const account = selectedFlutterFlowAccount(configuration, args);
    if (!account)
        throw new Error(`Unknown FlutterFlow account: ${accountId}`);
    if (account.baseUrl !== 'https://api.flutterflow.io/v2') {
        throw new Error('FlutterFlow Project API origin is not trusted');
    }
    assertRequiredScopes(definition, account.grantedScopes);
    const projectId = typeof args.projectId === 'string' ? args.projectId : undefined;
    if (projectId && !account.allowedProjectIds.includes(projectId)) {
        throw new Error(`FlutterFlow account ${account.id} is not allowed to access project ${projectId}`);
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
    const repositoryAllowed = (fullName) => (typeof fullName === 'string'
        && allowlist.has(normalizedRepository(fullName))
        && (0, source_authority_js_1.isOperationalRepository)(fullName));
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
        const result = Object.prototype.hasOwnProperty.call(github_project_bootstrap_js_1.githubProjectBootstrapTools, toolName)
            ? await (0, github_project_bootstrap_js_1.executeGitHubProjectBootstrapTool)(toolName, args, typedConfiguration)
            : Object.prototype.hasOwnProperty.call(provider_api_js_1.githubProviderApiTools, toolName)
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
    if (definition.handler === 'flutterflow') {
        const flutterFlowConfiguration = resolvedConfiguration.flutterflow;
        if (!flutterFlowConfiguration || typeof flutterFlowConfiguration !== 'object') {
            throw new Error('FlutterFlow configuration is missing');
        }
        const typedConfiguration = flutterFlowConfiguration;
        assertFlutterFlowAccess(definition, args, typedConfiguration);
        (0, tool_manifest_js_1.assertHighImpactPolicy)(toolName, args);
        return (0, result_redaction_js_1.redactSensitiveResult)(await (0, flutterflow_js_1.executeFlutterFlowTool)(toolName, args, typedConfiguration));
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