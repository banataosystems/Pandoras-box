---
name: pandora-architecture
description: "Design and review system architecture, and record decisions as ADRs. Load when designing a new system or major capability, when reviewing an architectural proposal, when deciding service boundaries, data models, event flows, or multitenancy, and when an architecture decision needs to be recorded or reconciled. Covers idempotency, resiliency, failure isolation, and build-vs-buy."
---

# Pandora Architecture

Good architecture at Pandora's scale means: the system can be verified, recovered, and changed safely. Elegance that cannot be proven correct is not an asset.

## Design from constraints

Start from what is actually true: expected load, data sensitivity, team size (often: one owner plus agents), operating context (smartphone-first), existing providers, budget, and the recovery requirement that no project depends on one chat, device, repository host, or deployment host.

Design for the constraints you have. Architecture built for imagined scale is a real cost paid now against a benefit that may never arrive — and Pandora's own governance forbids creating large speculative systems merely because they might be useful later.

## Decomposition

Draw boundaries where the **data** and the **rate of change** naturally separate, not where the org chart or the noun list suggests. A boundary that requires a distributed transaction to cross is in the wrong place.

Prefer a well-structured single deployable until a specific pressure justifies splitting: independent scaling, independent release cadence, isolation of failure, or a hard security boundary. "Microservices" as a default converts local function calls into network calls that can fail, retry, and duplicate — you inherit every problem in the idempotency section below.

## Multitenancy

Decide the isolation model deliberately: shared tables with row-level isolation (Supabase RLS is built for this) · schema per tenant · database per tenant.

Whatever you choose, tenant scoping must be enforced at the lowest possible layer. Scoping in application code alone means one missing `where` clause is a cross-tenant breach. RLS enforces it where it cannot be forgotten.

Every query, every background job, and every cache key carries tenant context.

## Idempotency and retries

Any operation reachable more than once needs an idempotency key derived from **intent**, not from the attempt. This includes anything behind a network call, a queue, a webhook, or a retry.

Design so that: the key is persisted before the effect · a replayed request returns the original result rather than re-performing the effect · a confirmed external mutation is never reclassified as retryable because downstream processing failed.

That last one is the rule from `pandora-governance-contract/references/mutation-safety.md`, and it is an architectural property, not a coding detail. Design the boundary so the confirmation is recorded before anything that can throw.

## Failure isolation and resiliency

Assume every dependency fails. For each: what is the timeout, what happens on failure, does it degrade or take the system down?

Timeouts on every external call — an unbounded call is a resource leak under load. Circuit breakers on dependencies that fail slowly. Bulkheads so one saturated dependency does not exhaust shared capacity. Graceful degradation: which features can keep working when a dependency is down?

Queues decouple, but they introduce ordering, duplicate delivery, and poison messages. Handle all three explicitly or do not use a queue.

## Data architecture

Model the domain, then decide storage. Normalize until a measured read pattern justifies denormalizing. Choose consistency requirements per operation — booking a seat needs strong consistency; a view counter does not.

Plan for evolution: additive schema changes, backward-compatible reads across a deploy boundary, no migration that requires downtime unless downtime is accepted.

## Observability by design

Decide up front what proves the system is working — the signals that make `production_verified` reachable at all. Structured logs with correlation IDs, metrics for the flows that matter, and health checks that exercise real dependencies rather than returning a constant.

A health endpoint that always returns 200 is worse than none: it produces confident green during an outage.

## Build vs buy

Buy when the capability is undifferentiated (auth, payments, email), when correctness is hard and the failure mode is severe, or when building it means maintaining it forever.

Build when it is your actual differentiator, when the vendor cost curve breaks your unit economics at plausible scale, or when no option fits and adapting one costs more than building.

Cost the *total*: integration, operations, migration risk, and the vendor becoming a single point of failure. Route the economics to `pandora-unit-economics` when the numbers are close.

## ADRs

Record decisions that are expensive to reverse: technology choices, data models, boundaries, tenancy, auth architecture, provider selection.

```
# ADR-<n>: <decision>
Status: proposed | accepted | superseded by ADR-<n>
Date · Context (the forces, not the narrative) · Decision (what, in one sentence)
Consequences (what becomes easy, what becomes hard, what is now irreversible)
Alternatives considered (and why rejected)
```

Reconcile ADRs against reality periodically. An ADR describing a decision the system no longer implements is worse than no ADR — mark it superseded rather than editing history.

## Reviewing architecture

Ask: what fails first under load · what happens when each dependency is down · how is tenant isolation enforced, and at what layer · what is irreversible about this · how is it verified in production · how is it recovered if a provider disappears · what does it cost per unit of use.

Depth on the last question: `pandora-unit-economics`.

## Output

```
CONTEXT       <constraints that shaped this>
DESIGN        <components and boundaries, and why there>
DATA          <model, storage, consistency per operation>
TENANCY       <isolation model, enforcement layer>
FAILURE       <per dependency: timeout, behavior, degradation>
IDEMPOTENCY   <which operations, keyed how>
OBSERVABILITY <what proves it works in production>
IRREVERSIBLE  <decisions that are expensive to undo>
ADRS          <recorded>
RISKS         <with mitigations>
```
