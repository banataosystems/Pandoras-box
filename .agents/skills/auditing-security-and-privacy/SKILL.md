---
name: auditing-security-and-privacy
description: "Audits threat boundaries, authorization, secrets, tenant isolation, data minimization, retention, logs, dependencies, and provider exposure. Use before meaningful release, after security findings, or when sensitive data flows change."
---

# Auditing Security and Privacy

## Outcome

A risk-ranked, evidence-backed security and privacy assessment with fail-closed remediation gates.

## Use when

- A new data flow, integration, agent, or release is proposed.
- A vulnerability, advisor warning, or authorization defect is found.
- Customer or regulated data may be processed.

## Workflow

1. Inventory assets, actors, trust boundaries, data classes, entry points, privileges, and dependencies.
2. Verify least privilege, tenant isolation, RLS/equivalent, secret handling, input/output bounds, logging, retention, and deletion controls.
3. Test abuse cases, cross-tenant access, replay, injection, SSRF, supply-chain, and provider-output trust as relevant.
4. Distinguish theoretical findings from confirmed reachable paths.
5. Require exact remediation, negative tests, independent review, and post-fix readback for blockers.

## Proof required

- Threat model and asset inventory.
- Positive and negative authorization evidence.
- Finding severity, exploitability, impact, and remediation proof.

## Stop conditions

- A critical path cannot be safely tested.
- Protected data would be exposed in evidence.
- A blocker is being downgraded to meet a schedule.

## Outputs

- `security-review`
- `privacy-review`
- `finding-register`
- `release-gates`
