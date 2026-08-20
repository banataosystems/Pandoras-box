---
name: pandora-unit-economics
description: "Analyze and optimize the economics of the business and its infrastructure — pricing, gross margin, LTV/CAC, CAC payback, cohort retention, churn, contribution margin, Build Credit and Runtime Credit design, and inference/cloud/provider cost. Load when setting or changing prices, evaluating whether a business works, attributing or reducing cost, or deciding whether economics justify scale. Optimizes gross profit per successful customer outcome."
---

# Pandora Unit Economics & FinOps

The objective is **gross profit per successful customer outcome** — not AI activity, not tokens consumed, not features shipped, not deployments performed.

That target has a specific consequence: an agent that burns significant inference to produce an unverified result has generated cost and no outcome. Measure the outcome, then the cost of producing it.

## The unit

Define the unit before measuring anything: per customer, per project, per successful outcome, per build. In Pandora's case the meaningful unit is usually **one successful customer outcome** — a working, verified system the customer keeps paying for.

## Core metrics

**Gross margin** = (revenue − cost of delivering it) / revenue. Cost of delivery includes inference, hosting, database, provider fees, payment processing, support, and the human time delivery actually requires. AI-delivered services frequently have far worse gross margins than software, because inference is a variable cost that scales with usage rather than a fixed cost that amortizes.

**CAC** — total sales and marketing spend divided by customers acquired. Include founder time at a real rate; founder-led sales that looks free is the most common distortion in early unit economics.

**LTV** — gross-margin-based, never revenue-based. LTV on revenue overstates the business by exactly the cost of delivery.

**LTV/CAC** — above 3 is healthy; below 1 means each customer loses money. Early numbers are noisy and unreliable until retention is observed rather than assumed.

**CAC payback** — months of gross profit to recover CAC. Often more decision-relevant than LTV/CAC early on, because it determines whether growth consumes or generates cash.

**Contribution margin** — revenue minus all variable costs per unit. This is what actually funds fixed costs, and it is the number that tells you whether more volume helps or hurts.

## Retention and cohorts

Retention is the honest measure of value delivered. Everything else can be bought.

Analyze by cohort, never in aggregate — aggregate retention hides a deteriorating recent cohort behind a healthy old one, which is precisely when you most need to know.

Look for the curve flattening. A curve that flattens indicates a real retained core; one that keeps declining means there is no durable value, and no amount of acquisition fixes it.

Distinguish logo churn from revenue churn, and voluntary from involuntary (failed payments — often fixable and often ignored). Negative net revenue retention means expansion exceeds churn, which changes the entire economic picture.

## Credit economics

**Build Credits** — consumed producing a system. Costs are dominated by inference, and by rework when a proof gate fails. Price on the *outcome delivered*, not the tokens consumed; a customer who receives a working booking system does not care how many attempts it took, and charging for retries penalizes them for your inefficiency.

Model both cases: an efficient build and a rework-heavy one. The gap between them is your exposure, and reducing rework is directly margin work — which is why proof gates that catch failures early are an economic instrument, not just a governance one.

**Runtime Credits** — consumed operating a system. Hosting, database, inference at runtime, monitoring. These recur, so an error here compounds every month.

Both need a floor that covers cost at realistic usage, headroom for the heavy tail, and a model where a customer cannot consume unbounded cost against a fixed price. Unbounded consumption against a flat price is the classic way an AI product's margin inverts as it succeeds.

## Cost attribution

You cannot optimize what you cannot attribute. Tag cost by customer, project, capability, and stage. Know cost per build, cost per runtime-month, and cost per successful outcome.

Watch for anomalies as **behavior signals**, not just bills: a sudden increase usually means a retry storm, a loop, a cache miss, or an agent that failed to terminate. Route to `pandora-runtime-observability`.

## Reducing cost

In rough order of leverage:

1. **Do not do unnecessary work.** The cheapest inference is the call not made. Deterministic checks instead of model calls; cached results instead of recomputation.
2. **Right-size the method.** `pandora-ai-routing` — the least expensive method that reliably satisfies the proof gate.
3. **Reduce rework.** A failed proof gate means paying twice. Early verification is margin.
4. **Optimize context.** Cost tracks context size; retrieve rather than stuff.
5. **Optimize infrastructure.** Usually the smallest lever in an AI-delivered business, and usually the first one people reach for.

## Deciding on scale

Economics justify scale when: contribution margin is positive at the current price · CAC payback is acceptable for available cash · retention shows a flattening curve · costs do not grow superlinearly with volume · the delivery model does not depend on heroics.

If economics do not work at small scale, **scale makes them worse, not better**. "It will work at volume" requires a specific mechanism — a real fixed-cost amortization or a real efficiency curve. Absent that mechanism, it is a hope.

## Output

```
UNIT          <what one unit is>
REVENUE       <per unit>
COSTS         <itemized variable cost per unit>
GROSS MARGIN  <%>
CAC           <amount, and what is included>
LTV           <gross-margin based>
LTV/CAC       <ratio> · PAYBACK <months>
RETENTION     <by cohort, and whether the curve flattens>
CREDITS       <build and runtime cost model>
ANOMALIES     <unexplained cost, and the behavior behind it>
VERDICT       <do the economics work? at what scale? what would change it?>
ASSUMPTIONS   <what is measured vs estimated — label every estimate>
```

Label estimates as estimates. Unit economics built on unlabeled guesses produce confident, wrong decisions about spending real money.
