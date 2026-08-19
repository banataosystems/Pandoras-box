# Pandora Vercel release evidence — trust model v2

This lane deliberately separates four evidence authorities:

1. `SOURCE_CONTROLLED` — expected candidate metadata and route contracts only.
2. `GITHUB_PROVIDER`, `VERCEL_PROVIDER`, and `SUPABASE_PROVIDER` — live provider observations.
3. `INDEPENDENT_REVIEWER` — exact-head review issued by a distinct reviewer identity.
4. `OWNER_AUTHORIZATION` — a separate, scoped, expiring production authorization.

A source branch cannot promote itself into any of the latter three classes. A checksum over a committed JSON file proves byte integrity only; it does not prove that a provider, reviewer, or owner issued the claim.

## Current source artifact

`release-candidate.source.json` contains only expected identifiers, non-production route contracts, and the explicit fact that production authorization is absent. It intentionally contains no `ready: true`, rollback qualification, provider-observed deployment state, reviewer PASS, or owner authorization.

## Runtime evidence

`collect-github-release-evidence.mjs` performs a fresh GitHub-provider read during exact-head CI. It retrieves the current PR, head commit, changed files, Vercel status context, Vercel bot deployment comment, and reviews. It probes the exact candidate preview and the stable non-production rollback rehearsal alias. The output is ephemeral and content-addressed; it is not committed as release truth.

Authenticated Vercel and Supabase observations remain separate external receipts. Worker 6 must re-read them or retrieve their durable Pandora Memory evidence record. Source-controlled values cannot substitute for those receipts.

## Release decision

The validator derives state rather than accepting a manually edited readiness boolean:

- missing or stale provider evidence => `NOT_READY`;
- missing independent exact-head review => `NOT_READY`;
- unqualified rollback/rehearsal => `NOT_READY`;
- all technical gates pass but owner authorization is absent => `RELEASE_READY_BUT_NOT_AUTHORIZED`;
- an actual promotion requires a separate valid `OWNER_AUTHORIZATION` receipt and a fresh pre-promotion provider readback.

## Historical v1 evidence

The prior self-authored observation manifest and sidecar are preserved in Git history through PR #58 head `2d0c25941f73162b104ef231ac573c710fcfc8ea`. They are intentionally removed from the active trust path because Worker 6 proved they could be edited and rehashed without provider issuance.

## Safety boundary

This workflow performs no Vercel deploy, promote, alias, rollback, environment, database, Auth, secret, or production mutation. Merging `main` remains production-sensitive and is not authorized by green CI.
