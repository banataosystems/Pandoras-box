"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { resolveVercelWorkloadToken } = require("../dist/runtime/vercel-workload-identity.js");

function jwt(expirationSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expirationSeconds })).toString("base64url");
  return `${header}.${payload}.platform-signature`;
}

test("workload identity resolves Vercel's trusted per-request OIDC context", async () => {
  const contextSymbol = Symbol.for("@vercel/request-context");
  const previousContext = globalThis[contextSymbol];
  const previousEnvironmentToken = process.env.VERCEL_OIDC_TOKEN;
  const token = jwt(Math.floor(Date.now() / 1000) + 3600);
  delete process.env.VERCEL_OIDC_TOKEN;
  globalThis[contextSymbol] = {
    get() {
      return { headers: { "x-vercel-oidc-token": token } };
    },
  };
  try {
    assert.equal(await resolveVercelWorkloadToken(), token);
  } finally {
    if (previousContext === undefined) delete globalThis[contextSymbol];
    else globalThis[contextSymbol] = previousContext;
    if (previousEnvironmentToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previousEnvironmentToken;
  }
});

test("missing platform workload identity fails closed", async () => {
  const contextSymbol = Symbol.for("@vercel/request-context");
  const previousContext = globalThis[contextSymbol];
  const previousEnvironmentToken = process.env.VERCEL_OIDC_TOKEN;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete globalThis[contextSymbol];
  try {
    assert.equal(await resolveVercelWorkloadToken(), undefined);
  } finally {
    if (previousContext !== undefined) globalThis[contextSymbol] = previousContext;
    if (previousEnvironmentToken !== undefined) process.env.VERCEL_OIDC_TOKEN = previousEnvironmentToken;
  }
});
