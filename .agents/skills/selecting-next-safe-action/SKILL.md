---
name: selecting-next-safe-action
description: "Chooses the highest-value safe unblocked action from current evidence. Use after state recovery, at phase transitions, when work is blocked, or when multiple tasks compete for attention."
---

# Selecting the Next Safe Action

## Outcome

One ranked action that maximizes evidence or customer value without bypassing cost, security, regulatory, or release gates.

## Use when

- A worker or control tower needs the next action.
- The roadmap contains multiple open tasks.
- A blocker changes the feasible sequence.

## Workflow

1. Enumerate active goals, blockers, dependencies, proof gaps, and reversible actions.
2. Score candidates by customer value, uncertainty reduction, dependency leverage, risk, cost, and reversibility.
3. Reject feature quantity, roadmap theater, and actions that cannot produce meaningful evidence.
4. Choose one action and state why alternatives are deferred.
5. Convert the action into a governed plan when it includes writes.

## Proof required

- Current context and task denominator.
- Decision factors and rejected alternatives.
- Clear proof that would result from the action.

## Stop conditions

- No safe action is available without owner input.
- The candidate requires new spending, destructive change, or regulated activation.
- The underlying state is stale or conflicted.

## Outputs

- `one-best-next-action`
- `deferred-options`
- `evidence-target`
