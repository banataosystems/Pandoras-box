"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const container_runtime_js_1 = require("./container-runtime.js");
const projectos_container_server_js_1 = require("./projectos-container-server.js");
async function main() {
    const mode = (0, container_runtime_js_1.resolveContainerRuntimeMode)();
    console.log(`Starting MCPMaster container in ${mode} mode`);
    if (mode === 'meta-remote') {
        require('../apps/meta-business-mcp/dist/remote-server.js');
        return;
    }
    (0, projectos_container_server_js_1.startProjectOsContainerServer)();
}
void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Container startup failed');
    process.exitCode = 1;
});
//# sourceMappingURL=container-entrypoint.js.map