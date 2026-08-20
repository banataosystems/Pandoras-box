"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  enforceVercelVaultFirstGitHubConfiguration,
} = require("../src/runtime/vercel-github-credential-policy.js");

test("Vercel runtime removes a static GitHub token so Vault resolution wins", () => {
  const environment = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    GITHUB_TOKEN: "legacy-static-token",
  };

  const changed = enforceVercelVaultFirstGitHubConfiguration(environment);

  assert.equal(changed, true);
  assert.equal(Object.hasOwn(environment, "GITHUB_TOKEN"), false);
});

test("Vercel preview also removes a static GitHub token", () => {
  const environment = {
    VERCEL_ENV: "preview",
    GITHUB_TOKEN: "legacy-static-token",
  };

  const changed = enforceVercelVaultFirstGitHubConfiguration(environment);

  assert.equal(changed, true);
  assert.equal(Object.hasOwn(environment, "GITHUB_TOKEN"), false);
});

test("non-Vercel runtime preserves the local GitHub token fallback", () => {
  const environment = {
    GITHUB_TOKEN: "local-development-token",
  };

  const changed = enforceVercelVaultFirstGitHubConfiguration(environment);

  assert.equal(changed, false);
  assert.equal(environment.GITHUB_TOKEN, "local-development-token");
});

test("Vercel runtime without a static token is a no-op", () => {
  const environment = {
    VERCEL: "1",
    VERCEL_ENV: "production",
  };

  const changed = enforceVercelVaultFirstGitHubConfiguration(environment);

  assert.equal(changed, false);
  assert.equal(Object.hasOwn(environment, "GITHUB_TOKEN"), false);
});
