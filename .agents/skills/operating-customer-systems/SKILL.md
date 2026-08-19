---
name: operating-customer-systems
description: "Operates deployed customer systems with governed changes, support, backups, freshness, permissions, and service objectives. Use after production verification for ongoing runtime responsibility."
---

# Operating Customer Systems

## Outcome

A repeatable operating model that keeps customer outcomes working without making the control plane a fragile public-runtime dependency.

## Use when

- A customer system enters ongoing service.
- Updates, support, access changes, or runtime automations are needed.
- Enterprise operational evidence is required.

## Workflow

1. Define ownership, service objective, support channel, maintenance window, backup, recovery, access, retention, and cost responsibility.
2. Monitor outcome health and dependencies while keeping customer runtime independently resilient.
3. Route changes through exact plans, approvals, testing, deployment, and production verification.
4. Schedule freshness, dependency, access, and recovery checks.
5. Record incidents, customer-impact windows, corrections, and recurring failure patterns.

## Proof required

- Operating runbook.
- Service and access evidence.
- Backup/recovery and maintenance records.

## Stop conditions

- Support or runtime commitments exceed authorized terms.
- Backups or recovery are unproven.
- A public runtime depends synchronously on unavailable control-plane services.

## Outputs

- `operating-runbook`
- `service-evidence`
- `maintenance-ledger`
