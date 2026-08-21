# BOK Read Adapter Contract v1

Status: non-production candidate.

## Purpose

Provide the smallest governed boundary between Pandora and the BOK customer-zero data plane without coupling owner intent to a generic Supabase management operation.

## Fixed pilot scope

- BOK Supabase project: `zztqshkhoxqbnzmdhlts`
- Synthetic restaurant group: `b0000000-0000-4000-8000-000000000001`
- Environment: `test`
- Synthetic marker: `true`
- Real customers/orders/auth users: prohibited in this contract stage

## Allowlisted actions

1. `health`
2. `portfolio.summary`

No write action is defined. Mutation-shaped names such as order creation, menu availability, promotion activation, or customer listing must fail before transport invocation.

## Output boundary

`health` returns only status, test/synthetic markers, fixed group ID, and project ref.

`portfolio.summary` returns only:

- group ID/name/slug
- restaurant ID/name/slug plus branch/product counts
- aggregate restaurant/branch/product/customer/order counts

Unexpected fields are discarded. Direct customer records, phone numbers, credentials, tokens, payment data, campaign payloads, and raw provider responses must not cross this adapter.

## Transport boundary

v1 is transport-independent. The adapter accepts an injected read-only transport and validates returned scope before producing an owner-safe result. This lets the contract and safety behavior be exact-head tested before selecting or authorizing a runtime credential/Edge Function/RPC boundary.

A future transport binding must separately prove least privilege, project isolation, authentication, secret handling, timeout/retry behavior, exact source/runtime identity, rollback, and production authorization.

## Proof ladder

Source presence alone is implemented evidence. Passing exact-head unit/security CI is required for `tested`. This contract does not by itself prove deployment, authenticated BOK runtime access, physical-device behavior, or production verification.
