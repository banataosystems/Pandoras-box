---
name: pandora-commercial-validation
description: "Determine whether customers will repeatedly pay — ICP selection, wedge selection, problem validation, customer interviews, willingness to pay, paid pilots, pricing experiments, and scale gates. Load when deciding what to build for whom, when validating demand, when designing a pilot or pricing test, or when someone treats technical progress as market validation. Independent of engineering; never manufactures evidence."
---

# Pandora Commercial Validation

This skill is deliberately independent of engineering. Its job is to answer one question: **will customers repeatedly pay for this?**

**Technical progress is not customer validation.** A shipped feature, a green pipeline, and a production-verified capability say nothing about whether anyone wants it. Conflating them is how a well-built product finds no market.

## Never manufacture validation

Do not fabricate customer evidence, interviews, quotes, demand signals, or pipeline. Do not count as validation:

- enthusiasm without commitment ("this looks great" costs nothing to say)
- a free signup, a waitlist entry, or a demo request
- your own conviction that the problem is real
- a competitor's existence (it shows a market existed, not that you can win it)
- an advisor's or investor's opinion
- an AI-generated market analysis

If you have no real evidence, the correct output is "not validated, and here is how to validate it" — not an optimistic reading of weak signals. A fabricated validation is worse than none, because it authorizes spending.

## ICP

An ICP is specific enough to find and contact: who they are, what they do, what breaks for them, what they currently use, who decides, and who pays.

"Small businesses" is not an ICP. "Boracay resort owners with 5–20 rooms taking bookings by Facebook Messenger and losing double-booked reservations" is — you can list them, contact them, and check whether the pain is real.

Pick a narrow beachhead. Narrow ICPs validate faster because a small number of conversations produce a clear signal instead of noise.

## Wedge

The wedge is the single acute problem you solve first — frequent, painful, expensive, and currently solved badly.

Test it: how often does it occur (weekly beats yearly) · what does it cost them in money or time · what do they do today · have they tried to fix it and failed · would they notice within a week if your solution vanished.

That last question is the strongest single filter. If they would not notice, it is not a wedge.

## Problem validation

Interview before building. Ask about **past behavior**, not future intentions — "tell me about the last time this happened" produces facts; "would you use this?" produces politeness.

Signals of real pain: they describe specific recent instances with detail · they have spent money or time trying to solve it · they have a workaround, which means it matters enough to work around · they get animated.

Signals of false positive: agreement without specifics · "that would be nice" · they cannot recall a recent instance · enthusiasm that never converts to any commitment.

Roughly 8–12 focused interviews with a narrow ICP usually make the signal clear. If it is not clear by then, the ICP is probably too broad.

## Willingness to pay

Only one thing measures it: **asking for money and seeing what happens.**

Weak: "would you pay for this?" · a survey · a price-sensitivity study on a hypothetical.
Strong: a signed paid pilot · a deposit · a prepayment · a contract · a card on file.

Ask what they currently spend on the problem — in tools, in staff time, in losses. That is the honest anchor for price, and it usually beats value-based pricing theater.

## Paid pilots

A paid pilot is the cleanest early validation instrument. Design it with: a defined outcome the customer cares about · a fixed scope and timeline · a real price (a discount is fine, free is not — free removes the signal) · a defined success criterion agreed in advance · an explicit path to continuing.

Money changing hands is the signal. A free pilot measures politeness.

## Pricing experiments

Test price with real prospects and real offers, not surveys. Vary price across segments and observe conversion and objections. Watch what people actually do when asked to commit.

Segment by value received rather than by feature gates where you can — customers accept paying more for more value, and resent paying more for an artificial limit.

Pricing depth and margin analysis: `pandora-unit-economics`.

## Scale gates

**Dates may begin experiments. Evidence authorizes scale.**

Before scaling spend, hiring, or building broadly, require: repeated purchases by customers who are not friends · retention past the first cycle · a repeatable acquisition path (you know where the next ten come from) · unit economics that work at the current price · a delivery model that does not require heroics.

Missing any → keep experimenting, and say what is missing. Scaling on partial evidence is the most expensive mistake available, because it converts a cheap wrong answer into an expensive one.

## Output

```
ICP           <specific, findable>
WEDGE         <the acute problem>
EVIDENCE      <what real customers actually did — behavior, not opinion>
INTERVIEWS    <n conducted> · <signal>
WTP           <evidence of payment or commitment, or NONE>
PILOTS        <designed, running, completed — with outcomes>
PRICING       <tested how, results>
VALIDATED     yes | partially | no — <precisely what is and is not>
SCALE GATE    <met | not met> — <which criteria are missing>
NEXT          <the cheapest experiment that would resolve the biggest uncertainty>
```

Report "not validated" plainly when true. That is the useful answer; it is what prevents expensive building against an unproven assumption.
