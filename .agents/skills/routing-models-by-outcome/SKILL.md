---
name: routing-models-by-outcome
description: "Routes AI work across models and deterministic methods by quality, cost, latency, reliability, privacy, context, and policy. Use when model selection affects successful outcomes or COGS."
---

# Routing Models by Outcome

## Outcome

A provider-agnostic routing policy proven on representative tasks and measured per successful outcome.

## Use when

- Multiple models or non-model methods can perform a task.
- AI cost, latency, reliability, or privacy needs improvement.
- A proprietary model investment is proposed.

## Workflow

1. Define task classes, required proof, safety level, latency budget, privacy constraints, and failure cost.
2. Build a representative evaluation set with accepted outcomes and adversarial cases.
3. Compare the cheapest reliable methods first, including deterministic code and retrieval.
4. Implement fallbacks, circuit breakers, budgets, and provider-policy enforcement.
5. Record quality, cost per success, retries, latency, and reasons for routing decisions.

## Proof required

- Controlled evaluation results.
- Cost and latency per successful task.
- Fallback and policy-compliance evidence.

## Stop conditions

- Evaluation data is not representative.
- Customer policy or confidentiality forbids a provider.
- A proprietary model is justified only by competitor behavior.

## Outputs

- `model-routing-policy`
- `evaluation-report`
- `cost-quality-frontier`
