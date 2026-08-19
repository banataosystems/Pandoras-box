---
name: pandora-supabase
description: "Design, review, migrate, and verify Supabase and PostgreSQL for Pandora projects. Load for schema design, migrations, RLS policies, SECURITY DEFINER review, advisors, Edge Functions, branch environments, database performance, or source/provider parity. Covers migration replay, rollback proof, and the parity checks that decide whether a database capability can be called production-verified."
---

# Pandora Supabase & PostgreSQL

The database is where irreversible mistakes live. Migrations are code that runs once against real data.

## Source/provider parity

**The check that matters most, and the one most often skipped.**

The hosted migration ledger and the migrations committed to source must match. They drift when someone applies a migration directly to the provider without committing it — everything looks healthy on both sides independently, and the gap is invisible until a rebuild, a rollback, or a fresh environment silently produces a different schema.

To verify parity:

1. List the hosted migration ledger — versions, names, sizes, hashes.
2. List committed migrations in source.
3. Compare **content hashes**, not just names. Same name, different content is worse than a missing file, because it looks correct.
4. Record exactly: total hosted, total in source, matched, hosted-only, source-only.

**A capability whose migrations are not in parity is at most `deployed`. It is never `production_verified`.** Say so plainly rather than rounding up.

When you find hosted-only migrations, the repair is to commit them (or establish reviewed alternative provenance) — never to delete them from the provider to make the counts agree.

## Migrations

**Design.** Forward-only where possible. Additive before destructive: add a column, backfill, switch reads, then drop — across separate deploys, never one. A migration that drops or rewrites data in the same step as the code change has no safe rollback.

**Every migration needs a rollback artifact** written and replayed before the migration is applied. A down-migration that has never been run is not rollback readiness.

**Replay** migrations from a clean state to prove they produce the expected schema deterministically. This repository already does this — replay results and fixtures are preserved under `docs/supabase/recovery/` with their digests. Record replay results with the migration count and a digest so a later reader can bind to the same run.

**Concurrency.** Long-running DDL takes locks. `CREATE INDEX CONCURRENTLY`, avoid rewriting large tables in a transaction that blocks writes, and know what your migration locks and for how long.

**Idempotency.** `IF NOT EXISTS` guards where semantics allow, so a partial failure is re-runnable.

Applying migrations is a **sensitive-to-destructive** mutation and goes through `pandora-governed-execution`.

## Row-Level Security

Two failure shapes, both real and both visible in advisors:

- **RLS off, policies written** — policies enforce nothing. Wide open.
- **RLS on, no policies** — denies everything. Looks secure; breaks the app; usually gets "fixed" by disabling RLS.

Every table holding user or tenant data has RLS **enabled and policied**. Policies are written per operation (`select` / `insert` / `update` / `delete`); a permissive `for all` policy is rarely what was intended.

Test policies as each role — anonymous, authenticated, another tenant's user, service role — and include **negative tests** proving denial. A policy suite with only positive tests is untested.

## SECURITY DEFINER

Definer functions run with the owner's privileges and are the main privilege-escalation surface in PostgreSQL.

- Pin `search_path` explicitly. An empty or mutable search_path lets a caller shadow objects the function resolves.
- Audit EXECUTE ACLs: who can call it? `PUBLIC` and `anon` on a definer function are findings until proven intended.
- Keep the body minimal and validate every input — it runs privileged.
- Record owner, ACL, `search_path`, and a definition hash so drift is detectable later.

Default function ACLs drift forward as new functions are created; re-audit rather than assuming a past audit still holds.

## Advisors

Run security and performance advisors and read every finding. Classify: real defect · accepted with reason · not applicable. Record accepted findings *with* their reasons — an unexplained accepted finding is indistinguishable from one nobody looked at.

Never disable a lint to clear it. Report counts precisely (N notices, M WARN) and name what remains open.

## Branch environments

Use Supabase branches to rehearse migrations against a real schema before touching the shared database. Branch creation may incur cost — that makes it **new spending and an escalation**, not a routine step.

Rehearse on a branch, verify the resulting schema and advisors, prove rollback, *then* plan the production migration.

## Performance

Index what you filter, join, and sort on — and verify with `EXPLAIN` rather than intuition. Watch for N+1 patterns behind ORMs and PostgREST, unbounded queries without pagination, missing foreign-key indexes, and RLS policies that force a sequential scan per row (a policy calling a function per row is a common and severe one).

## Output

```
PROJECT       <ref> · <status> · <region>
SCHEMA        <n> tables · RLS enabled on <n> · <n> policies
FUNCTIONS     <n> SECURITY DEFINER · search_path pinned: <n> · publicly callable: <n>
MIGRATIONS    hosted <n> · source <n> · matched <n> · hosted-only <n> · source-only <n>
PARITY        complete | broken — <detail>
REPLAY        <n> migrations replayed · digest <hash> · result
ADVISORS      security <n> notices / <n> WARN · performance <n>
ROLLBACK      <artifact> · replayed: <bool>
PROOF STATE   <stage>
```

## Handoff

Security depth → `pandora-security-review`.
Applying a migration → `pandora-governed-execution`.
Release gating → `pandora-deployment-release`.
Record parity and replay results → `pandora-evidence-ledger`.
