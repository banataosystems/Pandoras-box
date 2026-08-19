---
name: running-evaluations-and-experiments
description: "Runs controlled evaluations for agents, skills, models, prompts, workflows, and product hypotheses. Use before rollout, after regressions, or when comparing quality, cost, latency, and reliability."
---

# Running Evaluations and Experiments

## Outcome

Reproducible evidence with representative cases, baselines, acceptance thresholds, failure analysis, and no leakage between test and production claims.

## Use when

- A model, skill, agent, or workflow changes.
- A product or business hypothesis needs a bounded experiment.
- A claimed improvement needs controlled comparison.

## Workflow

1. State the hypothesis, target population, baseline, metric, guardrails, and kill criteria.
2. Build representative normal, edge, adversarial, privacy, and failure cases.
3. Freeze inputs, versions, tools, model settings, environment, and scoring method.
4. Run repeated comparisons and measure outcome success, cost, latency, retries, and safety.
5. Analyze failures and record whether evidence supports rollout, iteration, or rejection.

## Proof required

- Evaluation set and version.
- Baseline/candidate results with uncertainty.
- Failure taxonomy and rollout verdict.

## Stop conditions

- The evaluation is trained on its own answer key.
- A small synthetic test is represented as customer outcome evidence.
- The experiment risks production, spend, or protected data without authorization.

## Outputs

- `evaluation-suite`
- `experiment-report`
- `rollout-verdict`
