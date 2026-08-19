# Pandora Vercel release evidence — trust model v3

This lane separates four evidence authorities:

1. `SOURCE_CONTROLLED` describes expected candidate metadata and route contracts only.
2. `GITHUB_PROVIDER`, `VERCEL_PROVIDER`, and `SUPABASE_PROVIDER` are fresh provider observations.
3. `INDEPENDENT_REVIEWER` is an exact-head review issued by a distinct reviewer identity.
4. `OWNER_AUTHORIZATION` is a separate, scoped, one-time production authorization.

A source branch cannot promote itself into any of the latter three classes. A checksum over a JSON file proves only byte integrity. It does not prove provider, reviewer, or owner issuance.

## Source boundary

`release-candidate.source.json` contains expectations and the explicit fact that production authorization is absent. It contains no positive readiness, provider, rollback, review, rehearsal, or authorization claim.

The source validator deliberately cannot emit `RELEASE_READY`, `AUTHORIZED_FOR_PRODUCTION`, or `PRODUCTION_VERIFIED` from a submitted JSON packet. Those decisions belong to the independent control plane after fresh provider readback. Candidate code can validate negative invariants and exact-head evidence, but it cannot appoint itself as the evidence issuer.

## Exact-head CI evidence

`collect-github-release-evidence.mjs` retrieves the exact PR head, changed files, GitHub review state, Vercel status, and Vercel bot deployment comment. It performs read-only route probes against the exact candidate preview and the stable non-production comparison alias.

The collector historically labeled that parallel route comparison as a rehearsal `PASS`. The current workflow immediately hardens the packet before verification and artifact upload:

- route semantics may be `PASS`;
- rollback rehearsal remains `BLOCKED`;
- rollback deployment identity remains absent;
- no transition or restoration is claimed;
- no rollback qualification is granted;
- owner authorization remains absent.

A real rehearsal requires a separately captured Vercel provider receipt binding the candidate deployment, rollback deployment, non-production transition or redeploy, post-transition probes, and restoration.

## Provider evidence and release decision

Fresh Vercel project/deployment readback, Supabase compatibility evidence, independent review, and owner authorization are external records. Worker 6 must retrieve them directly or through a durable Pandora Memory evidence record.

The decision ladder is:

- missing or stale external evidence: `NOT_READY`;
- route comparison without provider transition: `ROLLBACK_REHEARSAL_BLOCKED`;
- technical gates complete but owner authorization absent: `RELEASE_READY_BUT_NOT_AUTHORIZED`;
- production promotion requires separate owner authorization and post-promotion provider readback.

## Safety boundary

The workflow has read-only GitHub permissions and receives no repository secret. It performs no Vercel deploy, promote, alias, rollback, environment, database, Auth, secret, Git push, merge, or production mutation. Merge to `main` remains production-sensitive and is not authorized by green CI.

## Historical evidence

The self-authored v1 manifest remains in Git history at PR #58 head `2d0c25941f73162b104ef231ac573c710fcfc8ea`. It is excluded from the active trust path. Later provider evidence never retroactively authorizes that failed candidate.
