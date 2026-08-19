---
name: managing-dependencies-and-supply-chain
description: "Controls software dependencies, build tools, actions, lockfiles, SBOMs, and provenance. Use for upgrades, new packages, CI actions, build/runtime changes, or vulnerability remediation."
---

# Managing Dependencies and Supply Chain

## Outcome

A reproducible dependency set with pinned provenance, risk review, clean install evidence, and bounded upgrade or rollback.

## Use when

- A dependency or build tool changes.
- A security advisory or runtime warning appears.
- CI uses mutable third-party actions or unpinned environments.

## Workflow

1. Identify the exact dependency path, version, maintainer, license, advisory, and runtime need.
2. Prefer minimal dependencies and immutable pins where security boundaries depend on them.
3. Update lockfiles deterministically and generate or refresh SBOM evidence.
4. Run clean install, build, tests, and production dependency audit on the exact candidate.
5. Preserve the prior lockfile and rollback compatibility.

## Proof required

- Dependency diff and provenance.
- Clean-install/build/test/audit results.
- SBOM and rollback plan.

## Stop conditions

- A package requires unsafe install scripts or unclear provenance.
- The upgrade cannot be reproduced from lockfile.
- A vulnerability is hidden by weakening the audit gate.

## Outputs

- `dependency-change`
- `sbom`
- `supply-chain-review`
- `rollback-anchor`
