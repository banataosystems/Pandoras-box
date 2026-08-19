---
name: managing-approvals-and-risk
description: "Applies risk-based autonomy and approval gates. Use whenever an action could change providers, production, data, spending, security, public commitments, customer obligations, or regulated operations."
---

# Managing Approvals and Risk

## Outcome

A fail-closed decision that authorizes only the exact approved payload and preserves separation between planning, approval, execution, and verification.

## Use when

- A durable plan awaits approval.
- An action crosses a sensitive or destructive boundary.
- A worker proposes to weaken a gate or self-approve.

## Workflow

1. Classify the operation as read, safe reversible write, sensitive write, destructive, regulated, paid, public, or production release.
2. Verify actor authority, project scope, exact payload hash, dependencies, freshness, and one-time claim status.
3. Require owner/admin approval only where policy requires it; never infer approval from chat intent for protected gates.
4. Prevent authors, builders, or moving heads from satisfying independent-review requirements.
5. After approval, execute once and verify the exact result separately.

## Proof required

- Authenticated actor and scope.
- Approved plan ID and payload hash.
- Execution claim and post-action readback.

## Stop conditions

- Approval identity or payload binding is ambiguous.
- The plan changed after approval.
- The operation lacks required independent review, legal gate, or production authorization.

## Outputs

- `approval-decision`
- `risk-gate-record`
- `execution-boundary`
