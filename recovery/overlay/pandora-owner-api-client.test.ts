import assert from "node:assert/strict";
import test from "node:test";
import {
  PandoraOwnerApiClient,
  PandoraOwnerApiError,
} from "./pandora-owner-api-client.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("connections uses one governed owner endpoint and user bearer session", async () => {
  let seenUrl = "";
  let seenAuth = "";
  let seenOrganization = "";
  const client = new PandoraOwnerApiClient({
    baseUrl: "https://pandora.example",
    getAccessToken: () => "owner-session-token",
    getOrganizationId: () => "organization-123",
    fetchImpl: async (url, init) => {
      seenUrl = url;
      seenAuth = new Headers(init?.headers).get("authorization") || "";
      seenOrganization = new Headers(init?.headers).get("x-organization-id") ||
        "";
      return jsonResponse([]);
    },
  });

  await client.connections();
  assert.equal(seenUrl, "https://pandora.example/api/owner/connections");
  assert.equal(seenAuth, "Bearer owner-session-token");
  assert.equal(seenOrganization, "organization-123");
});

test("ask sends plain owner intent, not raw provider routing", async () => {
  let body: any = null;
  let idempotencyKey = "";
  const client = new PandoraOwnerApiClient({
    baseUrl: "https://pandora.example",
    getAccessToken: () => "owner-session-token",
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      idempotencyKey = new Headers(init?.headers).get("idempotency-key") || "";
      return jsonResponse({ reply: "Started.", needsApproval: false });
    },
  });

  await client.ask("Continue Porknyeta", "porknyeta");
  assert.deepEqual(body, {
    message: "Continue Porknyeta",
    projectId: "porknyeta",
    clientMode: "simple",
  });
  assert.equal("provider" in body, false);
  assert.equal("mcp" in body, false);
  assert.equal("token" in body, false);
  assert.match(idempotencyKey, /^[0-9a-f-]{36}$/i);
});

test("missing owner session fails before network access", async () => {
  let networkCalled = false;
  const client = new PandoraOwnerApiClient({
    baseUrl: "https://pandora.example",
    getAccessToken: () => null,
    fetchImpl: async () => {
      networkCalled = true;
      return jsonResponse({});
    },
  });

  await assert.rejects(() => client.connections(), (error: unknown) => {
    assert.ok(error instanceof PandoraOwnerApiError);
    assert.equal(error.code, "SIGN_IN_REQUIRED");
    return true;
  });
  assert.equal(networkCalled, false);
});

test("permission failure is translated into simple owner language", async () => {
  const client = new PandoraOwnerApiClient({
    baseUrl: "https://pandora.example",
    getAccessToken: () => "owner-session-token",
    fetchImpl: async () => jsonResponse({ code: "AAL2_REQUIRED" }, 403),
  });

  await assert.rejects(() => client.approvals(), (error: unknown) => {
    assert.ok(error instanceof PandoraOwnerApiError);
    assert.equal(error.message, "You do not have permission for this yet.");
    assert.equal(error.code, "AAL2_REQUIRED");
    return true;
  });
});

test("approval decision sends only the governed decision", async () => {
  let seenUrl = "";
  let body: any = null;
  const client = new PandoraOwnerApiClient({
    baseUrl: "https://pandora.example",
    getAccessToken: () => "owner-session-token",
    fetchImpl: async (url, init) => {
      seenUrl = url;
      body = JSON.parse(String(init?.body));
      return jsonResponse({ ok: true });
    },
  });

  await client.decideApproval("approval 123", "approve");
  assert.equal(
    seenUrl,
    "https://pandora.example/api/owner/approvals/approval%20123/decide",
  );
  assert.deepEqual(body, { decision: "approve", clientMode: "simple" });
});

test("non-HTTPS base URL is rejected", () => {
  assert.throws(
    () =>
      new PandoraOwnerApiClient({
        baseUrl: "http://pandora.example",
        getAccessToken: () => "x",
      }),
    (error: unknown) =>
      error instanceof PandoraOwnerApiError && error.code === "HTTPS_REQUIRED",
  );
});
