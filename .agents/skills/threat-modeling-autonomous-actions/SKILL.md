---
name: threat-modeling-autonomous-actions
description: "Threat-models agent plans, tool calls, retries, approvals, and provider side effects. Use before enabling autonomous writes, repair loops, bulk actions, or multi-agent delegation."
---

# Threat Modeling Autonomous Actions

## Outcome

A bounded autonomy contract that prevents self-approval, unbounded scope, unsafe replay, secret leakage, and ambiguous side-effect duplication.

## Use when

- An agent gains a new tool or mutation capability.
- A retry or repair loop is introduced.
- Bulk or delegated execution is proposed.

## Workflow

1. Map planners, approvers, executors, reviewers, tools, providers, identities, and trust boundaries.
2. Enumerate prompt injection, confused deputy, scope escalation, replay, race, duplicate mutation, output poisoning, and audit tampering threats.
3. Define allowlists, budgets, batch bounds, claims, idempotency, reconciliation, and human gates.
4. Test wrong identity, stale plan, changed payload, moving head, unavailable provider, post-dispatch failure, and malicious content.
5. Require independent review for meaningful autonomy expansion.

## Proof required

- Autonomy threat model.
- Adversarial test matrix.
- Tool-scope and approval policy.

## Stop conditions

- The agent can mutate outside an exact project/resource allowlist.
- Provider outcome ambiguity allows blind retry.
- The builder can satisfy its own review or release gate.

## Outputs

- `autonomy-contract`
- `adversarial-tests`
- `tool-policy`
