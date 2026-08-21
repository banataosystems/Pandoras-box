"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildToolConfiguration } = require("../src/runtime/service-config.js");

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("request-scoped Vercel OIDC wins over a static GitHub token", async () => {
  const originalFetch = globalThis.fetch;
  const originalGitHubToken = process.env.GITHUB_TOKEN;
  const originalAccountId = process.env.MCPMASTER_GITHUB_ACCOUNT_ID;
  const trustedOidc = "o".repeat(96);
  process.env.GITHUB_TOKEN = "static-token-must-not-win";
  process.env.MCPMASTER_GITHUB_ACCOUNT_ID = "github-primary";
  let catalogCalls = 0;
  globalThis.fetch = async (url, options) => {
    catalogCalls += 1;
    assert.equal(String(url), "https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/mcpmaster-supabase-control");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.authorization, `Bearer ${trustedOidc}`);
    assert.equal(options.body, JSON.stringify({ action: "github_catalog" }));
    return new Response(JSON.stringify({ ok: true, accounts: [{ id: "github-primary", label: "GitHub primary", authMode: "pat", token: "vault-resolved-test-token", allowMutations: false, baseUrl: "https://api.github.com", login: "banataosystems", allowedRepositories: ["banataosystems/Pandoras-box"], grantedScopes: ["repo:read"] }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const config = await buildToolConfiguration("github.get-me", { vercelOidcToken: trustedOidc });
    assert.equal(config.github.token, "vault-resolved-test-token");
    assert.equal(config.github.id, "github-primary");
    assert.equal(catalogCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("GITHUB_TOKEN", originalGitHubToken);
    restoreEnv("MCPMASTER_GITHUB_ACCOUNT_ID", originalAccountId);
  }
});

test("static GitHub token remains fallback when request OIDC is absent", async () => {
  const originalFetch = globalThis.fetch;
  const originalGitHubToken = process.env.GITHUB_TOKEN;
  const originalVercelOidc = process.env.VERCEL_OIDC_TOKEN;
  process.env.GITHUB_TOKEN = "local-static-test-token";
  delete process.env.VERCEL_OIDC_TOKEN;
  globalThis.fetch = async () => { throw new Error("control resolver must not run for static fallback"); };
  try {
    const config = await buildToolConfiguration("github.get-me", {});
    assert.equal(config.github.token, "local-static-test-token");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("GITHUB_TOKEN", originalGitHubToken);
    restoreEnv("VERCEL_OIDC_TOKEN", originalVercelOidc);
  }
});
