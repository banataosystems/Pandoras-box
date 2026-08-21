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
    return stateMachine.run(() => {
      const requestState = stateMachine.currentState();
      const originalJson = response.json.bind(response);
      response.json = function governedJson(value) {
        let prepared;
        try {
          prepared = stateMachine.preparePresentation(value, "mcp_response_shaping_failed");
        } catch (error) {
          stateMachine.recordResponseFailure(
            error,
            "mcp_response_shaping_failed",
            requestState?.execution?.durablePlanId,
          );
          throw error;
        }
        try {
          return originalJson(prepared);
        } catch (error) {
          stateMachine.recordResponseFailure(
            error,
            "mcp_response_delivery_failed",
            requestState?.execution?.durablePlanId,
          );
          throw error;
        }
      };

      if (typeof response.once === "function") {
        response.once("close", () => {
          if (response.writableEnded || response.ended) return;
          stateMachine.recordResponseFailureForState(
            requestState,
            new Error("MCP connection closed before response completion"),
            "mcp_connection_closed",
            requestState?.execution?.durablePlanId,
          );
        });
      }
      return handler(request, response);
    });
  };
}

let defaultHandler;

async function handleProjectOsMcp(request, response) {
  if (!defaultHandler) defaultHandler = createProjectOsMcpHandler();
  return defaultHandler(request, response);
}
