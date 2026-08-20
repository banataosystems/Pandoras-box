# Release and rollback proof package — governed GitHub runtime repair

**Prepared 2026-08-20. This package authorises nothing.** It records the exact
identities, the gates, the readback that would prove the release worked, and the
rollback route — so that a release decision can be made on evidence rather than
reconstructed under incident pressure.

## 1. Exact identities

| Item | Value |
|---|---|
| Candidate | PR #79, `fix/github-vault-oidc-precedence-clean-main-20260820` |
| Candidate exact head (reviewed, frozen) | `150f2a7dba41373f2a18c2ef438d57408e5b9619` |
| Candidate tree | `85362192a7deca747fb6c05cfe6e84e3f4984ea8` |
| Candidate base recorded on the PR | `main@c2cc635383b78d457d1731294a6f5b306d85f6be` |
| **Current `main` (rollback target)** | `d0b0ec4533410faab4ec59095b5b674c794c1ef7` |
| Successor carrying the missing coverage | this branch, based on `150f2a7d…` |
| Production origin | `https://mcpmaster.vercel.app` |

`main` advanced after the candidate was frozen (#67, #68, #76 merged at
05:24–05:27Z), so **the candidate is behind its own recorded base.** It must be
integrated with `d0b0ec4…` and re-verified before release; do not release the
frozen head against a base it was never tested with.

## 2. Change under release

One hunk in `src/runtime/service-config.js`. When a workload identity is
present, GitHub configuration resolves from the OIDC/Vault control catalog
before the legacy `GITHUB_TOKEN` path, so identity, token, allowed repositories,
granted scopes **and `allowMutations`** come from the governed catalog.

Blast radius is the GitHub tool family only. No migration, no schema change, no
grant change, no Memory or Supabase mutation.

## 3. What the release is expected to fix — and what is unproven

**Expected:** the split-brain where the Supabase catalog reports `github-primary`
active with mutations enabled while the runtime denies mutations, because the
legacy environment path supplied `allowMutations` from `GITHUB_ALLOW_MUTATIONS`.

**Unproven, and it must stay labelled unproven until readback:** that this is the
cause of the `github_*` failures. Two facts constrain the diagnosis:

- The production origin is **healthy**. Measured 2026-08-20T05:3xZ: `POST /mcp`
  unauthenticated returns **HTTP 401**, `/health` returns **HTTP 200** in ~500ms.
  The origin boots and enforces its auth boundary.
- The observed `502` on `github_*` is returned by the connector gateway
  (`zone: api.anthropic.com`), while `memory_*` tools on the same connector
  succeed. The fault is specific to the authenticated GitHub tool path.

So the origin is not down, and any claim that this release "fixes the outage" is
a hypothesis until §5 is executed.

## 4. Pre-release gates

| # | Gate | State |
|---|---|---|
| 1 | Exact-head CI on the candidate | ✅ run `32323700176`, `head_sha` `150f2a7d…`, success |
| 2 | Independent source review at the exact head | ✅ PASS with non-blocking findings |
| 3 | Mutation-authority regression coverage | ✅ added in this successor; counterfactual-verified |
| 4 | Break-glass posture decided and recorded | ✅ `docs/decisions/GITHUB_VAULT_PRECEDENCE_BREAK_GLASS.md` |
| 5 | Integrated with current `main` and re-tested | ❌ **required before release** |
| 6 | Qualifying non-author approval | ❌ blocked by issue #69 |
| 7 | Owner production-release authorization | ❌ not given |

Gates 5–7 are open. **This package does not close them.**

## 5. Release readback — the only thing that proves it worked

Run immediately after the production deployment reports READY:

```
node scripts/verify-github-runtime-release.mjs \
  --authenticated-get-me <ok|error> \
  --mutation-policy <allowed|denied>
```

Exit codes: `0` proof satisfied · `2` preconditions met but **unverified** ·
`1` precondition or proof failed.

The unauthenticated preconditions **cannot** prove the repair — an unauthenticated
caller is rejected before GitHub configuration is ever built. Measured against
production while the failure was still live, both preconditions passed. That is
why the script refuses to exit `0` without an authenticated result: a green
precondition run is not evidence of a fix.

The two results that are evidence:

1. **`github.get-me` through the governed path returns an identity.** Currently
   it returns `502`.
2. **The governed account reports mutations allowed**, matching the Supabase
   catalog. Currently a governed mutation fails with `GitHub mutations are
   disabled for account github-primary`.

Capture alongside: the Vercel deployment id and its source SHA, and the
resolved account id — confirming it came from the catalog and not the
environment path (see the N2 caveat in the break-glass record; today both report
`github-primary`, so the deployment's env state must be recorded to disambiguate).

## 6. Rollback

**Target:** `d0b0ec4533410faab4ec59095b5b674c794c1ef7` — the `main` commit
immediately before this release.

Trigger rollback on any of: `mcp_auth_boundary` FAIL, unauthenticated `/mcp`
returning `200`, `github.get-me` still failing after the deployment reports
READY, or any GitHub tool behaviour more permissive than before.

Route: redeploy the recorded rollback target through the same Vercel Git
integration that performed the release, then re-run §5 and confirm the
preconditions return to `PASS`.

Properties that make this rollback safe, and their limits:

- **Source-only.** One hunk in one file; no migration, grant, schema or data
  change, so there is no forward-only state to unwind.
- **Recoverable history.** Both SHAs are reachable; revert restores prior
  behaviour exactly.
- **Not rehearsed.** No rollback has been exercised against this deployment
  binding. This is a *documented* route, **not a proven** one, and it must not be
  reported as rollback-verified until an actual rehearsal is performed.

## 7. Proof classification at preparation time

- documented ✅ · implemented ✅ · exact-head tested ✅ · independently reviewed ✅
- integrated with current `main` ❌ · approved ❌ · merged ❌ · deployed ❌
- production-verified ❌ · rollback-rehearsed ❌
