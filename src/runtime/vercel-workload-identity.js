"use strict";

const { getVercelOidcToken } = require("@vercel/oidc");

/**
 * Resolve the platform-issued workload identity for the current invocation.
 *
 * Vercel supplies production OIDC through request context and may not expose it
 * as a process environment variable. The official helper reads that trusted
 * request context first and retains the environment fallback for local tooling.
 */
async function resolveVercelWorkloadToken() {
  try {
    const token = (await getVercelOidcToken()).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

module.exports = { resolveVercelWorkloadToken };
