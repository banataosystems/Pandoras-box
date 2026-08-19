---
name: monitoring-runtime-and-costs
description: "Monitors customer outcomes, runtime health, AI/provider usage, retries, support burden, and variable COGS. Use after deployment and continuously for active systems."
---

# Monitoring Runtime and Costs

## Outcome

Privacy-safe observability that connects reliability and cost to successful customer outcomes rather than raw activity.

## Use when

- A system is deployed or operating.
- Runtime errors, latency, cost, or retries need investigation.
- Gross-margin or SLA evidence is required.

## Workflow

1. Define outcome, health, security, reliability, AI, integration, and cost signals with bounded retention.
2. Instrument exact deployment/source/environment identity and correlation without logging secrets or protected payloads.
3. Track cost per successful task, retries, fallbacks, runtime executions, infrastructure COGS, and variable support.
4. Set alerts, budgets, anomaly thresholds, and incident links.
5. Review signal quality and distinguish aggregate snapshots from complete production proof.

## Proof required

- Observability schema and privacy review.
- Bounded health/cost dashboards or reports.
- Alert tests and source/deployment binding.

## Stop conditions

- Telemetry includes secrets, message contents, or unnecessary personal data.
- Costs cannot be attributed to outcomes.
- Non-atomic aggregates are represented as complete truth.

## Outputs

- `runtime-observability`
- `cost-observability`
- `alert-policy`
