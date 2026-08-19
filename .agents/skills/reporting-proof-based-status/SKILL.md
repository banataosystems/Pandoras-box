---
name: reporting-proof-based-status
description: "Reports project status only from current evidence. Use for phase, completion, blockers, deployments, releases, roadmap progress, worker state, or next-action summaries."
---

# Reporting Proof-Based Status

## Outcome

A compact status report that distinguishes each proof stage, explains any denominator, and never upgrades a claim beyond its evidence.

## Use when

- A status or completion question is asked.
- Substantial work concludes.
- A control tower needs worker-state reconciliation.

## Workflow

1. Recover canonical state and newer provider evidence.
2. Organize claims by documented, implemented, tested, deployed, and production-verified.
3. Calculate percentages only from an explicit current roadmap/task/proof denominator.
4. Separate verified facts, source strategy, external evidence, assumptions, and recommendations.
5. Report what changed, evidence, phase, done, in progress, blocked, risks, and next autonomous action.

## Proof required

- Fresh context and provider references.
- Explicit denominator for any percentage.
- Proof-stage labels for every completion claim.

## Stop conditions

- Freshness is inadequate for the requested claim.
- A percentage would require invented tasks or weights.
- The report would conceal contradictory evidence.

## Outputs

- `proof-status-report`
- `completion-denominator`
- `blocker-summary`
