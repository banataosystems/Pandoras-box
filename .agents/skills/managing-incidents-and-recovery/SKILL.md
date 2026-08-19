---
name: managing-incidents-and-recovery
description: "Coordinates detection, containment, recovery, communication, and learning for production incidents. Use for security events, outages, data integrity risk, runaway cost, failed releases, or ambiguous provider mutations."
---

# Managing Incidents and Recovery

## Outcome

A controlled incident record with impact bounds, containment, exact recovery action, verification, and durable prevention work.

## Use when

- Production health or customer outcomes are materially impaired.
- Security, privacy, data, or cost exposure is suspected.
- A release or provider action has uncertain effects.

## Workflow

1. Open an incident with severity, exact systems, source/deployments, observation time, and known impact.
2. Contain using the safest reversible action without destroying evidence.
3. Reconcile provider state, data integrity, authorization, and audit lineage.
4. Choose rollback only when exact compatibility is proven; otherwise use bounded forward recovery.
5. Verify recovery through critical journeys, monitor recurrence, and record root cause and follow-up actions.

## Proof required

- Incident timeline and evidence.
- Containment and recovery authorization.
- Post-recovery verification and recurrence monitoring.
- Blameless root-cause and prevention actions.

## Stop conditions

- Impact cannot be bounded.
- Rollback compatibility is unproven.
- Public, legal, or customer communication lacks owner authorization.

## Outputs

- `incident-record`
- `containment-plan`
- `recovery-evidence`
- `post-incident-review`
