---
name: maintaining-operational-memory
description: "Maintains Pandora Memory as structured operational intelligence. Use after meaningful changes to requirements, decisions, source, tests, deployments, blockers, proof state, rollback, or the next autonomous action."
---

# Maintaining Operational Memory

## Outcome

A privacy-safe, provenance-bound Memory candidate that accurately reflects current project reality without automatic canonical promotion.

## Use when

- Meaningful work changes project reality.
- A stale canonical record needs correction.
- A durable decision, blocker, proof result, or next action must survive the chat.

## Workflow

1. Classify the evidence by project, claim, proof stage, sensitivity, and retention need.
2. Exclude credentials, private customer content, regulated documents, and unnecessary personal data.
3. Bind the claim to exact source/provider references, hashes, parent history, and observation time.
4. Submit through the governed plan, approval, one-time execution, and pending-review path.
5. Read the submitted candidate back and report whether it is proposed, approved, conflicted, or blocked.

## Proof required

- Plan ID, payload hash, execution audit, and readback.
- Evidence references with exact identifiers and hashes.
- No secret-shaped or protected data in the persisted payload.

## Stop conditions

- The evidence cannot be sanitized without losing meaning.
- The project or namespace cannot be resolved.
- The write path is ambiguous after provider dispatch.
- Automatic canonical promotion is requested without authorized review.

## Outputs

- `memory-evidence-candidate`
- `memory-readback`
- `open-review-gate`
