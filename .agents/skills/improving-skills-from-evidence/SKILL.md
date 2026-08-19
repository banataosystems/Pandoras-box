---
name: improving-skills-from-evidence
description: "Updates Pandora skills from observed successes, failures, reviews, incidents, and evaluations. Use when a skill is incomplete, ambiguous, costly, unsafe, or repeatedly corrected."
---

# Improving Skills from Evidence

## Outcome

A versioned skill improvement with exact rationale, regression evals, compatibility, and preserved prior versions.

## Use when

- A skill produces repeated failure or manual correction.
- New provider or policy evidence changes a workflow.
- Coverage gaps are identified.

## Workflow

1. Collect outcome, review, incident, and user-acceptance evidence without exposing protected content.
2. Identify the specific instruction, dependency, proof gate, or tool contract that failed.
3. Change the smallest skill or shared policy surface and preserve prior version/hash.
4. Add or update evaluation cases that reproduce the gap.
5. Run static validation and model/workflow evaluations before activation; record runtime activation separately.

## Proof required

- Skill diff and parent hash.
- Regression evaluation and static validation.
- Compatibility and activation status.

## Stop conditions

- The change weakens a governance gate to improve pass rate.
- Evidence is anecdotal and the change has broad risk.
- A runtime skill is overwritten without recovery history.

## Outputs

- `skill-version`
- `regression-evals`
- `activation-decision`
