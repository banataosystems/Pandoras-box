---
name: planning-governed-actions
description: "Creates dependency-aware, evidence-bound ProjectOS plans. Use before any connected write, provider mutation, deployment, release, database change, approval-sensitive action, or multi-step implementation."
---

# Planning Governed Actions

## Outcome

A bounded plan with exact inputs, risks, dependencies, acceptance proof, rollback, and one-time execution semantics.

## Use when

- A connected write or provider mutation is needed.
- Work spans multiple tools or proof gates.
- A sensitive task must be separated from approval and execution.

## Workflow

1. Recover current project state and select the exact target.
2. Classify risk, reversibility, cost, regulatory exposure, and required authority.
3. Define dependencies, payload identity, idempotency, time bounds, acceptance proof, and rollback or forward-recovery path.
4. Use the narrowest allowlisted tool and scope.
5. Create the durable plan without treating plan creation as approval or execution.

## Proof required

- Plan payload hash and exact target.
- Dependency and risk classification.
- Acceptance and rollback criteria.

## Stop conditions

- Required proof, permissions, or rollback are missing.
- The requested scope is broader than necessary.
- The operation is destructive, regulated, paid, or public without the required owner gate.

## Outputs

- `durable-plan`
- `risk-assessment`
- `acceptance-contract`
- `rollback-contract`
