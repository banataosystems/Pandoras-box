"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createProjectOsMcpHandler } = require("../dist/projectos-mcp-handler.js");
const { submitEvidenceCandidate } = require("../src/tools/memory-evidence-intake.js");

const TOKEN = "verified-contract-regression-token-material-long-enough";
const ORGANIZATION_ID = "2270b266-59da-4c39-bfd9-9f8d08352af0";
const USER_ID = "e5f5744e-554b-4f92-aad2-3f58ae6a33ad";

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(name, args = {}) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: {
      jsonrpc: "2.0",
      id: 19,
      method: "tools/call",
      params: { name, arguments: args },
    },
  };
}

function handlerDependencies(overrides = {}) {
  return {
    organizationId: ORGANIZATION_ID,
    authenticator: {
      async authenticate() {
        return {
          userId: USER_ID,
          accessToken: TOKEN,
          scopes: ["openid", "email", "profile"],
          scopeClaimsPresent: true,
          aal: "aal1",
        };
      },
    },
    membershipResolver: {
      async resolve() {
        return { organizationId: ORGANIZATION_ID, userId: USER_ID, role: "owner" };
      },
    },
    workloadToken: () => "server-side-vercel-oidc-token",
    toolConfiguration: async () => ({ fixture: true }),
    ...overrides,
  };
}

test("array-valued provider reads are object-normalized for MCP structuredContent", async () => {
  const raw = [
    { id: "account-a", name: "Primary" },
    { id: "account-b", name: "Secondary" },
  ];
  const handler = createProjectOsMcpHandler(handlerDependencies({
    async execute(name) {
      assert.equal(name, "supabase.list-accounts");
      return raw;
    },
  }));
  const response = responseRecorder();
  await handler(request("supabase.list-accounts"), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.result.structuredContent, { items: raw });
  assert.equal(response.body.result.content[0].text, JSON.stringify(raw));
  assert.equal(Array.isArray(response.body.result.structuredContent), false);
});

const memoryConfig = {
  baseUrl: "https://pandorasbox-memory.vercel.app",
  oidcToken: "test-oidc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  allowedNamespaces: ["real_life"],
  grantedScopes: ["memory:read", "memory:write"],
  allowMutations: true,
  timeoutMs: 1000,
  maxResponseBytes: 100000,
};

function evidenceArgs() {
  const sha = "0b6d32b9135e2050c4f819a8d7ac3c78e6bc1117";
  return {
    namespace: "real_life",
    projectKey: "mcpmaster-pandoras-box",
    title: "ProjectOS contract regression evidence",
    summary: "Contract-only regression fixture with no private identifiers or credentials.",
    proofStage: "tested",
    claim: "The fixture proves error-code sanitization only.",
    evidenceRefs: [{ type: "github_source", ref: `banataosystems/Pandoras-box@${sha}` }],
    provenance: {
      source_type: "github_source",
      source_locator: "banataosystems/Pandoras-box",
      source_sha: sha,
      observed_at: "2026-08-19T04:30:00+08:00",
    },
    idempotencyKey: `projectos-contract:${sha}`,
  };
}

test("Memory 400 exposes only an allowlisted downstream code and never backend detail", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "evidence_candidate_invalid",
        detail: "relation memory_capture_candidates secret=must-not-leak",
      }), { status: 400 })),
    (error) => {
      assert.match(error.message, /submission failed \(400\): evidence_candidate_invalid/);
      assert.doesNotMatch(error.message, /memory_capture_candidates|must-not-leak|secret=/);
      return true;
    },
  );
});

test("unknown Memory backend error strings remain fully redacted", async () => {
  await assert.rejects(
    () => submitEvidenceCandidate(evidenceArgs(), memoryConfig, async () =>
      new Response(JSON.stringify({
        ok: false,
        error: "relation memory_capture_candidates",
        detail: "private diagnostic",
      }), { status: 400 })),
    (error) => {
      assert.equal(error.message, "Pandora Memory candidate submission failed (400)");
      assert.doesNotMatch(error.message, /memory_capture_candidates|private diagnostic/);
      return true;
    },
  );
});
