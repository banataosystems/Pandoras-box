"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.projectOsMcpVercelConfig = void 0;
exports.createProjectOsMcpHandler = createProjectOsMcpHandler;
exports.handleProjectOsMcp = handleProjectOsMcp;

const core = require("./projectos-mcp-handler-core.js");
const { ExecutionLedgerClient } = require("./runtime/execution-ledger-client.js");
const {
  createProviderExecutionStateMachine,
} = require("./runtime/provider-execution-state-machine.js");
const { executeTool } = require("./tools/index.js");

exports.projectOsMcpVercelConfig = core.projectOsMcpVercelConfig;

function createProjectOsMcpHandler(overrides = {}) {
  const stateMachine = createProviderExecutionStateMachine({
    execute: overrides.execute || executeTool,
    ledger: overrides.ledger || new ExecutionLedgerClient(),
  });
  const handler = core.createProjectOsMcpHandler({
    ...overrides,
    execute: stateMachine.execute,
    ledger: stateMachine.ledger,
  });
  return function projectOsMcpHandler(request, response) {
    return stateMachine.run(() => handler(request, response));
  };
}

let defaultHandler;

async function handleProjectOsMcp(request, response) {
  if (!defaultHandler) defaultHandler = createProjectOsMcpHandler();
  return defaultHandler(request, response);
}
