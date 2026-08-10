import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedCorsOrigin,
  automaticIntakeWindow,
  connectionActionAllowed,
  isReleaseEvidenceType,
  normalizeIntakeFingerprintPart,
  normalizeOwnerRoute,
  ownerRiskLabel,
  parseAllowedOrigins,
} from "../../supabase/functions/pandora-owner-api/contract.ts";

test("owner routes accept direct Edge and existing client prefixes", () => {
  assert.equal(normalizeOwnerRoute("/pandora-owner-api/home"), "/home");
  assert.equal(
    normalizeOwnerRoute(
      "/functions/v1/pandora-owner-api/api/owner/projects/example",
    ),
    "/projects/example",
  );
  assert.equal(
    normalizeOwnerRoute("/api/owner/approvals/123/decide"),
    "/approvals/123/decide",
  );
});

test("CORS reflects only exact HTTPS origins", () => {
  const allowed = parseAllowedOrigins(
    "https://pandora.flutterflow.app,http://unsafe.example",
  );
  assert.equal(
    allowedCorsOrigin("https://pandora.flutterflow.app", allowed),
    "https://pandora.flutterflow.app",
  );
  assert.equal(allowedCorsOrigin("https://evil.example", allowed), null);
  assert.equal(
    allowedCorsOrigin("https://pandora.flutterflow.app/path", allowed),
    null,
  );
  assert.equal(allowed.has("http://unsafe.example"), false);
});

test("automatic duplicate protection is stable inside a ten-minute window", () => {
  assert.equal(automaticIntakeWindow(0), 0);
  assert.equal(automaticIntakeWindow(599_999), 0);
  assert.equal(automaticIntakeWindow(600_000), 1);
  assert.equal(
    normalizeIntakeFingerprintPart("  Fix\u00a0 THE   Release  "),
    "fix the release",
  );
  assert.throws(() => automaticIntakeWindow(1, 0), RangeError);
});

test("owner semantics map risk, release proof, and connection transitions", () => {
  assert.equal(ownerRiskLabel("R0"), "Low");
  assert.equal(ownerRiskLabel("R3"), "High");
  assert.equal(ownerRiskLabel("R4"), "Critical");
  assert.equal(ownerRiskLabel("unknown"), "Not checked yet");

  assert.equal(isReleaseEvidenceType("production_deployment"), true);
  assert.equal(isReleaseEvidenceType("preview-verified"), true);
  assert.equal(isReleaseEvidenceType("unit_test"), false);

  assert.equal(connectionActionAllowed("test", "not_checked"), true);
  assert.equal(connectionActionAllowed("connect", "needs_permission"), true);
  assert.equal(connectionActionAllowed("reconnect", "problem"), true);
  assert.equal(connectionActionAllowed("disconnect", "ready"), true);
  assert.equal(connectionActionAllowed("disconnect", "problem"), false);
});
