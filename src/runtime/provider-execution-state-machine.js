"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderExecutionOutcomeError = void 0;
exports.createProviderExecutionStateMachine = createProviderExecutionStateMachine;
exports.markProviderOutcome = markProviderOutcome;
exports.prepareProviderResult = prepareProviderResult;
exports.prepareToolPresentation = prepareToolPresentation;

const { AsyncLocalStorage } = require("node:async_hooks");
const { createHash } = require("node:crypto");
const { executionPayloadHash } = require("./execution-payload.js");

const PROVIDER_LIMITS = Object.freeze({
  maxBytes: 448 * 1024,
  maxArrayItems: 400,
  maxObjectKeys: 400,
  maxDepth: 16,
  maxNodes: 16_000,
  maxStringChars: 240 * 1024,
});
const PRESENTATION_LIMITS = Object.freeze({
  maxBytes: 512 * 1024,
  maxArrayItems: 500,
  maxObjectKeys: 500,
  maxDepth: 20,
  maxNodes: 20_000,
  maxStringChars: 256 * 1024,
});
const MAX_SAFE_AUDIT_ERROR_BYTES = 1000;
const PROVIDER_OUTCOMES = new Set([
  "not_executed",
  "failed_before_side_effects",
  "ambiguous",
  "succeeded",
]);
const PROVIDER_IDEMPOTENCY_TOOLS = new Set([
  "memory.submitEvidenceCandidate",
]);
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeToken(value, fallback) {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : fallback;
}

function safeCorrelationId(value) {
  return typeof value === "string" && SAFE_CORRELATION_ID.test(value) ? value : null;
}

function safeUuid(value) {
  return typeof value === "string" && SAFE_UUID.test(value) ? value : null;
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
  const idempotencyValue = [args?.idempotencyKey, args?.idempotency_key]
    .find((value) => typeof value === "string" && value.trim().length > 0);
  const providerIdempotencySupported = PROVIDER_IDEMPOTENCY_TOOLS.has(tool)
    && typeof idempotencyValue === "string";
  return Object.freeze({
    tool,
    payloadHash: executionPayloadHash(tool, args),
    providerIdempotencySupported,
    idempotencyIdentityHash: providerIdempotencySupported
      ? identityHash(idempotencyValue.trim())
      : null,
  });
}

function resultContractFailure(category, phase) {
  return Object.assign(
    new Error("Provider response contract is invalid or exceeds bounded ProjectOS limits"),
    {
      name: "ProviderResultContractError",
      status: 502,
      code: "provider_response_contract_error",
      category,
      phase,
    },
  );
}

function cloneJsonValue(value, state, depth, limits, phase) {
  if (depth > limits.maxDepth) throw resultContractFailure("depth", phase);
  state.nodes += 1;
  if (state.nodes > limits.maxNodes) throw resultContractFailure("nodes", phase);

  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > limits.maxStringChars) throw resultContractFailure("string", phase);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw resultContractFailure("serialization", phase);
    return value;
  }
  if (!value || typeof value !== "object") throw resultContractFailure("serialization", phase);
  if (state.active.has(value)) throw resultContractFailure("cycle", phase);

  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > limits.maxArrayItems) throw resultContractFailure("array_items", phase);
      const ownKeys = Reflect.ownKeys(value);
      const expectedKeys = new Set([
        "length",
        ...Array.from({ length: value.length }, (_, index) => String(index)),
      ]);
      if (ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))) {
        throw resultContractFailure("array_shape", phase);
      }
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
          throw resultContractFailure("array_shape", phase);
        }
        output.push(cloneJsonValue(descriptor.value, state, depth + 1, limits, phase));
      }
      return output;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw resultContractFailure("object_prototype", phase);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      throw resultContractFailure("object_shape", phase);
    }
    if (ownKeys.length > limits.maxObjectKeys) {
      throw resultContractFailure("object_keys", phase);
    }

    const output = {};
    for (const key of ownKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
        throw resultContractFailure("object_shape", phase);
      }
      output[key] = cloneJsonValue(descriptor.value, state, depth + 1, limits, phase);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

function boundedClone(value, limits, phase) {
  const clone = cloneJsonValue(value, { nodes: 0, active: new Set() }, 0, limits, phase);
  let text;
  try {
    text = JSON.stringify(clone);
  } catch {
    throw resultContractFailure("serialization", phase);
  }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > limits.maxBytes) {
    throw resultContractFailure("bytes", phase);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw resultContractFailure("serialization", phase);
  }
}

function prepareProviderResult(value) {
  return boundedClone(value, PROVIDER_LIMITS, "provider_result");
}

function prepareToolPresentation(value) {
  return boundedClone(value, PRESENTATION_LIMITS, "tool_presentation");
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

function mutationState(providerOutcome, downstreamProcessingOutcome) {
  if (providerOutcome === "not_executed") return "DEFINITELY_NOT_DISPATCHED";
  if (providerOutcome === "failed_before_side_effects") {
    return "PROVIDER_REJECTED_WITH_NO_SIDE_EFFECT";
  }
  if (providerOutcome === "ambiguous") return "OUTCOME_AMBIGUOUS_AFTER_DISPATCH";
  if (downstreamProcessingOutcome && downstreamProcessingOutcome !== "succeeded") {
    return "PROVIDER_SUCCEEDED_LOCAL_FINALIZATION_FAILED";
  }
  return "PROVIDER_SUCCEEDED";
}

function retryContract(providerOutcome, providerIdempotencySupported, retryable) {
  if (providerOutcome === "ambiguous") {
    return providerIdempotencySupported
      ? "reconcile_then_same_immutable_provider_identity_only"
      : "reconcile_before_retry";
  }
  if (providerOutcome === "succeeded") return "do_not_repeat_provider_mutation";
  return retryable ? "normal_retry_policy" : "not_retryable";
}

class ProviderExecutionOutcomeError extends Error {
  constructor(input) {
    const providerOutcome = PROVIDER_OUTCOMES.has(input.providerOutcome)
      ? input.providerOutcome
      : "ambiguous";
    const downstreamProcessingOutcome = safeToken(
      input.downstreamProcessingOutcome,
      "not_started",
    );
    const providerIdempotencySupported = input.identity?.providerIdempotencySupported === true;
    let retryable = input.retryable === true;
    if (providerOutcome === "ambiguous") {
      retryable = retryable && providerIdempotencySupported;
    } else if (providerOutcome === "succeeded") {
      retryable = false;
    }
    const failure = Object.freeze({
      schemaVersion: "1.1.0",
      safeErrorCode: safeToken(input.safeErrorCode, "provider_execution_outcome_ambiguous"),
      summary: input.summary || "Provider execution requires reconciliation before any repeat",
      providerOutcome,
      mutationState: mutationState(providerOutcome, downstreamProcessingOutcome),
      downstreamProcessingOutcome,
      validationCategory: safeToken(input.validationCategory, "provider_execution"),
      retryable,
      automaticRetryAllowed: false,
      retryContract: retryContract(
        providerOutcome,
        providerIdempotencySupported,
        retryable,
      ),
      reconciliationRequired: input.reconciliationRequired === true,
      providerIdempotencySupported,
      payloadHash: input.identity?.payloadHash || null,
      idempotencyIdentityHash: input.identity?.idempotencyIdentityHash || null,
      planId: safeUuid(input.planId),
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

function markProviderOutcome(error, providerOutcome, evidence = "provider_contract") {
  if (!error || typeof error !== "object" || !PROVIDER_OUTCOMES.has(providerOutcome)) {
    return error;
  }
  if (!PROVIDER_OUTCOMES.has(error.providerOutcome)) {
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
  }
  if (typeof error.providerOutcomeEvidence !== "string") {
    try {
      Object.defineProperty(error, "providerOutcomeEvidence", {
        value: safeToken(evidence, "provider_contract"),
        enumerable: false,
        configurable: false,
        writable: false,
      });
    } catch {
      // Outcome remains usable even if an evidence label cannot be attached.
    }
  }
  return error;
}

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

function normalizedProviderError(error, identity) {
  if (error instanceof ProviderExecutionOutcomeError) return error;
  const failure = error?.failure && typeof error.failure === "object" ? error.failure : {};
  const status = Number.isInteger(error?.status)
    ? error.status
    : Number.isInteger(failure.httpStatus) ? failure.httpStatus : 503;
  const originalCode = safeToken(error?.code ?? failure.safeErrorCode, "provider_execution_failed");
  const originalCategory = safeToken(failure.validationCategory, "provider_execution");
  const providerOutcome = explicitOutcome(error) || "ambiguous";
  let retryable = error?.retryable === true || failure.retryable === true;
  if (providerOutcome === "ambiguous") {
    retryable = identity.providerIdempotencySupported;
  } else if (providerOutcome === "succeeded") {
    retryable = false;
  }
  const reconciliationRequired = providerOutcome === "ambiguous" || providerOutcome === "succeeded";

  if (!reconciliationRequired && preservableStructuredFailure(error)) {
    return markProviderOutcome(error, providerOutcome, error.providerOutcomeEvidence);
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
      ? "Provider execution outcome requires reconciliation before any repeat"
      : "Provider contract proves the mutation did not create an external side effect",
  });
}

function localPostSuccessError(contractError, identity, phase, code = "provider_response_contract_error") {
  return new ProviderExecutionOutcomeError({
    providerOutcome: "succeeded",
    downstreamProcessingOutcome: safeToken(phase, "local_processing_failed"),
    safeErrorCode: code,
    validationCategory: safeToken(contractError?.category, "response_contract"),
    retryable: false,
    reconciliationRequired: true,
    status: 502,
    identity,
    summary: "Provider mutation succeeded but local result processing or response construction failed",
  });
}

function finalizationAmbiguity(execution, planId) {
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
    summary: "Provider outcome is known or ambiguous but durable local completion requires reconciliation",
  });
}

function sanitizedMemorySummary(summary) {
  return {
    type: "memory_evidence_candidate",
    candidateId: safeUuid(summary.candidateId),
    reviewItemId: safeUuid(summary.reviewItemId),
    status: safeToken(summary.status, "pending_review"),
    deduplicated: summary.deduplicated === true,
    namespace: safeToken(summary.namespace, null),
    projectId: safeUuid(summary.projectId),
    projectKey: safeToken(summary.projectKey, null),
    proofStage: safeToken(summary.proofStage, null),
    privacyScanVersion: safeToken(summary.privacyScanVersion, null),
  };
}

function sanitizedGenericSummary(summary) {
  const type = safeToken(summary?.type, "object");
  const keys = Array.isArray(summary?.keys)
    ? summary.keys.filter((value) => typeof value === "string" && value.length <= 80).slice(0, 50)
    : undefined;
  return {
    type,
    ...(Number.isInteger(summary?.length) && summary.length >= 0
      ? { length: Math.min(summary.length, 1_000_000) }
      : {}),
    ...(Number.isInteger(summary?.keyCount) && summary.keyCount >= 0
      ? { keyCount: Math.min(summary.keyCount, 1_000_000) }
      : {}),
    ...(keys ? { keys } : {}),
  };
}

function sanitizedResultSummary(input, execution) {
  const source = input?.resultSummary && typeof input.resultSummary === "object"
    ? input.resultSummary
    : {};
  const summary = source.type === "memory_evidence_candidate"
    ? sanitizedMemorySummary(source)
    : sanitizedGenericSummary(source);
  return prepareToolPresentation({
    ...summary,
    providerOutcome: "succeeded",
    mutationState: "PROVIDER_SUCCEEDED",
    downstreamProcessingOutcome: "succeeded",
    retryable: false,
    retryContract: "do_not_repeat_provider_mutation",
    reconciliationRequired: false,
    providerIdempotencySupported: execution.identity.providerIdempotencySupported,
    payloadHash: execution.identity.payloadHash,
    idempotencyIdentityHash: execution.identity.idempotencyIdentityHash,
    responseDelivery: "not_required_for_provider_outcome_truth",
    evidencePolicy: "privacy_safe_summary_only_v2",
  });
}

function reconciliationSummary(execution, failure) {
  const providerOutcome = execution.providerOutcome;
  const downstreamProcessingOutcome = safeToken(
    failure?.downstreamProcessingOutcome,
    providerOutcome === "succeeded" ? "local_processing_failed" : "not_started",
  );
  const retryable = failure?.retryable === true && execution.identity.providerIdempotencySupported;
  return prepareToolPresentation({
    type: "provider_execution_reconciliation",
    schemaVersion: "1.1.0",
    providerOutcome,
    mutationState: mutationState(providerOutcome, downstreamProcessingOutcome),
    downstreamProcessingOutcome,
    safeErrorCode: safeToken(failure?.safeErrorCode, "provider_execution_outcome_ambiguous"),
    retryable,
    automaticRetryAllowed: false,
    retryContract: retryContract(
      providerOutcome,
      execution.identity.providerIdempotencySupported,
      retryable,
    ),
    reconciliationRequired: true,
    providerIdempotencySupported: execution.identity.providerIdempotencySupported,
    payloadHash: execution.identity.payloadHash,
    idempotencyIdentityHash: execution.identity.idempotencyIdentityHash,
    ...safeProviderMetadata(failure),
    evidencePolicy: "privacy_safe_summary_only_v2",
  });
}

function emitReconciliationEvent(execution, phase, planId) {
  const event = {
    event: "provider_execution_reconciliation_required",
    phase: safeToken(phase, "local_processing_failed"),
    planId: safeUuid(planId),
    providerOutcome: execution.providerOutcome,
    mutationState: mutationState(execution.providerOutcome, phase),
    payloadHash: execution.identity.payloadHash,
    idempotencyIdentityHash: execution.identity.idempotencyIdentityHash,
    providerIdempotencySupported: execution.identity.providerIdempotencySupported,
    evidencePolicy: "privacy_safe_summary_only_v2",
  };
  try {
    console.error(JSON.stringify(event));
  } catch {
    // Do not let logging affect provider-outcome truth.
  }
}

function createProviderExecutionStateMachine(options) {
  if (!options || typeof options.execute !== "function" || !options.ledger) {
    throw new TypeError("Provider execution state machine requires execute and ledger dependencies");
  }
  const storage = new AsyncLocalStorage();
  const rawExecute = options.execute;
  const rawLedger = options.ledger;

  function currentState() {
    return storage.getStore();
  }

  function ensureExecutionFailure(phase, code) {
    const state = currentState();
    const execution = state?.execution;
    if (!execution || !["succeeded", "ambiguous"].includes(execution.providerOutcome)) return null;
    if (execution.error instanceof ProviderExecutionOutcomeError) return execution.error;
    const failure = execution.providerOutcome === "succeeded"
      ? localPostSuccessError(null, execution.identity, phase, code)
      : new ProviderExecutionOutcomeError({
        providerOutcome: "ambiguous",
        downstreamProcessingOutcome: safeToken(phase, "local_processing_failed"),
        safeErrorCode: code || "provider_execution_outcome_ambiguous",
        validationCategory: "local_processing",
        retryable: execution.identity.providerIdempotencySupported,
        reconciliationRequired: true,
        status: 503,
        identity: execution.identity,
        summary: "Provider dispatch may have occurred and local processing failed; reconciliation is required",
      });
    execution.error = failure;
    return failure;
  }

  async function execute(tool, args, configuration) {
    const identity = operationIdentity(tool, args);
    const state = currentState();
    try {
      const rawResult = await rawExecute(tool, args, configuration);
      const execution = {
        providerOutcome: "succeeded",
        identity,
        error: null,
        durableFinalized: false,
      };
      if (state) state.execution = execution;
      try {
        return prepareProviderResult(rawResult);
      } catch (error) {
        const guarded = localPostSuccessError(
          error,
          identity,
          "provider_result_processing_failed",
          "provider_response_contract_error",
        );
        execution.error = guarded;
        throw guarded;
      }
    } catch (error) {
      const guarded = normalizedProviderError(error, identity);
      if (state && !state.execution) {
        state.execution = {
          providerOutcome: explicitOutcome(guarded) || "ambiguous",
          identity,
          error: guarded,
          durableFinalized: false,
        };
      }
      throw guarded;
    }
  }

  function preparePresentation(value, phase = "response_shaping_failed") {
    try {
      return prepareToolPresentation(value);
    } catch (error) {
      const guarded = ensureExecutionFailure(phase, "response_contract_error");
      throw guarded || error;
    }
  }

  function recordResponseFailureForState(state, error, phase = "response_delivery_failed", planId) {
    const execution = state?.execution;
    if (!execution || !["succeeded", "ambiguous"].includes(execution.providerOutcome)) return;
    let guarded = execution.error;
    if (!(guarded instanceof ProviderExecutionOutcomeError)) {
      guarded = execution.providerOutcome === "succeeded"
        ? localPostSuccessError(null, execution.identity, phase, "response_delivery_failed")
        : new ProviderExecutionOutcomeError({
          providerOutcome: "ambiguous",
          downstreamProcessingOutcome: safeToken(phase, "response_delivery_failed"),
          safeErrorCode: "response_delivery_failed",
          validationCategory: "response_delivery",
          retryable: execution.identity.providerIdempotencySupported,
          reconciliationRequired: true,
          status: 503,
          identity: execution.identity,
          summary: "Provider dispatch may have occurred but response delivery failed; reconciliation is required",
        });
      execution.error = guarded;
    }
    emitReconciliationEvent(execution, phase, planId);
    if (error && typeof error === "object" && !error.cause) {
      try {
        Object.defineProperty(error, "cause", {
          value: guarded,
          enumerable: false,
          configurable: false,
        });
      } catch {
        // Preserve the original response error if it is not extensible.
      }
    }
  }

  function recordResponseFailure(error, phase = "response_delivery_failed", planId) {
    return recordResponseFailureForState(currentState(), error, phase, planId);
  }

  const ledger = new Proxy(rawLedger, {
    get(target, property, receiver) {
      if (property !== "finishPlan") {
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async function guardedFinishPlan(token, input) {
        const state = currentState();
        const execution = state?.execution;
        if (!execution) return target.finishPlan(token, input);

        if (input.status === "completed") {
          try {
            const finalized = await target.finishPlan(token, {
              ...input,
              resultSummary: sanitizedResultSummary(input, execution),
            });
            execution.durableFinalized = true;
            execution.durablePlanId = input.planId;
            return finalized;
          } catch {
            const guarded = finalizationAmbiguity(execution, input.planId);
            execution.error = guarded;
            emitReconciliationEvent(execution, "durable_completion_unknown", input.planId);
            throw guarded;
          }
        }

        if (
          input.status === "failed"
          && (execution.providerOutcome === "succeeded" || execution.providerOutcome === "ambiguous")
        ) {
          const guarded = execution.error
            || ensureExecutionFailure("local_processing_failed", "post_provider_local_failure")
            || normalizedProviderError(null, execution.identity);

          if (execution.durableFinalized) {
            emitReconciliationEvent(execution, "response_delivery_failed", input.planId);
            throw guarded;
          }

          try {
            const finalized = await target.finishPlan(token, {
              planId: input.planId,
              status: "completed",
              durationMs: input.durationMs,
              resultSummary: reconciliationSummary(execution, guarded.failure),
            });
            if (!finalized || finalized.planId !== input.planId || finalized.status !== "completed") {
              throw new Error("reconciliation completion did not bind to the claimed plan");
            }
            execution.durableFinalized = true;
            execution.durablePlanId = input.planId;
          } catch {
            const ambiguity = finalizationAmbiguity(execution, input.planId);
            execution.error = ambiguity;
            emitReconciliationEvent(execution, "durable_completion_unknown", input.planId);
            throw ambiguity;
          }
          throw guarded;
        }

        return target.finishPlan(token, input);
      };
    },
  });

  return Object.freeze({
    execute,
    ledger,
    preparePresentation,
    recordResponseFailure,
    recordResponseFailureForState,
    currentState,
    run(operation) {
      return storage.run({ execution: null }, operation);
    },
  });
}
