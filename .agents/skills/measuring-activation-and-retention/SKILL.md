---
name: measuring-activation-and-retention
description: "Measures whether customers reach useful outcomes and continue using deployed systems. Use after pilot or product use begins and before claims of product-market fit or scale."
---

# Measuring Activation and Retention

## Outcome

Cohort evidence for activation, D30/D90 retention, repeat builds, active deployed systems, expansion, and churn.

## Use when

- Users have begun real product or pilot use.
- A retention or product-market-fit claim is proposed.
- Acquisition or enterprise investment is being considered.

## Workflow

1. Define activation as a customer-useful result, not signup or generation.
2. Build privacy-safe cohorts with clear inclusion dates and denominators.
3. Measure time to first useful result, first deployment, ongoing runtime use, repeat work, expansion, churn, and failure.
4. Distinguish product retention from a public site merely remaining online.
5. Report confidence limits and missing follow-up windows.

## Proof required

- Cohort definitions and denominators.
- D30/D90 or available-window results.
- Activation and continued-value evidence.

## Stop conditions

- Telemetry is not consented or cannot be privacy-safe.
- The observation window is too short for the claimed metric.
- Synthetic or internal usage is being represented as customer retention.

## Outputs

- `activation-cohorts`
- `retention-report`
- `churn-and-expansion-ledger`
