---
name: verifying-production-outcomes
description: "Proves that an authorized release works for real production journeys and remains within safety, privacy, reliability, and business acceptance. Use after deployment before calling a feature or phase complete."
---

# Verifying Production Outcomes

## Outcome

Production evidence tied to the exact deployed artifact, live dependencies, real authorization boundaries, monitoring, and rollback readiness.

## Use when

- A deployment is READY or promoted.
- A feature, integration, booking, payment, or release is claimed fixed.
- A completion gate requires production verification.

## Workflow

1. Resolve the exact production domain, alias, deployment ID, source SHA, database, and environment.
2. Exercise the critical authorized user journey and required negative paths against that exact artifact.
3. Verify persisted effects, tenant isolation, integrations, monitoring, costs, and no unexpected errors.
4. Confirm rollback or forward recovery remains available and compatible.
5. Record the bounded observation window and avoid claiming unexercised features.

## Proof required

- Exact production artifact and route evidence.
- End-to-end outcome and persistence proof.
- Negative authorization and monitoring results.
- Recovery readiness.

## Stop conditions

- Only build or provider READY evidence exists.
- The journey terminates at protection or cached shell without application runtime.
- Testing would create an unauthorized financial, regulated, or destructive effect.

## Outputs

- `production-verification-pack`
- `acceptance-verdict`
- `open-observation-gaps`
