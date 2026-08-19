---
name: preserving-audit-lineage
description: "Preserves tamper-evident execution and decision lineage. Use after plans, approvals, provider calls, reconciliation, releases, rollbacks, incidents, or meaningful evidence submissions."
---

# Preserving Audit Lineage

## Outcome

A complete hash-linked record from intent through exact action, provider result, verification, and durable state change.

## Use when

- A governed operation runs.
- A provider outcome is ambiguous.
- A release, rollback, incident, or review verdict is recorded.

## Workflow

1. Capture the plan, payload hash, actor, scope, claim, provider request identity, timestamps, and result classification.
2. Separate provider execution outcome from downstream validation and durable finalization.
3. Sanitize secrets, payload content, and protected customer data.
4. Verify the audit hash chain and bind evidence to exact source/provider identities.
5. Record reconciliation-required states as non-retryable until resolved.

## Proof required

- Hash-chain verification.
- Exact event sequence and event hashes.
- Sanitized provider and finalization classifications.

## Stop conditions

- The audit chain fails verification.
- A successful or ambiguous provider mutation would be recorded as an ordinary retryable failure.
- Sensitive content cannot be safely redacted.

## Outputs

- `audit-lineage`
- `hash-chain-verification`
- `reconciliation-marker`
