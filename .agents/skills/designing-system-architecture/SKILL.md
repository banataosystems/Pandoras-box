---
name: designing-system-architecture
description: "Designs secure, evolvable system architecture from an outcome specification. Use before significant application, agent, integration, data, runtime, or platform implementation."
---

# Designing System Architecture

## Outcome

A dependency-aware architecture with trust boundaries, failure modes, costs, observability, environments, and proof gates.

## Use when

- A new system or major capability is planned.
- A repair reveals structural coupling.
- A focused product must preserve a path to horizontal growth.

## Workflow

1. Map actors, outcomes, data, services, providers, environments, and trust boundaries.
2. Choose the simplest architecture that satisfies the current wedge while keeping portable interfaces for future growth.
3. Separate control plane, customer runtime, model providers, memory, and public application dependencies.
4. Define authorization, failure isolation, idempotency, observability, cost controls, migrations, and rollback.
5. Record alternatives, decisions, dependencies, and evidence needed before scale.

## Proof required

- Architecture diagram or structured model.
- Decision records and threat boundaries.
- Failure, recovery, cost, and proof plan.

## Stop conditions

- The design depends on undocumented provider behavior.
- Public customer systems require the control plane to stay online.
- Regulated or destructive paths lack fail-closed gates.

## Outputs

- `architecture-specification`
- `decision-records`
- `dependency-map`
- `proof-plan`
