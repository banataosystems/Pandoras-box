---
name: managing-portfolio-priorities
description: "Coordinates priorities across many Pandora-managed projects without losing project-specific authority. Use for control-tower scheduling, worker allocation, dependency conflicts, and portfolio-wide next actions."
---

# Managing Portfolio Priorities

## Outcome

A bounded portfolio queue that maximizes customer value and evidence while preserving each project’s source, permissions, proof gates, and active lineage.

## Use when

- Multiple projects or workers compete for attention.
- A shared provider, reviewer, or release gate is constrained.
- The owner asks for top priorities across the portfolio.

## Workflow

1. Recover each relevant project independently from Pandora and current providers.
2. Normalize goals, phase, blockers, proof gaps, customer value, risk, cost, and dependencies without inventing percentages.
3. Identify shared bottlenecks and tasks that unlock multiple projects.
4. Allocate workers to non-overlapping lanes with immutable review identities and explicit exclusions.
5. Publish one ranked queue, per-project next action, and conditions that would change the ranking.

## Proof required

- Per-project context freshness.
- Dependency graph and ranking factors.
- Worker lane and non-overlap map.

## Stop conditions

- Project states are stale or cannot be resolved.
- A shared action would widen provider scope unsafely.
- Ranking is based on feature count or unsupported revenue forecasts.

## Outputs

- `portfolio-priority-queue`
- `worker-allocation`
- `cross-project-dependency-map`
