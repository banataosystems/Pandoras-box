"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderExecutionOutcomeError = void 0;
exports.createProviderExecutionStateMachine = createProviderExecutionStateMachine;
exports.prepareProviderResult = prepareProviderResult;

const { AsyncLocalStorage } = require("node:async_hooks");
const { createHash } = require("node:crypto");
const { executionPayloadHash } = require("../http-app.js");

const MAX_TOOL_RESULT_BYTES = 512 * 1024;
const MAX_TOOL_RESULT_ARRAY_ITEMS = 500;
const MAX_TOOL_RESULT_OBJECT_KEYS = 500;
const MAX_TOOL_RESULT_DEPTH = 20;
const MAX_TOOL_RESULT_NODES = 20_000;
const MAX_TOOL_RESULT_STRING_CHARS = 256 * 1024;
const MAX_SAFE_AUDIT_ERROR_BYTES = 1000;
const PROVIDER_OUTCOMES = new Set([
  "not_executed",
  "failed_before_side_effects",
  "ambiguous",
  "succeeded",
]);
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function safeToken(value, fallback) {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : fallback;
}

function safeCorrelationId(value) {
  return typeof value === "string" && SAFE_CORRELATION_ID.test(value) ? value : null;
}

function finiteStatus(value, fallback) {
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : fallback;
}

function safeHttpStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function safeRetryAfterMs(value) {
  return Number.isInteger(value) && value >= 0 && value <= 86_400_000 ? value : null;
}

function identityHash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function operationIdentity(tool, args) {
  const idempotencyValue = [
    args?.idempotencyKey,
    args?.idempotency_key,
    args?.requestId,
    args?.request_id,
  ].find((value) => typeof value === "string" && value.trim().length > 0);
  return Object.freeze({
    tool,
    payloadHash: executionPayloadHash(tool, args),
    providerIdempotencySupported: typeof idempotencyValue === "string",
    idempotencyIdentityHash: typeof idempotencyValue === "string"
      ? identityHash(idempotencyValue.trim())
      : null,
  });
}

function resultContractFailure(category) {
  return Object.assign(new Error("Provider response contract is invalid or exceeds bounded MCP limits"), {
    name: "ProviderResultContractError",
    code: "provider_result_contract_error",
    category,
  });
}

function cloneJsonValue(value, state, depth) {
  if (depth > MAX_TOOL_RESULT_DEPTH) throw resultContractFailure("validation");
  state.nodes += 1;
  if (state.nodes > MAX_TOOL_RESULT_NODES) throw resultContractFailure("validation");

  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_TOOL_RESULT_STRING_CHARS) throw resultContractFailure("validation");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw resultContractFailure("serialization");
    return value;
  }
  if (!value || typeof value !== "object") throw resultContractFailure("serialization");
  if (state.active.has(value)) throw resultContractFailure("serialization");

  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_TOOL_RESULT_ARRAY_ITEMS) throw resultContractFailure("validation");
      const ownKeys = Reflect.ownKeys(value);
      const expectedKeys = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
      if (ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))) {
        throw resultContractFailure("validation");
      }
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
          throw resultContractFailure("validation");
        }
        output.push(cloneJsonValue(descriptor.value, state, depth + 1));
      }
      return output;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw resultContractFailure("validation");
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) throw resultContractFailure("validation");
    if (ownKeys.length > MAX_TOOL_RESULT_OBJECT_KEYS) throw resultContractFailure("validation");

    const output = {};
    for (const key of ownKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
        throw resultContractFailure("validation");
      }
      output[key] = cloneJsonValue(descriptor.value, state, depth + 1);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

function prepareProviderResult(value) {
  const clone = cloneJsonValue(value, { nodes: 0, active: new Set() }, 0);
  let text;
  try {
    text = JSON.stringify(clone);
  } catch {
    throw resultContractFailure("serialization");
  }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_TOOL_RESULT_BYTES) {
    throw resultContractFailure("serialization");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw resultContractFailure("serialization");
  }
}

function safeProviderMetadata(failure) {
  if (!failure || typeof failure !== "object" || Array.isArray(failure)) return {};
  const provider = safeToken(failure.provider, null);
  const operation = safeToken(failure.operation, null);
  const correlationId = safeCorrelationId(failure.correlationId);
  const privacyScanVersion = safeToken(failure.privacyScanVersion, null);
  const httpStatus = safeHttpStatus(failure.httpStatus);
  const retryAfterMs = safeRetryAfterMs(failure.retryAfterMs);
  return {
    ...(provider ? { provider } : {}),
    ...(operation ? { operation } : {}),
    ...(httpStatus === null ? {} : { httpStatus }),
    ...(correlationId ? { correlationId } : {}),
    ...(privacyScanVersion ? { privacyScanVersion } : {}),
    ...(retryAfterMs === null ? {} : { retryAfterMs }),
  };
}

class ProviderExecutionOutcomeError extends Error {
  constructor(input) {
    const providerOutcome = PROVIDER_OUTCOMES.has(input.providerOutcome)
      ? input.providerOutcome
      : "ambiguous";
    const retryable = input.retryable === true;
    const failure = Object.freeze({
      schemaVersion: "1.0.0",
      safeErrorCode: safeToken(input.safeErrorCode, "provider_execution_outcome_ambiguous"),
      summary: input.summary || "Provider execution requires reconciliation before any retry",
      providerOutcome,
      downstreamProcessingOutcome: safeToken(input.downstreamProcessingOutcome, "not_started"),
      validationCategory: safeToken(input.validationCategory, "provider_execution"),
      retryable,
      retryContract: retryable ? "same_immutable_idempotency_identity_only" : "reconcile_before_retry",
      reconciliationRequired: input.reconciliationRequired === true,
      providerIdempotencySupported: input.identity?.providerIdempotencySupported === true,
      payloadHash: input.identity?.payloadHash || null,
      idempotencyIdentityHash: input.identity?.idempotencyIdentityHash || null,
      planId: input.planId || null,
      ...safeProviderMetadata(input.providerFailure),
      timestamp: new Date().toISOString(),
    });
    super(JSON.stringify(failure));
    this.name = "ProviderExecutionOutcomeError";
    this.status = finiteStatus(input.status, providerOutcome === "succeeded" ? 502 : 503);
    this.code = failure.safeErrorCode;
    this.providerOutcome = providerOutcome;
    this.retryable = failure.retryable;
    this.reconciliationRequired = failure.reconciliationRequired;
    this.failure = failure;
  }
}
exports.ProviderExecutionOutcomeError = ProviderExecutionOutcomeError;

function explicitOutcome(error) {
  const value = error?.providerOutcome ?? error?.failure?.providerOutcome;
  return PROVIDER_OUTCOMES.has(value) ? value : undefined;
}

function preservableStructuredFailure(error) {
  if (!error || typeof error !== "object" || !error.failure || typeof error.failure !== "object") {
    return false;
  }
  try {
    const serialized = JSON.stringify(error.failure);
    return serialized === error.message
      && Buffer.byteLength(serialized, "utf8") <= MAX_SAFE_AUDIT_ERROR_BYTES;
  } catch {
    return false;
  }
}

function annotateProviderOutcome(error, providerOutcome) {
  if (!error || typeof error !== "object" || !PROVIDER_OUTCOMES.has(providerOutcome)) return error;
  if (explicitOutcome(error)) return error;
  try {
    Object.defineProperty(error, "providerOutcome", {
      value: providerOutcome,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch {
    return error;
  }
  return error;
}

function normalizedProviderError(error, identity) {
  if (error instanceof ProviderExecutionOutcomeError) return error;
  const failure = error?.failure && typeof error.failure === "object" ? error.failure : {};
  const status = Number.isInteger(error?.status)
    ? error.status
    : Number.isInteger(failure.httpStatus) ? failure.httpStatus : 503;
  const originalCode = safeToken(error?.code ?? failure.safeErrorCode, "provider_execution_failed");
  const originalCategory = safeToken(failure.validationCategory, "provider_execution");
  let providerOutcome = explicitOutcome(error);
  let retryable = error?.retryable === true || failure.retryable === true;

  if (!providerOutcome) {
    if (
      status === 408 || status === 429 ||
      originalCode === "provider_timeout" || originalCode === "provider_rate_limited"
    ) {
      providerOutcome = "not_executed";
      retryable = true;
    } else if (status >= 400 && status < 500) {
      providerOutcome = "failed_before_side_effects";
      retryable = false;
    } else {
      providerOutcome = "ambiguous";
      retryable = identity.providerIdempotencySupported;
    }
  }

  const reconciliationRequired = providerOutcome === "ambiguous" || providerOutcome === "succeeded";
  if (reconciliationRequired && !identity.providerIdempotencySupported) retryable = false;

  if (!reconciliationRequired && preservableStructuredFailure(error)) {
    return annotateProviderOutcome(error, providerOutcome);
  }

  return new ProviderExecutionOutcomeError({
    providerOutcome,
    downstreamProcessingOutcome: providerOutcome === "succeeded" ? "failed" : "not_started",
    safeErrorCode: originalCode,
    validationCategory: originalCategory,
    retryable,
    reconciliationRequired,
    status,
    identity,
    providerFailure: failure,
    summary: reconciliationRequired
      ? "Provider execution outcome requires reconciliation before any retry"
      : "Provider execution stopped before a side effect was accepted",
  });
}

function resultProcessingError(contractError, identity) {
  return new ProviderExecutionOutcomeError({
    providerOutcome: "succeeded",
    downstreamProcessingOutcome: "failed",
    safeErrorCode: "provider_result_contract_error",
    validationCategory: safeToken(contractError?.category, "response_contract"),
    retryable: false,
    reconciliationRequired: true,
    status: 502,
    identity,
    summary: "Provider response contract is invalid after successful provider execution; reconciliation is required",
  });
}

function reconciliationSummary(execution, failure) {
  return Object.freeze({
    type: "provider_execution_reconciliation",
    schemaVersion: "1.0.0",
    providerOutcome: execution.providerOutcome,
    downstreamProcessingOutcome: failure.downstreamProcessingOutcome,
    safeErrorCode: failure.safeErrorCode,
    retryable: failure.retryable,
    retryContract: failure.retryContract,
    reconciliationRequired: true,
    providerIdempotencySupported: execution.identity.providerIdempotencySupported,
    payloadHash: execution.identity.payloadHash,
    idempotencyIdentityHash: execution.identity.idempotencyIdentityHash,
    ...safeProviderMetadata(failure),
    evidencePolicy: "privacy_safe_summary_only_v1",
  });
}

function completionSummary(input, execution) {
  return {
    ...(input.resultSummary && typeof input.resultSummary === "object" ? input.resultSummary : {}),
    providerOutcome: "succeeded",
    downstreamProcessingOutcome: "succeeded",
    retryable: false,
    reconciliationRequired: false,
    providerIdempotencySupported: execution.identity.providerIdempotencySupported,
    payloadHash: execution.identity.payloadHash,
    idempotencyIdentityHash: execution.identity.idempotencyIdentityHash,
    evidencePolicy: "privacy_safe_summary_only_v1",
  };
}

function preserveCanonicalMemorySummary(input) {
  const summary = input?.resultSummary;
  return summary?.type === "memory_evidence_candidate"
    && typeof summary.candidateId === "string"
    && typeof summary.reviewItemId === "string";
}

function finalizationAmbiguity(error, execution, planId) {
  return new ProviderExecutionOutcomeError({
    providerOutcome: execution?.providerOutcome || "ambiguous",
    downstreamProcessingOutcome: "durable_completion_unknown",
    safeErrorCode: "execution_finalization_ambiguous",
    validationCategory: "durable_ledger",
    retryable: false,
    reconciliationRequired: true,
    status: 503,
    identity: execution?.identity,
    planId,
    providerFailure: execution?.error?.failure,
    summary: "Provider outcome is known or ambiguous but durable completion requires reconciliation",
  });
}

function createProviderExecutionStateMachine(options) {
  if (!options || typeof options.execute !== "function" || !options.ledger) {
    throw new TypeError("Provider execution state machine requires execute and ledger dependencies");
  }
  const storage = new AsyncLocalStorage();
  const rawExecute = options.execute;
  const rawLedger = options.ledger;

  async function execute(tool, args, configuration) {
    const identity = operationIdentity(tool, args);
    const context = storage.getStore();
    try {
      const rawResult = await rawExecute(tool, args, configuration);
      const execution = { providerOutcome: "succeeded", identity, error: null };
      if (context) context.execution = execution;
      try {
        return prepareProviderResult(rawResult);
      } catch (error) {
        const guarded = resultProcessingError(error, identity);
        execution.error = guarded;
        throw guarded;
      }
    } catch (error) {
      const guarded = normalizedProviderError(error, identity);
      if (context && !context.execution) {
        context.execution = { providerOutcome: explicitOutcome(guarded) || "ambiguous", identity, error: guarded };
      }
      throw guarded;
    }
  }

  const ledger = new Proxy(rawLedger, {
    get(target, property, receiver) {
      if (property !== "finishPlan") {
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async function guardedFinishPlan(token, input) {
        const execution = storage.getStore()?.execution;
        if (!execution) return target.finishPlan(token, input);

        if (input.status === "completed") {
          const finalizationInput = preserveCanonicalMemorySummary(input)
            ? input
            : { ...input, resultSummary: completionSummary(input, execution) };
          try {
            return await target.finishPlan(token, finalizationInput);
          } catch (error) {
            throw finalizationAmbiguity(error, execution, input.planId);
          }
        }

        if (
          input.status === "failed" &&
          (execution.providerOutcome === "succeeded" || execution.providerOutcome === "ambiguous")
        ) {
          const failure = execution.error?.failure || normalizedProviderError(execution.error, execution.identity).failure;
          try {
            const finalized = await target.finishPlan(token, {
              planId: input.planId,
              status: "completed",
              durationMs: input.durationMs,
              resultSummary: reconciliationSummary(execution, failure),
            });
            if (!finalized || finalized.planId !== input.planId || finalized.status !== "completed") {
              throw new Error("reconciliation completion did not bind to the claimed plan");
            }
          } catch (error) {
            throw finalizationAmbiguity(error, execution, input.planId);
          }
          throw execution.error;
        }

        return target.finishPlan(token, input);
      };
    },
  });

  return Object.freeze({
    execute,
    ledger,
    run(operation) {
      return storage.run({ execution: null }, operation);
    },
  });
}
