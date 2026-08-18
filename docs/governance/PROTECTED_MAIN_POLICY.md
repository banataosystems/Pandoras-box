# Protected `main` governance — Pandora / MCPMaster

## Scope and current classification

This contract governs only `banataosystems/Pandoras-box` (`repository_id: 1326729533`) and its canonical `main` branch. It does not authorize a feature merge, Vercel promotion, database migration, mobile release, or production application release.

Current proof ladder:

- documented: yes;
- implemented: on `governance/protected-main-enforcement` only;
- candidate-tested: required before every revision is reported;
- independently accepted: no;
- provider-applied: no;
- production-verified: no.

The source policy deliberately sets `provider_application_allowed: false`. A provider-ready payload is not an execution authorization.

The original live baseline is preserved in `docs/governance/evidence/GITHUB_GOVERNANCE_BASELINE_2026-08-19.json`. A separate immutable review/remediation record is in `docs/governance/evidence/INDEPENDENT_REVIEW_REMEDIATION_2026-08-19.json`.

## Why application is blocked

At the last provider observation, `main@c2cc635383b78d457d1731294a6f5b306d85f6be` was unprotected and all merge methods were enabled. The only provider-verified GitHub identity was also the pull-request author. GitHub does not permit self-approval, so applying one required approval plus administrator enforcement before a second qualifying reviewer exists would deadlock the normal landing path.

Additional bootstrap blockers are explicit in `.github/governance/main-policy.json`:

1. no provider-verified non-author reviewer;
2. the trusted evaluator is not yet on the default branch;
3. the exact trusted custom-check App identity has not been read back on a harmless test PR;
4. current `main` still contains unreconciled write-capable recovery workflows;
5. fresh Administration-read provider capture is unavailable through the failing Pandora GitHub transport;
6. any merge to `main` is production-sensitive.

No control may be described as provider-applied while any blocker remains.

## Normal landing path

The intended normal path is:

1. dedicated branch;
2. pull request;
3. exact-head candidate proof;
4. trusted default-branch evaluation;
5. at least one qualifying approval;
6. stale approvals dismissed after new commits;
7. approval after the latest push by someone other than that pusher;
8. all conversations resolved;
9. current-base integration;
10. squash merge.

For governance-critical paths, the trusted evaluator additionally requires an `APPROVED` review whose `commit_id` equals the exact current head and whose reviewer is a provider-verified, registered, non-author governance reviewer.

## Two-layer exact-head checks

### Candidate proof

`.github/workflows/protected-main-governance-candidate.yml` runs on every pull request without path filters. It checks out the exact head, asserts the checkout, and reports `Governance candidate exact-head proof` after:

- governance contract tests;
- realistic raw-provider normalization tests;
- trusted-evaluator regression tests;
- complete ProjectOS/core checks and regression tests;
- conditional mobile proofs when mobile-critical paths change.

The production dependency audit remains visible but informational so a newly published advisory cannot silently deadlock unrelated source changes before a deterministic remediation decision is made.

Candidate code executes only with `contents: read`, no repository secrets, no persisted Git credentials, and immutable Action pins.

### Trusted gate

`.github/workflows/protected-main-governance.yml` is trusted only after it exists on the default branch. It resolves and checks out the current default branch at run start on `pull_request_target`, `pull_request_review`, and completion of the candidate workflow, records that exact trusted SHA, and refuses to treat the candidate head as trusted source. It never checks out or executes pull-request source.

The trusted workflow grants only:

- `contents: read`;
- `pull-requests: read`;
- `checks: write`.

It reads provider metadata, exact-head reviews, changed paths, check runs, and the default-branch candidate workflow identity. It then creates or updates a custom check run named `Trusted protected-main exact-head gate` directly on the PR head. Branch protection binds that context to GitHub Actions App ID `15368` rather than accepting any actor that can forge the same text context.

Before protection is applied, a harmless test PR must prove the exact check-run App identity and workflow provenance through fresh provider readback.

## High-risk governance review

The reviewer registry is `.github/governance/reviewer-registry.json`. It is intentionally empty and blocked until a real non-author collaborator with qualifying review access is provider-verified. CODEOWNERS is not fabricated because routing work to the author would not create independence.

Protected paths include:

- `.github/branch-protection/`;
- `.github/governance/`;
- both protected-main workflows;
- the trusted evaluator and all provider-capture model, validation, and CLI modules;
- governance regression tests.

A changed head invalidates old review evidence. A review by the author, an unregistered identity, or a review bound to another commit cannot satisfy the trusted gate.

## Provider payload and personal-repository capability

`.github/branch-protection/main.json` is the candidate classic branch-protection payload. It requires:

- strict checks;
- the app-bound trusted check;
- one approval;
- stale-review dismissal;
- latest-push approval;
- explicit empty bypass allowances;
- conversation resolution;
- administrator enforcement;
- linear history;
- no force pushes;
- no deletion of `main`;
- no branch lock or fork-sync exception.

The repository is user-owned, not organization-owned. GitHub does not support user/team dismissal restrictions or push restrictions for personal repositories in the same way as organization-owned repositories. The payload therefore omits dismissal restrictions and sets push restrictions to `null`; provider normalization verifies the raw owner type and rejects any nonempty dismissal or bypass actor list rather than defaulting missing data to safe values.

## Raw provider capture and drift detection

`scripts/check-github-governance-provider.mjs` does not accept a hand-normalized governance document as proof. With a bounded Administration-read token, it fetches and preserves raw responses for:

- repository metadata and merge settings;
- `main` branch metadata;
- branch protection;
- pull-request review protection;
- Actions repository permissions;
- default workflow permissions;
- rulesets;
- collaborators and reviewer capacity;
- candidate and trusted workflow identities;
- exact-head check runs.

The raw payload is content-hashed, endpoint URLs and statuses are validated, real GitHub `{ enabled: boolean }` wrappers are normalized in code, and the normalized result remains bound to the raw hash. The test-PR head used for check-run proof is deliberately independent from the current `main` SHA. Missing bypass data, wrong App identity, stale evidence, active conflicting rulesets, absent reviewer capacity, reviewer-registry/provider mismatch, unsafe merge settings, or any failed endpoint is a validation failure.

The capture requires a token with at least Administration read, Actions read, Checks read, and Metadata read. Credentials are never written to evidence. Provider application also requires the source-controlled reviewer registry to be open, timestamped, and matched exactly to at least one qualifying non-owner collaborator returned by GitHub.

## Actions write exceptions and active-lane isolation

Current `main` contains three recovery workflows with write-capable or floating-ref behavior. Their exact paths, blobs, triggers, permissions, and risks are recorded in `.github/governance/actions-write-exceptions.json`.

Those files are owned by the active mobile/integration lane in PR #53. Worker 3 does not modify them. Provider application remains blocked until that lane’s independently reviewed remediation, or an equivalent coordinated change, is on current `main`, followed by a Worker 3 rebase and fresh review.

The only intended future write exceptions are manual-dispatch workflows that can create isolated recovery branches, use immutable Action pins, expose no secrets to PR code, and cannot push to `main`. Pull-request-triggered repository writes are prohibited.

## Merge history and release boundary

The intended repository policy is squash-only:

- merge commits disabled;
- squash enabled;
- rebase disabled;
- linear history required;
- update-branch enabled;
- automatic branch deletion disabled.

Provider evidence proves that current `main` commits can produce both staging and production Vercel deployments. Therefore merging governance source is itself release-sensitive. This lane does not merge the PR merely to bootstrap governance.

## Safe bootstrap sequence

The minimum safe sequence is:

1. provider-verify a second qualifying reviewer and update the registry through reviewed source;
2. resolve the active-lane recovery-workflow dependency on exact current `main`;
3. rebase this governance branch without rewriting evidence and rerun exact-head CI;
4. obtain a new independent review on that exact head;
5. separately satisfy the production-sensitive release gate for landing governance source;
6. land the trusted workflow through the controlled path;
7. open a harmless test PR and prove both candidate and trusted checks on its exact head;
8. capture raw provider state with Administration-read authority and verify the GitHub Actions App ID;
9. create a new bounded provider mutation plan from the final reviewed payload;
10. apply repository-scoped settings, immediately read them back, and run the raw-provider validator;
11. verify an unsafe PR cannot merge and a valid reviewed exact-head PR remains possible, without releasing an application merely for testing.

The earlier unapproved provider plan is superseded by this review remediation and must not be executed.

## Break-glass

No normal bypass actor exists. A true emergency requires a separate audited provider-policy change and must preserve:

- incident identifier;
- exact before state;
- bounded mutation plan;
- owner authorization;
- exact after state;
- restoration readback;
- post-incident review.

Failed CI, missing review, or convenience is not an emergency.
