# Decision: no automatic fallback when the governed GitHub catalog fails

- **Status:** decided, pending release
- **Date:** 2026-08-20
- **Applies to:** `src/runtime/service-config.js` → `buildGitHubConfiguration`
- **Candidate:** PR #79 at `150f2a7dba41373f2a18c2ef438d57408e5b9619`
- **Raised as:** finding N3 of the independent review of PR #79

## The question

PR #79 makes the OIDC/Vault control catalog take precedence over `GITHUB_TOKEN`.
A consequence is that whenever a workload identity is present, the legacy PAT
path is **no longer reachable** — if the catalog call fails, configuration fails.

That is a deliberate narrowing, and it deserves an explicit decision rather than
being inherited silently, because the component it hardens is the same one
currently implicated in a production incident. If the catalog is the failing
dependency, this change converts a recoverable misconfiguration into an
unconditional one.

## Decision

**Keep the fail-closed behaviour. Do not add an automatic fallback to
`GITHUB_TOKEN` when catalog resolution fails.**

## Why

A silent fallback is not a smaller version of the same behaviour — it is a
different security posture. Under it, a catalog outage causes the runtime to
serve an **ungoverned environment token under a governed account name**, because
`service-config.js` labels the environment path with
`MCPMASTER_GITHUB_ACCOUNT_ID`. Callers, audit records and error messages would
all report `github-primary` while the credential, its scopes and its mutation
policy came from environment variables that the governed catalog never
authorised.

That failure mode is not hypothetical. It is the mechanism behind the current
incident: the production error `GitHub mutations are disabled for account
github-primary` names the governed account even though the governed catalog was
never consulted. Adding a fallback would make that confusion permanent and
automatic instead of a one-off misconfiguration.

This decision is regression-protected. `test/github-governed-config.test.js`
contains `a named account absent from the catalog fails closed`, which asserts
that resolution rejects and that neither the catalog token nor the environment
token leaks into the error. A build that adds a silent fallback fails that test —
verified by counterfactual, not assumed.

## What is permitted instead

Break-glass remains available, but only as a **deliberate operator action with
an audit trail**, never as an automatic runtime decision:

1. An operator with production configuration authority removes or empties
   `VERCEL_OIDC_TOKEN` for the environment, which returns the runtime to the
   legacy PAT path by the documented precedence rules — no code change, no
   redeploy of different source.
2. The action is recorded with who performed it, when, why, and the expected
   duration.
3. `GITHUB_ALLOW_MUTATIONS` is set to match what the governed catalog would have
   granted. Break-glass restores availability; it does not widen authority.
4. The governed path is restored and verified before the incident is closed, and
   the break-glass window is reported as an ungoverned-credential period.

## Accepted consequence

While the governed path is broken, governed GitHub tooling stays unavailable
rather than degrading to an unaudited credential. Availability is not preferred
over provenance for a control plane whose purpose is provenance.

## Related, still open

`buildGitHubEnvironmentConfiguration` sets
`id: process.env.MCPMASTER_GITHUB_ACCOUNT_ID?.trim() || 'environment'`, so the
legacy path can present itself as the governed account in errors and audit
records. That is finding N2 of the same review, it is **not** fixed by PR #79,
and it should be corrected so the two paths are never confusable — regardless of
this decision.
