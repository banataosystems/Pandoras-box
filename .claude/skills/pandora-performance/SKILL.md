---
name: pandora-performance
description: "Diagnose and improve performance and runtime cost across frontend, backend, database, API latency, bundle size, model latency, and caching. Load when something is slow or expensive, when scaling is in question, or when a performance budget needs setting. Enforces measure-before-optimizing and treats cost as a first-class performance dimension."
---

# Pandora Performance

**Measure first.** Optimizing without a measurement is guessing, and the usual outcome is added complexity around code that was never the bottleneck.

Two questions before any work: what is actually slow, for whom, and how do you know? And what is the target — "faster" is not one.

## Method

1. Reproduce with a real workload. Synthetic benchmarks mislead, especially on databases where data volume changes the plan.
2. Measure to find where the time goes. Profile; do not reason from the code's shape.
3. Fix the largest contributor. A 90% improvement on 5% of the time is nothing.
4. Re-measure to confirm, and to catch what you made worse.
5. Add a guard so the regression is caught next time.

Cost is a performance dimension. A change that halves latency and triples spend is a tradeoff to state explicitly, not a win.

## Database

Usually the bottleneck, and usually fixable.

Missing indexes on filter, join, and sort columns — verify with `EXPLAIN` rather than intuition. Foreign keys without indexes make joins and deletes slow. N+1 queries behind ORMs and PostgREST: one query becomes hundreds. Unbounded queries without pagination fail suddenly at scale rather than gradually.

RLS deserves specific attention: a policy that calls a function per row turns a scan into a per-row execution. It is a common and severe cause of "the database got slow after we added security", and the fix is usually restructuring the policy rather than removing it. Never remove RLS for performance.

## Backend and API

Set a latency budget per endpoint and measure p95 and p99, not the mean — the mean hides exactly the experience people complain about.

Look for: sequential external calls that could run in parallel · unbounded fan-out that triggers provider rate limits · missing timeouts turning a slow dependency into a resource leak · serialization of large payloads · work done per request that could be cached or precomputed.

## Frontend

Bundle size is the biggest lever on first load. Code-split by route, lazy-load below-the-fold work, and check what large dependencies actually cost. Serve modern image formats at the right dimensions.

Watch for layout shift, main-thread blocking, and re-render storms from unstable dependencies or inline object props. On mobile, remember the real-world device is mid-range Android on a mediocre network — test in that profile, not on a fast laptop.

## Caching

Cache when data is read far more than written, computation is expensive, and staleness is acceptable. Be explicit about how stale is acceptable — that answer is a product decision, not a technical one.

Every cache needs a stated invalidation strategy and a key that includes **tenant and user** where data is scoped. A shared cache key across tenants is a data-leak vulnerability, not a performance bug.

## Model latency and cost

Use the least expensive method that reliably satisfies the task and its proof gate. Frequently no model is needed — a deterministic check is faster, cheaper, and verifiable.

Where a model is needed: minimize context (retrieve, do not stuff), stream where perceived latency matters, cache stable prefixes, and batch offline work. Depth in `pandora-ai-routing`.

## Budgets and guards

Set explicit budgets — p95 endpoint latency, bundle size, query time, cost per operation — and enforce them somewhere automatic. A budget nobody checks is a preference.

## Output

```
PROBLEM       <what is slow or expensive, for whom, measured how>
BASELINE      <measurements before>
BOTTLENECK    <where the time or cost actually goes>
CHANGE        <what you changed>
RESULT        <measurements after>
COST          <effect on spend>
TRADEOFFS     <what got worse, including complexity>
GUARD         <what catches the regression next time>
```

## Handoff

Database depth → `pandora-supabase`. Model routing → `pandora-ai-routing`.
Spend analysis → `pandora-unit-economics`. Runtime signals → `pandora-runtime-observability`.
