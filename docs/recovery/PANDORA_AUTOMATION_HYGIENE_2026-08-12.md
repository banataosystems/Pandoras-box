# Pandora automation hygiene — 2026-08-12

## Scope

This change consolidates the Pandora release-candidate checks around durable,
fail-closed workflows. It does not change the owner app, a Supabase project,
an Edge Function deployment, or production.

Base source identity:
`c7744689da37bdb099505f43c8f4a2f526888083`.

## Durable workflows retained

- `flutterflow-unattended.yml`: exact-head owner-app operation through the
  one-time OIDC broker and read-back gates.
- `pandora-owner-api-test.yml`: owner API overlay tests and P1/P2/P3 bounded
  source guards. Exact-head owner-app validation remains the separate
  `operate-project` check on the same commit, avoiding a cross-workflow race.
- `projectos-security.yml`: Node 24 source, test, and production-dependency
  audit checks.

Third-party actions are pinned to exact commits, checkout credentials are not
persisted, and the general source checks run on a fixed Ubuntu 24.04 image.

## One-shot automation retired

The removed workflows and installers were temporary probes, self-installers,
guard writers, recovery publishers, or branch-write checks. Their useful
outputs are already present as ordinary source or preserved evidence. Keeping
them executable would retain unnecessary write-capable or self-mutating paths.

Retired categories:

- owner API diff probes and rerun-adapter installer;
- P1/P2/P3 guard installers and repair jobs;
- SDK/runtime contract probes;
- canonical-source and operational-core recovery publishers;
- GitHub Actions write probe.

The deterministic guard implementations remain in `automation/`, and the
owner rerun adapter remains in the durable unattended workflow path.

## Verified limitation

Exact-head run `31586020676` at
`a9bbfa63d80fd814cda89db7970dc5390dd8f45e` remained blocked before project
access because it had no matching one-time broker grant. Its atomic grant
consumer returned HTTP 200 with no grant, and its separate denial-audit RPC
returned HTTP 403 and persisted no row. The source-only repair now makes that
audit failure explicit and fail-closed; it is not deployed. No owner-app write
or read-back occurred. This cleanup must not be described as provider
validation, deployment, or production verification.

The retained split recovery archive also fails its declared SHA-256 check; see
`recovery/SOURCE_RECOVERY_MANIFEST.md`. It remains forensic evidence only.

GitHub reports `main` as unprotected, required status checks as off, and no
applicable repository rulesets. The owner-app operation is therefore a
release-evidence check, not an externally enforced merge gate. PR #8 must stay
draft and must not be called merge-ready until an exact-head gate is enforced
or an equivalent governed release check is independently proven.
