---
name: translating-intent-to-specifications
description: "Turns human intent into a bounded outcome specification without forcing the user to understand infrastructure. Use at the start of a build, change, automation, repair, or business-system request."
---

# Translating Intent to Specifications

## Outcome

A testable outcome contract covering users, jobs, constraints, risks, acceptance, exclusions, and the smallest valuable release.

## Use when

- A user describes a desired result in business language.
- A vague feature request needs measurable acceptance criteria.
- A repair request mixes symptoms with assumed solutions.

## Workflow

1. Restate the desired customer or operational outcome.
2. Identify users, frequency, pain, current workaround, data, integrations, constraints, and failure consequences.
3. Separate required behavior from implementation choices and unsupported assumptions.
4. Define the smallest end-to-end outcome and explicit non-goals.
5. Translate acceptance into observable tests and proof stages.

## Proof required

- User outcome and job-to-be-done.
- Acceptance criteria and negative cases.
- Assumptions, exclusions, and risk gates.

## Stop conditions

- The request would create illegal, unsafe, or unauthorized behavior.
- Critical user, data, or outcome assumptions cannot be bounded.
- The proposed scope has no measurable success condition.

## Outputs

- `outcome-specification`
- `acceptance-contract`
- `assumption-register`
