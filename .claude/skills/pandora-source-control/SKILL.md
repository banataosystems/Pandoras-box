---
name: pandora-source-control
description: "Resolve canonical source state and operate GitHub safely for Pandora projects. Load when working with repositories, branches, commits, pull requests, or workflow runs; when you need the exact head of something; when deciding what is canonical among several repositories or branches; or before binding a review, test, or deployment to source. Enforces exact-SHA identity over moving references."
---

# Pandora Source Control

Branch names, PR numbers, and "latest" are moving references. Reviews, tests, deployments, and evidence must bind to **immutable identity**: commit SHA and tree SHA.

## Canonical source resolution

Before treating any repository as authoritative:

1. **Check the source-authority policy.** `SOURCE_AUTHORITY_POLICY.json` is fail-closed and machine-enforced. Every `mbanatao/*` repository is operationally blacklisted — readable for forensics, hashes, parent lineage, and rollback provenance only. Such a repository must never determine current state, become a default remote, receive new work, or authorize a release.
2. **Confirm against Memory** which repository is canonical for the project.
3. **Verify with the provider** — repository ID, default branch, permissions. Repository ID is stable across renames; the name is not.

Legacy hostnames or deployment metadata naming a blacklisted repository do not make it canonical. Deployment provenance is evidence about history, not authority over the present.

## Exact-head discipline

**A pull request head is not an immutable reviewed candidate.** It moves. Every push replaces it, and a review, a CI run, or an approval that was true of the old head says nothing about the new one.

Whenever identity matters:

- Capture the exact head SHA **and** tree SHA at the moment of observation.
- Bind every artifact — review, test run, deployment, evidence record — to that SHA.
- Re-verify the head before acting on a prior conclusion. If it moved, the conclusion is stale and the work must be redone against the new head.

Tree SHA is the stronger claim. Two commits with different SHAs and the same tree SHA have identical content; a rebase changes commit identity while preserving content. When asserting "this is the same code that was reviewed", tree SHA is the honest instrument.

Record for any candidate: repository · exact head SHA · tree SHA · parent SHA · base branch and its SHA · ahead/behind counts · changed-file count.

## Verifying CI actually covers the candidate

The common fraud is a green check that ran on a different SHA. For every check you rely on:

- confirm the run's head SHA equals the candidate SHA
- confirm the check is a **required** check, not merely a passing one
- confirm the app that produced it is the expected one — an unexpected app producing a required check is a supply-chain concern
- record run ID, job ID, and suite ID

A check that is green on an ancestor commit is not coverage of the candidate.

## Branch protection

Read and record actual protection state rather than assuming it: required checks (and whether strict), required approvals, stale-review dismissal, last-push approval, admin enforcement, linear history, conversation resolution, force-push and deletion settings, and whether rulesets or classic protection is the enforcement layer.

**Never weaken protection to land work.** If protection blocks a merge, the correct outcomes are to satisfy it or to escalate — not to relax it. Weakening a security control to make a workflow pass is prohibited.

## Mutations

All GitHub mutations go through `pandora-governed-execution`. Note the risk tiers as declared: creating issues and PRs is `write`; **merging a pull request is `destructive`**, as is any DELETE against the repository API.

Merge is classified destructive for good reason — on a protected default branch it can trigger a release and it collapses a reviewed candidate into shared history. Treat it as a gate, not a step.

Never force-push over someone else's branch, and never rewrite history that others may have based work on. On a branch you created, follow the repository's own convention.

## Recovery and provenance

Preserve history; never overwrite evidence to make state look cleaner. When reconstructing source, use content-addressed snapshots: file manifests with SHA-256 per file, an aggregate manifest hash, preserved parent lineage, and a recorded reason for each promotion. A recovery that cannot be independently re-verified is not a recovery.

## Output

```
REPOSITORY    <owner/repo> · id <n> · default <branch>
AUTHORITY     operational | historical_only
HEAD          <sha> · tree <sha> · observed <ts>
CANDIDATE     PR #<n> · head <sha> · tree <sha> · base <sha> · +<n>/-<n> files
CHECKS        <name>: <status> on <sha> · run <id> · required: <bool>
PROTECTION    <actual settings>
PROOF STATE   <stage>
```

## Handoff

Independent review of a candidate → `pandora-exact-head-review`.
Security review → `pandora-security-review`.
Mutation → `pandora-governed-execution`.
Release → `pandora-deployment-release`.
