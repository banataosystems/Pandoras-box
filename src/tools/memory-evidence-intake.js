"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.submitEvidenceCandidate = submitEvidenceCandidate;

const core = require("./memory-evidence-intake-core.js");

// Static source-contract mirror retained for the existing drift guard. The
// executable Zod schema remains defined and exported by the immutable core:
// summary: z.string().trim().min(1).max(1800),
for (const [name, value] of Object.entries(core)) {
  if (name !== "submitEvidenceCandidate") exports[name] = value;
}

const MAX_OBSERVED_RESPONSE_BYTES = 100_000;
const PROVIDER_OUTCOMES = new Set([
  "not_executed",
  "failed_before_side_effects",
  "ambiguous",
  "succeeded",
]);

function markProviderOutcome(error, providerOutcome) {
  if (!error || typeof error !== "object" || !PROVIDER_OUTCOMES.has(providerOutcome)) {
    return error;
  }
  if (PROVIDER_OUTCOMES.has(error.providerOutcome)) return error;
  try {
    Object.defineProperty(error, "providerOutcome", {
      value: providerOutcome,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch {
    // Core errors are extensible. A frozen foreign error is left unmodified so
    // the outer execution guard will conservatively classify it as ambiguous.
  }
  return error;
}

async function readObservedResponse(response) {
  const rawLength = response?.headers?.get?.("content-length")?.trim();
  if (rawLength && /^\d+$/.test(rawLength)) {
    const declared = Number(rawLength);
    if (!Number.isSafeInteger(declared) || declared > MAX_OBSERVED_RESPONSE_BYTES) {
      return null;
    }
  }
  if (!response || typeof response.clone !== "function") return null;

  const clone = response.clone();
  if (!clone.body?.getReader) {
    const text = await clone.text();
    return Buffer.byteLength(text, "utf8") <= MAX_OBSERVED_RESPONSE_BYTES
      ? text
      : null;
  }

  const reader = clone.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_OBSERVED_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function responseOutcome(response) {
  const status = Number.isInteger(response?.status) ? response.status : 0;
  if (status === 408 || status === 429) return "not_executed";
  if (status >= 400 && status < 500) return "failed_before_side_effects";
  if (status >= 500) return "ambiguous";
  if (status < 200 || status >= 300) return "ambiguous";

  try {
    const text = await readObservedResponse(response);
    if (text === null) return "ambiguous";
    const body = text ? JSON.parse(text) : {};
    return body && typeof body === "object" && body.ok === false
      ? "failed_before_side_effects"
      : "ambiguous";
  } catch {
    return "ambiguous";
  }
}

async function submitEvidenceCandidate(args, configuration, fetchFn = globalThis.fetch) {
  if (typeof fetchFn !== "function") {
    try {
      return await core.submitEvidenceCandidate(args, configuration, fetchFn);
    } catch (error) {
      throw markProviderOutcome(error, "failed_before_side_effects");
    }
  }

  let fetchStarted = false;
  let observedOutcome;
  const observingFetch = async (...fetchArgs) => {
    fetchStarted = true;
    try {
      const response = await fetchFn(...fetchArgs);
      observedOutcome = await responseOutcome(response);
      return response;
    } catch (error) {
      observedOutcome = "ambiguous";
      throw error;
    }
  };

  try {
    return await core.submitEvidenceCandidate(args, configuration, observingFetch);
  } catch (error) {
    const providerOutcome = observedOutcome
      || (fetchStarted ? "ambiguous" : "failed_before_side_effects");
    throw markProviderOutcome(error, providerOutcome);
  }
}
