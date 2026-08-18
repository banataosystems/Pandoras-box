# Protected `main` governance — Pandora / MCPMaster

## Scope

This contract governs `banataosystems/Pandoras-box` (`repository_id: 1326729533`) and only its canonical `main` branch. It does not authorize a feature merge, Vercel promotion, database migration, mobile release, or production application release.

The live provider baseline captured on 2026-08-19 is stored at:

- `docs/governance/evidence/GITHUB_GOVERNANCE_BASELINE_2026-08-19.json`

At that observation, `main@c2cc635383b78d457d1731294a6f5b306d85f6be` was provider-reported as unprotected, all three merge methods were enabled, and the authenticated owner identity had administrative push access. This source contract does not claim provider enforcement until a post-mutation GitHub readback passes `scripts/check-github-governance-provider.mjs`.

## Required path

The only normal landing path is:

1. dedicated branch;
2. pull request;
3. exact-current-head required gate;
4. at least one qualifying approval;
5. fresh approval after the latest push by someone other than that pusher;
6. all review conversations resolved;
7. current-base integration;
8. squash merge.

The required status context is `Protected main exact-head gate`. Its workflow runs on every pull request without path filters and aggregates:

- governance-contract validation;
- the complete Node/ProjectOS source check, test, and production dependency audit;
- a conditional but always-reporting Flutter proof for mobile-critical changes.

A check on an older SHA is not evidence for a newer SHA.

## Provider policy

`.github/branch-protection/main.json` is the exact classic branch-protection payload. `.github/governance/main-policy.json` adds repository and Actions settings that are enforced by separate repository-scoped API mutations.

Expected controls:

- pull request required;
- one approval;
- stale approval dismissal;
- latest-push approval;
- conversation resolution;
- strict required checks;
- administrator enforcement;
- linear history;
- no force pushes;
- no deletion of `main`;
- no bypass actors;
- squash-only merge policy;
- read-only default `GITHUB_TOKEN`;
- workflows cannot approve pull-request reviews.

`require_code_owner_reviews` remains false. No real independent CODEOWNER team or reviewer identity has been verified, and a self-owned CODEOWNERS entry would route work without creating independence. The approval requirement therefore remains a real operational gate until a qualifying reviewer is available.

## Exact-head and Actions security

The required workflow:

- checks out the exact PR head or exact pushed commit;
- asserts `git rev-parse HEAD` equals that expected SHA;
- sets `persist-credentials: false`;
- grants only `contents: read`;
- references every Action by immutable 40-hex commit SHA;
- does not use `pull_request_target`;
- does not expose secrets to pull-request code;
- always emits one stable required result.

Repository default workflow permissions are expected to be `read`, with Actions unable to approve pull-request reviews. Recovery workflows that genuinely need write access must continue to declare it explicitly and remain outside the required merge gate.

## Merge and release boundary

Repository settings are expected to allow squash merge only. Squash preserves one PR-to-main landing record, supports linear history, and gives a clear rollback unit. Merge commits and rebase merges are disabled to avoid multiple provenance models.

A merge to `main` is treated as release-sensitive until Worker 4 records current Vercel binding and promotion evidence. Governance becoming valid does not authorize merging an application or mobile candidate.

## Break-glass

No normal bypass actor exists. An emergency requires an explicit, separately audited provider-policy change. The record must include the incident identifier, exact before state, bounded plan, owner authorization, after-state readback, restoration readback, and post-incident review. Failed CI, missing review, or convenience is not an emergency.

## Provider drift verification

After any provider mutation, capture the normalized GitHub state without credentials and run:

```text
node scripts/check-github-governance-provider.mjs <fresh-provider-capture.json>
```

The validator rejects stale captures and drift in protection, review settings, checks, merge methods, Actions defaults, force-push/deletion policy, or bypass state. Its adversarial self-test runs in the required workflow.

## Rollback

Provider settings are reversible, but rollback must not silently weaken normal governance. The pre-change provider readback is preserved in the baseline evidence file. If a protection mutation locks out every qualifying recovery path, restore only the exact prior provider configuration through a bounded audited plan, read it back, preserve the failed configuration and error, and open a corrective governance PR.
