# Pandora Vercel release evidence

This directory records provider-observed release state without turning an observation into an authorization.

## State model

Pandora treats these as separate proof states:

1. exact source candidate;
2. isolated preview;
3. exact-head tests and independent review;
4. stable staging verification;
5. content-addressed release manifest;
6. separate production authorization;
7. exact deployment or artifact promotion;
8. production alias, HTTP, runtime, integration, and recovery readback.

A Git merge, a successful build, a Vercel `READY` state, and a production-verification verdict are not interchangeable.

## Current architecture finding

Fresh provider history shows that a push to `main` for both canonical repositories creates a production-targeted deployment and a separate staging-target deployment. Therefore, merging to `main` is production-sensitive. A pull request must not be merged merely to obtain deployment evidence.

The current Vercel connector can prove project, deployment, source, target, aliases, build logs, and runtime logs. It did not expose a complete project-level environment-variable or Deployment Protection configuration readback in this lane. Those fields remain explicit `unknown` values rather than inferred claims.

## Manifest integrity

Each JSON manifest has a sibling `.sha256` file. The verifier:

- binds the sidecar to the exact manifest bytes;
- validates exact Git and Vercel identifier formats;
- requires staging and production to carry the manifest source SHA;
- rejects any qualified rollback missing source, build, runtime, database, recovery, or rehearsal gates;
- rejects credential-shaped material;
- rejects a release workflow that deploys, promotes, mutates aliases, or triggers on `push`;
- requires every third-party action to be allowlisted and pinned to a full immutable commit SHA.

Run:

```bash
node scripts/verify-vercel-release-evidence.mjs
node --test test/vercel-release-evidence.test.js
```

## Promotion rule

The files in this directory never authorize production. A future production release requires an exact reviewed source SHA, passing exact-head CI, exact staging evidence, backend compatibility, recovery evidence, and separate recorded authorization. Promotion must then be followed by production-domain and runtime readback.
