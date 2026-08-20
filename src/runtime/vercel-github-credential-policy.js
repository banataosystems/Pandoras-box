"use strict";

/**
 * Vercel production and preview runtimes must obtain GitHub credentials through
 * request-scoped Vercel OIDC -> Supabase Vault. A legacy static GITHUB_TOKEN
 * would otherwise shadow the governed github-primary resolver in service-config.
 *
 * Non-Vercel runtimes retain the existing environment-token fallback for local
 * development and isolated test use.
 */
function enforceVercelVaultFirstGitHubConfiguration(environment = process.env) {
  const isVercelRuntime =
    environment.VERCEL === "1" ||
    Boolean(environment.VERCEL_ENV?.trim());

  if (!isVercelRuntime || !environment.GITHUB_TOKEN?.trim()) {
    return false;
  }

  delete environment.GITHUB_TOKEN;
  return true;
}

module.exports = {
  enforceVercelVaultFirstGitHubConfiguration,
};
