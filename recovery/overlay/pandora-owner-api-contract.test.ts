import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedCorsOrigin,
  normalizeOwnerRoute,
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
