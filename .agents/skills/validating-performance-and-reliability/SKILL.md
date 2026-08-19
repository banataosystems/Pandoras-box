---
name: validating-performance-and-reliability
description: "Validates latency, throughput, availability, failure isolation, retries, rate limits, and recovery. Use before scale, after runtime incidents, or when integrations and AI workloads add variable behavior."
---

# Validating Performance and Reliability

## Outcome

Measured reliability against explicit service objectives, with bounded degradation and no hidden manual rescue.

## Use when

- A release changes runtime behavior or scale.
- Provider latency, errors, or cost spikes are possible.
- An SLA or enterprise reliability claim is considered.

## Workflow

1. Define critical journeys, service objectives, traffic model, budgets, and dependency failure modes.
2. Load and soak test representative paths without harming production.
3. Exercise timeout, rate-limit, partial outage, retry, circuit-breaker, queue, and backpressure behavior.
4. Measure end-to-end success, latency percentiles, error budgets, and recovery time.
5. Verify observability and rollback or forward-recovery under failure.

## Proof required

- Test environment and workload identity.
- Latency, throughput, error, and recovery results.
- Known limits and capacity assumptions.

## Stop conditions

- Testing could disrupt production or incur unapproved cost.
- Synthetic success is being represented as real customer reliability.
- Critical dependencies lack bounded failure behavior.

## Outputs

- `reliability-report`
- `capacity-envelope`
- `failure-mode-evidence`
