---
name: governing-regulated-features
description: "Applies legal, regulatory, partner, security, operational, and owner gates to high-risk functionality. Use for money movement, investments, property brokerage, health, legal commitments, identity, hiring, payments, or sensitive personal data."
---

# Governing Regulated Features

## Outcome

A capability that remains technically isolated and non-activatable until every required authority and proof gate is recorded.

## Use when

- A feature touches a regulated or legally consequential domain.
- A technically working flow is proposed for production activation.
- A partner, license, KYC, payment, or public commitment is involved.

## Workflow

1. Identify jurisdiction, activity, actors, money/data flows, and whether Pandora or the customer is performing a regulated function.
2. Separate technical capability from legal authorization and production activation.
3. Define required counsel, licenses, partner agreements, identity/KYC, security, operations, monitoring, support, and owner approvals.
4. Implement deny-by-default feature flags and environment gates with no bypass by normal operators or agents.
5. Verify authorized test mode and unauthorized production denial.

## Proof required

- Regulatory and partner gate matrix.
- Fail-closed activation control.
- Authorized test evidence and negative production test.

## Stop conditions

- Legal or regulatory requirements are unresolved.
- A partner or license is being claimed without provider evidence.
- Production activation lacks explicit owner authorization.

## Outputs

- `regulated-gate-matrix`
- `activation-control`
- `authorization-record`
