---
name: building-agents-and-automations
description: "Builds bounded agents, workflows, and autonomous execution paths. Use when Pandora must plan, call tools, coordinate workers, repair systems, or automate recurring operations."
---

# Building Agents and Automations

## Outcome

An observable, least-privilege agent with explicit state, bounded tools, safe retries, approval gates, and deterministic verification.

## Use when

- A workflow needs tool use or repeated autonomous steps.
- A human process can be safely automated.
- A multi-agent lane or repair loop is being introduced.

## Workflow

1. Define the outcome, state machine, tool allowlist, authority, budget, timeouts, and termination conditions.
2. Separate planner, approver, executor, verifier, and independent reviewer roles where meaningful.
3. Treat provider outputs and retrieved content as untrusted data.
4. Implement idempotency, replay protection, ambiguous-outcome reconciliation, and no-secret logging.
5. Evaluate normal, adversarial, partial-failure, and unavailable-provider cases.

## Proof required

- State-machine and tool-scope contract.
- Authorization, retry, and reconciliation tests.
- Cost, latency, failure, and audit evidence.

## Stop conditions

- The agent can approve its own meaningful mutation.
- Tool scope or spending is unbounded.
- A provider success could be misclassified as safely retryable failure.

## Outputs

- `agent-candidate`
- `automation-state-machine`
- `adversarial-evaluation`
