# Protected-main provider application bootstrap

This document separates two proofs that were previously conflated.

## 1. Provider-control conformance

GitHub may be configured now with a bounded, reversible, repository-scoped bootstrap policy:

- pull request required;
- one approval;
- stale approvals dismissed;
- approval after the latest push;
- exact-head `node24` status check pinned to GitHub Actions App ID `15368`;
- conversations resolved;
- administrator enforcement;
- linear history;
- force pushes and deletion disabled;
- empty `bypass_pull_request_allowances` for users, teams, and apps;
- squash-only repository merge settings;
- read-only default Actions workflow permissions and no Actions review approval.

The bootstrap check already exists on current `main`, runs on every pull request, checks out the exact pull-request head, and asserts the checked-out SHA. It is deliberately temporary: it remains candidate-modifiable until the trusted default-branch evaluator is independently reviewed and lands.

The bootstrap validator consumes GitHub's actual response objects. In particular, it normalizes `enforce_admins: {"enabled": true}` and the other `{enabled: ...}` branch-control wrappers, and it reads `required_pull_request_reviews.bypass_pull_request_allowances.{users,teams,apps}`. Missing, malformed, or nonempty bypass allowances fail closed.

## 2. Operational valid-path readiness

Provider controls being active does not prove that a legitimate PR can currently complete. The repository still needs a qualifying non-author reviewer and the trusted default-branch evaluator. Until those exist:

- provider-applied may be true after exact provider readback;
- valid-path production verification remains false;
- merges remain fail-closed;
- no bypass is permitted or required.

The machine evaluator and adversarial tests prove the intended normal path structurally: a current-base, non-draft PR with a successful exact-head app-bound check, resolved conversations, and a current-head approval submitted after the latest push by an eligible identity other than the author and latest pusher passes without any bypass actor. Self-review, stale review, latest-pusher approval, pre-push approval, wrong app/head, unresolved conversations, or any bypass allowance fails.

## Migration to steady state

After an eligible independent reviewer exists and the trusted evaluator is present on the default branch, replace the bootstrap required check with `Trusted protected-main exact-head gate`. That migration requires a new exact-head independent review, provider mutation plan, and post-write readback. It does not authorize merging this governance PR or releasing production.
