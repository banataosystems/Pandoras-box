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

function safeOuterError(error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;
  const failure = error?.failure && typeof error.failure === "object" && !Array.isArray(error.failure)
    ? error.failure
    : null;
  let message = "An internal ProjectOS error occurred.";
  let code = "INTERNAL_ERROR";
  if (failure) {
    try {
      const serialized = JSON.stringify(failure);
      if (Buffer.byteLength(serialized, "utf8") <= 1000) {
        message = serialized;
        code = typeof failure.safeErrorCode === "string"
          ? failure.safeErrorCode
          : "provider_execution_failed";
      }
    } catch {
      // Keep the generic bounded envelope.
    }
  }
  return {
    status,
    payload: {
      ok: false,
      error: { code, message },
    },
  };
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

  // The historical app contains its own error middleware. This parent boundary
  // is deliberately last: it catches only an error that escapes or is thrown
  // while the inner error response itself is being shaped/delivered.
  app.use((error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const safe = safeOuterError(error);
    let payload;
    try {
      payload = stateMachine.preparePresentation(
        safe.payload,
        "http_terminal_error_shaping_failed",
      );
    } catch {
      payload = {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal ProjectOS error occurred.",
        },
      };
    }
    response.statusCode = safe.status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(payload));
  });

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
