"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMcpResultPayload = normalizeMcpResultPayload;
exports.wrapMcpResultContract = wrapMcpResultContract;

function normalizeStructuredContent(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : { result: value };
}

function normalizeMcpResultPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const result = payload.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return payload;
  if (!Object.prototype.hasOwnProperty.call(result, "structuredContent")) return payload;

  const structuredContent = normalizeStructuredContent(result.structuredContent);
  if (structuredContent === result.structuredContent) return payload;
  return {
    ...payload,
    result: {
      ...result,
      structuredContent,
    },
  };
}

function wrapMcpResultContract(handler) {
  if (typeof handler !== "function") throw new TypeError("MCP handler must be a function");
  return async function mcpResultContractHandler(request, response) {
    if (!response || typeof response.json !== "function") return handler(request, response);
    const originalJson = response.json;
    response.json = function normalizedJson(payload) {
      return originalJson.call(this, normalizeMcpResultPayload(payload));
    };
    try {
      return await handler(request, response);
    } finally {
      response.json = originalJson;
    }
  };
}
