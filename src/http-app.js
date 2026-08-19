"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpApp = createHttpApp;
exports.startHttpServer = startHttpServer;

const express = require("express");
const core = require("./http-app-core.js");
const { executeTool } = require("./tools/index.js");
const { buildToolConfiguration } = require("./runtime/service-config.js");
const { ExecutionLedgerClient } = require("./runtime/execution-ledger-client.js");
const {
  createProviderExecutionStateMachine,
} = require("./runtime/provider-execution-state-machine.js");
const { executionPayloadHash } = require("./runtime/execution-payload.js");

exports.executionPayloadHash = executionPayloadHash;

function defaultToolExecutor(tool, args, context) {
  return executeTool(tool, args, buildToolConfiguration(tool, context));
}

function createHttpApp(
  config,
  runtimeSecurityResolver,
  executionLedger,
  runtimeRateLimiter,
  connectionMetadataProvider,
  toolExecutor,
) {
  const ledger = executionLedger || new ExecutionLedgerClient();
  const stateMachine = createProviderExecutionStateMachine({
    execute: toolExecutor || defaultToolExecutor,
    ledger,
  });
  const coreApp = core.createHttpApp(
    config,
    runtimeSecurityResolver,
    stateMachine.ledger,
    runtimeRateLimiter,
    connectionMetadataProvider,
    stateMachine.execute,
  );
  const app = express();

  app.use((request, response, next) => {
    stateMachine.run(() => {
      const requestState = stateMachine.currentState();
      const originalJson = response.json.bind(response);
      response.json = function governedJson(value) {
        let prepared;
        try {
          prepared = stateMachine.preparePresentation(value, "http_response_shaping_failed");
        } catch (error) {
          stateMachine.recordResponseFailure(
            error,
            "http_response_shaping_failed",
            requestState?.execution?.durablePlanId,
          );
          throw error;
        }
        try {
          return originalJson(prepared);
        } catch (error) {
          stateMachine.recordResponseFailure(
            error,
            "http_response_delivery_failed",
            requestState?.execution?.durablePlanId,
          );
          throw error;
        }
      };

      response.once("close", () => {
        if (response.writableEnded) return;
        stateMachine.recordResponseFailureForState(
          requestState,
          new Error("HTTP connection closed before response completion"),
          "http_connection_closed",
          requestState?.execution?.durablePlanId,
        );
      });
      next();
    });
  });
  app.use(coreApp);
  return app;
}

function startHttpServer() {
  const app = createHttpApp();
  const configuredPort = Number.parseInt(process.env.PORT || "3000", 10);
  const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
    ? configuredPort
    : 3000;
  const server = app.listen(port, () => {
    console.log(`MCPMaster secure HTTP runtime listening on port ${port}`);
  });
  const shutdown = (signal) => {
    console.log(`Received ${signal}; shutting down.`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  return server;
}
