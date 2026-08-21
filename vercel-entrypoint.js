"use strict";

const express = require("express");
const { createProjectOsContainerApp } = require("./src/projectos-container-server.js");
const { handleProjectOsMcp } = require("./src/projectos-mcp-handler.js");
const { wrapMcpResultContract } = require("./src/runtime/mcp-result-contract.js");

const normalizedProjectOsMcp = wrapMcpResultContract(handleProjectOsMcp);

function createVercelEntrypoint() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Vercel may apply the public rewrites before invoking a root server. Support
  // both the public and rewritten MCP paths so the existing serverless handler
  // remains the only implementation of the OAuth and JSON-RPC contract.
  app.all(["/mcp", "/api/mcp"], normalizedProjectOsMcp);
  app.all(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ],
    normalizedProjectOsMcp,
  );

  // Reuse the container app for health, operator, consent, and static routes.
  // It is an Express request listener, so Vercel receives a callable default
  // server export instead of the side-effect-only dist/http-server build.
  app.use(createProjectOsContainerApp());
  return app;
}

const app = createVercelEntrypoint();

module.exports = app;
module.exports.createVercelEntrypoint = createVercelEntrypoint;
