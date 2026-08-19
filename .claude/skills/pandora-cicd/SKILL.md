---
name: pandora-cicd
description: "Author and review CI/CD pipelines with exact-SHA discipline, trusted checks, deterministic builds, and least-privilege permissions. Load when creating or changing GitHub Actions workflows, when CI is failing or misconfigured, when a required check needs verifying, or when reviewing pipeline security. Covers script-injection risk, action pinning, and binding release evidence to exact commits."
---

# Pandora CI/CD

CI is a privileged execution environment that runs on every push. Treat a workflow file with the same suspicion as production code with elevated credentials — because that is exactly what it is.

## Exact-SHA discipline

Every run must be attributable to an exact commit.

- Check out the exact SHA under test, not a branch reference that may have moved between trigger and checkout.
- Record run ID, job ID, suite ID, and the head SHA in evidence.
- When verifying a check as proof, confirm its head SHA equals the candidate SHA. A green check on an ancestor commit proves nothing about the candidate.

## Trusted checks

Not every green check is a gate. A check counts as a gate when it is a **required** check, produced by the **expected app**, running on the **exact SHA**, and its failure actually blocks.

Verify all four. A required check produced by an unexpected app is a supply-chain finding, not a curiosity — anyone who can register an app that satisfies a required check name can satisfy your gate.

## Workflow security

**Script injection** is the top risk. Interpolating untrusted input — PR titles, branch names, issue bodies, commit messages — directly into a `run:` block executes attacker-controlled shell. Pass untrusted values through environment variables and quote them; never interpolate into shell directly.

**Permissions.** Set `permissions:` explicitly at the least level needed. Default-broad tokens hand every workflow write access to everything.

**Pin actions to full commit SHAs**, not tags. Tags move; a compromised tag is a supply-chain compromise with your credentials.

**Untrusted triggers.** `pull_request_target` runs with secrets in the base repository's context against a fork's code. Understand exactly why before using it; prefer `pull_request` for anything touching untrusted code.

**Secrets** are never echoed, never written to artifacts or logs, and never exposed to workflows that untrusted contributors can trigger.

## Deterministic builds

Same input, same output. Lockfiles committed and installed with the frozen/CI flag. Pinned toolchain versions — a floating major version means a build that succeeded yesterday can fail today with no source change, which is both a reliability defect and a reproducibility one. Pinned base images by digest.

Record the toolchain versions actually used in release evidence. A build you cannot reproduce is a rollback you cannot perform.

## Structuring pipelines

Fast feedback first: lint and typecheck before the long test suite. Fail early. Run independent jobs in parallel. Cache dependencies keyed on the lockfile hash.

Produce artifacts with recorded identity — name, hash, and the source SHA they were built from. That binding is what makes a deployment verifiable later.

## Reviewing a workflow change

Check: what triggers it, and can an untrusted party trigger it · what permissions it grants · whether untrusted input reaches shell · whether actions are SHA-pinned · what secrets it can see · whether it can mutate anything, and whether that mutation is governed · whether it weakens an existing gate.

That last one deserves attention: a change that makes a required check optional, adds `continue-on-error`, or narrows what a test suite runs is a gate weakening. It may be legitimate — but it is never incidental, and it should never pass review unremarked.

## When CI fails

Diagnose before re-running. Distinguish: a real failure in the change · a failure unrelated to the change (reproduces on base) · an infrastructure failure before any test ran (checkout, install, runner loss).

Re-run only for the third case, or when the suite passed earlier on this exact commit — and at most once. A second failure is real. **Never skip, disable, or quarantine a test to get green, and never push an empty commit to kick CI.**

## Output

```
WORKFLOW      <name> · triggers <events>
PERMISSIONS   <granted scopes>
SECURITY      injection: <ok|finding> · pinning: <ok|finding> · secret exposure: <ok|finding>
DETERMINISM   lockfile: <bool> · toolchain pinned: <bool>
CHECKS        <name>: required <bool> · app <id> · on sha <sha>
RESULT        <run id> · <conclusion> · <pass>/<total>
PROOF STATE   <stage>
```

## Handoff

Test design → `pandora-testing`.
Pipeline security depth → `pandora-security-review`.
Release gating → `pandora-deployment-release`.
