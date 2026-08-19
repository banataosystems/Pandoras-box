---
name: integrating-external-providers
description: "Designs and implements least-privilege provider adapters and connectors. Use for GitHub, Vercel, Supabase, email, analytics, payments, messaging, documents, or future services."
---

# Integrating External Providers

## Outcome

A provider-agnostic, allowlisted integration with bounded reads/writes, exact account and resource identity, audit, timeouts, and recovery.

## Use when

- A new external service is connected.
- An existing connector needs repair or broader capability.
- Provider state must be read or mutated.

## Workflow

1. Verify provider account, organization, project, repository, environment, and resource allowlists.
2. Store credentials only in the approved secret system and expose no values to logs, source, Memory, or analytics.
3. Define read and mutation tools separately with narrow schemas, timeouts, rate/spend bounds, and explicit confirmations.
4. Handle provider errors, 408/429, conflicts, idempotency, and post-dispatch ambiguity safely.
5. Test wrong account, wrong resource, missing permission, stale data, and rollback or reconciliation.

## Proof required

- Identity and allowlist readback.
- Least-privilege scope evidence.
- Positive, negative, timeout, conflict, and reconciliation tests.

## Stop conditions

- The provider target is ambiguous.
- Broad credentials or account-wide mutation are the only available path.
- The integration requires new spending or public activation without authorization.

## Outputs

- `provider-adapter`
- `allowlist-contract`
- `provider-verification-pack`
