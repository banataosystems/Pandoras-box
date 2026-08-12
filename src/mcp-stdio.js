"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const index_js_2 = require("./tools/index.js");
const service_config_js_1 = require("./runtime/service-config.js");
const tool_policy_js_1 = require("./runtime/tool-policy.js");
const allowWrites = process.env.MCP_ALLOW_WRITES === 'true';
const server = new index_js_1.Server({
    name: 'mcpmaster',
    version: '1.2.0-control-ledger',
}, {
    capabilities: { tools: {} },
});
function availableTools() {
    return Object.entries(index_js_2.toolRegistry)
        .filter(([name]) => allowWrites || (0, tool_policy_js_1.classifyToolRisk)(name) === 'read')
        .map(([name, metadata]) => ({
        name,
        description: `${metadata.description} [risk: ${(0, tool_policy_js_1.classifyToolRisk)(name)}]`,
        inputSchema: metadata.inputSchema,
    }));
}
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: availableTools() }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const entry = index_js_2.toolRegistry[name];
    if (!entry) {
        return {
            isError: true,
            content: [{ type: 'text', text: new service_config_js_1.UnknownToolError(name).message }],
        };
    }
    const risk = (0, tool_policy_js_1.classifyToolRisk)(name);
    if (risk !== 'read' && !allowWrites) {
        return {
            isError: true,
            content: [{
                    type: 'text',
                    text: `Tool ${name} is ${risk} and is disabled in stdio mode. Set MCP_ALLOW_WRITES=true only in a trusted local environment.`,
                }],
        };
    }
    try {
        const configuration = await (0, service_config_js_1.buildToolConfiguration)(name);
        const result = await (0, index_js_2.executeTool)(name, args || {}, configuration);
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
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error(`MCPMaster stdio runtime ready (${allowWrites ? 'writes enabled' : 'read-only'})`);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=mcp-stdio.js.map