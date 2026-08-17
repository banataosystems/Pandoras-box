"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availableTools = availableTools;
exports.executeStdioTool = executeStdioTool;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const index_js_2 = require("./tools/index.js");
const service_config_js_1 = require("./runtime/service-config.js");
const tool_policy_js_1 = require("./runtime/tool-policy.js");
const server = new index_js_1.Server({
    name: 'mcpmaster',
    version: '1.2.0-control-ledger',
}, {
    capabilities: { tools: {} },
});
function isReadOnlyTool(name) {
    return (0, tool_policy_js_1.classifyToolRisk)(name) === 'read';
}
function availableTools() {
    return Object.entries(index_js_2.toolRegistry)
        .filter(([name]) => isReadOnlyTool(name))
        .map(([name, metadata]) => ({
        name,
        description: `${metadata.description} [risk: ${(0, tool_policy_js_1.classifyToolRisk)(name)}]`,
        inputSchema: metadata.inputSchema,
    }));
}
async function executeStdioTool(name, args, dependencies = {}) {
    const entry = index_js_2.toolRegistry[name];
    if (!entry) {
        return {
            isError: true,
            content: [{ type: 'text', text: new service_config_js_1.UnknownToolError(name).message }],
        };
    }
    const risk = (0, tool_policy_js_1.classifyToolRisk)(name);
    if (!isReadOnlyTool(name)) {
        return {
            isError: true,
            content: [{
                    type: 'text',
                    text: `Tool ${name} is ${risk} and is unavailable in read-only stdio mode. Use the governed durable plan, approval, and execute workflow for mutations.`,
                }],
        };
    }
    const buildConfiguration = dependencies.buildConfiguration ?? service_config_js_1.buildToolConfiguration;
    const execute = dependencies.execute ?? index_js_2.executeTool;
    try {
        const configuration = await buildConfiguration(name);
        const result = await execute(name, args || {}, configuration);
        return {
            content: [{ type: 'text', text: JSON.stringify({ tool: name, risk, result }, null, 2) }],
        };
    }
    catch (error) {
        return {
            isError: true,
            content: [{ type: 'text', text: error instanceof Error ? error.message : 'Unknown error' }],
        };
    }
}
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: availableTools() }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return executeStdioTool(name, args);
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('MCPMaster stdio runtime ready (read-only)');
}
if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
//# sourceMappingURL=mcp-stdio.js.map
