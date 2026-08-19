---
name: reviewing-code-independently
description: "Performs exact-head independent review of correctness, security, privacy, database, release, and evidence claims. Use before landing meaningful work and whenever policy requires a different reviewer or vendor."
---

# Reviewing Code Independently

## Outcome

A verdict bound to one immutable head, with reproducible findings and no author self-approval.

## Use when

- A meaningful PR requests review.
- A prior verdict was invalidated by head movement.
- Security, database, release, or governance gates require independence.

## Workflow

1. Freeze and re-read the exact repository, PR, head SHA, parent, tree, changed files, and active review scope.
2. Review source and recompute critical claims rather than trusting summaries or checkers.
3. Inspect authorization, data isolation, retries, provider side effects, tests, deployment/recovery evidence, and bypass paths.
4. Verify CI checked out the literal head and that fixtures are faithful to real provider shapes.
5. Submit PASS, PASS with non-blocking findings, or FAIL only for that immutable head.

## Proof required

- Exact-head identity and diff.
- Independent recomputation or replay.
- Provider/source parity where claimed.
- Verdict and severity-ranked findings.

## Stop conditions

- The head moved.
- The reviewer authored or materially implemented the candidate where independence is required.
- Evidence is inaccessible or provider state cannot be bound to source.

## Outputs

- `independent-review-verdict`
- `finding-register`
- `review-evidence`
