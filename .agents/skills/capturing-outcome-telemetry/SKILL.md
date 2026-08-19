---
name: capturing-outcome-telemetry
description: "Captures structured learning signals from intent through accepted production outcome. Use when instrumenting builds, agents, tests, deployments, corrections, costs, and customer acceptance."
---

# Capturing Outcome Telemetry

## Outcome

Privacy-safe outcome data that supports evaluation, orchestration improvement, and economics without treating raw prompts or customer content as the moat.

## Use when

- A workflow can produce reusable learning signals.
- Pandora needs task success, correction, deployment, or cost evidence.
- A model or agent evaluation requires real outcome labels.

## Workflow

1. Define the minimal sequence: intent class, plan, action/diff, tests, failures, corrections, deployment, production behavior, acceptance, latency, and cost.
2. Use stable project/task/artifact identities without unnecessary personal or customer content.
3. Separate operational evidence, analytics, and model-training authorization.
4. Apply consent, retention, access, deletion, and tenant-isolation controls.
5. Validate completeness, schema version, provenance, and no-secret capture.

## Proof required

- Telemetry schema and data classification.
- Privacy/authorization review.
- Sample lineage from intent to accepted outcome.

## Stop conditions

- Customer confidential content is collected without authorization.
- Operational logs are silently repurposed for training.
- Outcome labels cannot be distinguished from model guesses.

## Outputs

- `outcome-telemetry-schema`
- `privacy-controls`
- `lineage-sample`
