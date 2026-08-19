---
name: managing-migrations-and-rollbacks
description: "Designs, verifies, and governs database/schema/data migrations plus rollback or forward recovery. Use whenever persistent state or authorization policies change."
---

# Managing Migrations and Rollbacks

## Outcome

A deterministic migration chain with exact source/provider parity, replay proof, compatibility checks, and a rehearsed recovery path.

## Use when

- A schema, RLS, function, trigger, index, or data transformation changes.
- Hosted migration history drifts from source.
- A release depends on database compatibility.

## Workflow

1. Inventory exact provider migration ledger, schema, functions, policies, triggers, and current application compatibility.
2. Create immutable forward migrations with idempotency and provenance; never edit applied history to look clean.
3. Replay from a known baseline and compare source/provider identities.
4. Test authorization, data invariants, concurrency, backward/forward compatibility, and recovery.
5. Use isolated non-production proof where persistent or costly provider effects are possible; obtain approval before production mutation.

## Proof required

- Migration hashes and ledger parity.
- Replay, authorization, and compatibility results.
- Rollback or forward-recovery rehearsal and data-loss bounds.

## Stop conditions

- Source/provider parity is unknown.
- Rollback metadata or recovery is unproven for a destructive change.
- The only test path is an unauthorized production mutation or new spending.

## Outputs

- `migration-candidate`
- `parity-report`
- `recovery-manifest`
