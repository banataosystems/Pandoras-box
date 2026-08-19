---
name: deploying-with-exact-provenance
description: "Builds and promotes exact-source deployment candidates with content-addressed evidence. Use after source, tests, reviews, environment, database, and authorization gates are satisfied."
---

# Deploying with Exact Provenance

## Outcome

A deployment whose source SHA, build, configuration, target, aliases, migrations, authorization, and rollback are exact and independently verifiable.

## Use when

- A preview, staging, or production deployment is requested.
- A main merge may trigger production.
- A provider deployment needs release classification.

## Workflow

1. Freeze the exact reviewed head and verify all landing gates.
2. Build from the literal source with lockfile, environment, and dependency provenance; distinguish cached from clean installs.
3. Bind deployment ID, URL, target, source SHA, build logs, configuration, database compatibility, and aliases.
4. Require explicit production authorization when promotion, main merge, or routing is production-coupled.
5. Perform post-deploy readback and preserve rollback or forward-recovery evidence.

## Proof required

- Exact source and deployment IDs.
- Build/test/review/environment/database gate results.
- Promotion authorization and provider readback.

## Stop conditions

- The source head moved.
- Independent review or database compatibility is missing.
- A main merge would silently deploy to production without authorization.

## Outputs

- `deployment-manifest`
- `promotion-record`
- `rollback-anchor`
