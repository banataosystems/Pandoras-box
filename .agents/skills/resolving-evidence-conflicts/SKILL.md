---
name: resolving-evidence-conflicts
description: "Resolves contradictions among Pandora Memory, source repositories, deployments, databases, and provider metadata. Use when two records disagree or when newer evidence appears to supersede canonical state."
---

# Resolving Evidence Conflicts

## Outcome

One provenance-preserving resolution that identifies the winning evidence, keeps history, and leaves no silent contradiction.

## Use when

- Memory and provider state disagree.
- Two source or deployment identifiers claim authority.
- A newer verified observation changes project reality.

## Workflow

1. List each conflicting claim with source, observation time, and proof stage.
2. Apply the project source-authority policy and prefer newer exact evidence only when it is genuinely stronger.
3. Determine whether the conflict is factual, temporal, scope-related, or caused by provider-account mismatch.
4. Preserve superseded evidence as history; never rewrite it as though it never existed.
5. Correct Pandora through the governed evidence path before using the resolved state for decisions.

## Proof required

- Exact conflicting records and their provenance.
- Reasoned authority decision tied to policy.
- Correction or pending-correction evidence in Pandora.

## Stop conditions

- Evidence is incomparable or lacks exact identity.
- Resolution would require destructive history editing.
- A correction path is unavailable and the conflict affects a sensitive action.

## Outputs

- `conflict-resolution`
- `supersession-map`
- `memory-correction-candidate`
