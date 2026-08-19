---
name: testing-software-end-to-end
description: "Designs and executes layered tests from unit behavior through real user outcomes. Use for every meaningful implementation, repair, migration, integration, or release candidate."
---

# Testing Software End to End

## Outcome

Exact-source evidence covering correctness, authorization, failures, data, integrations, UX, deployment behavior, and customer acceptance as appropriate.

## Use when

- A source candidate is ready for verification.
- A defect needs non-vacuous regression proof.
- A release gate requires more than build success.

## Workflow

1. Derive tests from the acceptance contract and threat model.
2. Cover unit, contract, integration, migration/replay, authorization, browser/mobile, accessibility, performance, and end-to-end layers according to risk.
3. Include negative, adversarial, timeout, ambiguity, retry, and rollback cases.
4. Bind every result to the literal candidate SHA, environment, fixtures, and provider artifact.
5. Report skipped or unavailable layers as unproven rather than green.

## Proof required

- Exact-head test runs and logs.
- Non-vacuity evidence showing the test fails on the rejected behavior.
- Environment and fixture identity.

## Stop conditions

- The checked-out source does not match the claimed SHA.
- Tests depend on hidden manual rescue.
- Skipped provider or device tests are being counted as passed.

## Outputs

- `test-plan`
- `exact-head-test-evidence`
- `coverage-gaps`
