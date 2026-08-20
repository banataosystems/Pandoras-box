---
name: pandora-provider-adapter
description: "Design and review provider integrations — GitHub, Supabase, Vercel, Google, email, analytics, communications, payments, and third-party APIs. Load when building a new connector or integration, when reviewing an existing adapter, or when a provider call produced an ambiguous or duplicated effect. Covers governed mutation, idempotency, retry safety, timeout handling, audit evidence, and rollback."
---

# Pandora Provider Adapters

An adapter is where your system's assumptions meet a system you do not control. Most integration defects are not API misuse — they are **failure-path** defects, and they surface as duplicated real-world effects.

## The rule that shapes the whole design

> Once an external provider mutation is confirmed successful, a downstream serialization, validation, or reporting failure must not turn it into a retryable failure.

Design the adapter so this is structurally hard to violate:

```
1. persist the idempotency key and "attempting" state
2. issue the mutation
3. on confirmation → persist "confirmed" with the provider's ID   ← before anything that can throw
4. only then parse, validate, transform, report
5. a failure in step 4 is a REPORTING failure, never a mutation failure
```

The natural code shape puts parsing before persistence, and that is exactly the bug. Full procedure: `pandora-governance-contract/references/mutation-safety.md`.

## Adapter capabilities

**Read** — direct, safe, cacheable where staleness is acceptable. Reads are how you reconcile everything else; make them easy.

**Governed mutation** — every mutation goes through plan → approve → execute (`pandora-governed-execution`). An adapter that can mutate directly has removed the control, whatever its intentions.

**Readback** — after mutating, read provider state to confirm the effect. The response is a claim; the state is the fact.

**Reconcile** — given an idempotency key, determine whether the effect exists. This is what makes ambiguous outcomes recoverable, and an adapter without it forces a guess every time a request times out.

## Idempotency

Keys derive from intent: `<project>:<operation>:<target>:<logical-version>`. Never from a timestamp, a random value, or a retry counter.

Persist the key **before** issuing the mutation. Use the provider's own idempotency mechanism where it has one (many payment and messaging APIs do) — it is stronger than anything you can build on top.

## Retries and timeouts

Retry only when the failure is provably **before** the mutation: connection refused, DNS failure, 401/403, 400 validation rejection, or a provider error documented as having no effect.

Never retry: a timeout after the request was accepted · a 5xx after acceptance · any failure whose position relative to the mutation you cannot establish. For these, **reconcile by reading back** — then decide.

Every external call has an explicit timeout. Bound retries by attempts and total elapsed time, with exponential backoff and jitter. Treat exhaustion as escalation, not silent failure.

Note the 404 trap: an unauthenticated or under-scoped request to a private resource returns 404, not 403. Do not conclude a resource does not exist until identity and allowlist are verified.

## Least privilege and allowlists

Request the minimum scopes. Maintain an explicit allowlist of exact targets — repository, project, organization — and **test that out-of-allowlist targets are actually denied**. An untested allowlist is an assumption.

Credentials come from a secret store, referenced never inlined, and never recorded in Memory, source, logs, or evidence. On rotation, retain the superseded credential encrypted for rollback rather than deleting it immediately.

## Audit evidence

Every mutation records: idempotency key · exact operation and target · plan ID · timestamps for request and confirmation · the provider's returned identifier · final state after readback.

Enough that someone can reconstruct what happened without the provider's own logs — which you may not have during an incident.

## Rollback

Know before mutating whether the operation is reversible, and by what. Some are not: a sent email, a published comment, a captured payment. For those, the gate is stricter, because there is no undo — treat irreversibility as a reason to escalate rather than a detail to note afterward.

## Provider-specific notes

**GitHub** — merge and DELETE are destructive tier. Heads move; bind to SHAs. Verify a check's app identity, not just its name.

**Supabase** — migrations run once against real data. Branch environments cost money (escalation). Advisors are input, not verdicts.

**Vercel** — READY is a build status, not verification. Verify git binding and the source SHA a deployment was built from. Protection layers intercept before application code, so an unreachable deployment can look perfectly healthy.

**Email / communications** — irreversible on send, and duplicates are visible to real people. Idempotency is not optional. Sending to real recipients is an outward-facing action requiring authorization.

**Payments** — see `pandora-regulated-activation`. Never activate real money movement because the software supports it.

**Analytics** — never send PII or message contents. See `pandora-privacy-data-governance`.

## Reviewing an adapter

Where is the confirmation persisted relative to parsing? · Are retries restricted to provably-pre-mutation failures? · Is there a reconcile path? · Are timeouts set on every call? · Are scopes minimal and the allowlist tested negatively? · Can a secret reach a log? · Is every mutation governed?

## Output

```
PROVIDER      <name> · <auth method> · <scopes>
OPERATIONS    <operation>: <risk> · idempotent: <how> · reversible: <bool>
ALLOWLIST     <targets> · negative test: <result>
FAILURE PATHS <timeout/5xx/parse-failure behavior for each operation>
RECONCILE     <how an ambiguous outcome is resolved>
AUDIT         <what is recorded>
FINDINGS      <gaps>
```
