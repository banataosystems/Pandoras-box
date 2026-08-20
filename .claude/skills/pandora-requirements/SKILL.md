---
name: pandora-requirements
description: "Turn human intent into buildable, verifiable requirements. Load when someone describes something they want built ('I want an app that…'), when scope is unclear, before architecture or implementation on new work, and when a request may touch a regulated or high-risk domain. Produces acceptance criteria, constraints, assumptions, edge cases, risk classification, and an explicit MVP boundary."
---

# Pandora Requirements & Discovery

The gap between "what I want" and "what can be built and verified" is where most project failure originates. Close it here, cheaply, before it becomes code.

## Start from the outcome

People describe solutions. Behind every solution request is an outcome they actually want, and it is frequently reachable more cheaply than the solution they named.

Ask what changes for whom when this works. "A booking system" might really be "stop losing bookings to double-entry" — which could be a constraint, not a system.

Do not interrogate. Two or three good questions asked once beat a questionnaire. If a reasonable default exists, state your assumption and proceed rather than blocking.

## What to establish

**Users and roles** — who uses this, and what may each role do? Roles decide the authorization model, so ambiguity here becomes a security defect later.

**Core flows** — the two or three paths that are the product. Everything else is support.

**Data** — what is stored, who owns it, how sensitive is it, how long is it kept. Sensitivity determines governance obligations; establish it now, not after storage is designed.

**Integrations** — what external systems, and what happens when each is unavailable.

**Constraints** — budget, deadline, platform, compliance, existing systems, the owner's operating context (smartphone-first, here).

**Non-functional** — expected load, latency expectations, availability needs, growth. Vague answers are fine; unasked questions are not.

## Acceptance criteria

Requirements are only real when they are verifiable. Each becomes a testable statement:

> Given \<state\>, when \<action\>, then \<observable outcome\>.

Weak: "Booking should be reliable."
Strong: "Given a slot with one seat remaining, when two users confirm simultaneously, then exactly one succeeds and the other receives a clear unavailable message."

The strong version names a concurrency requirement, an error-handling requirement, and a test — from one sentence. Push for that specificity on the flows that carry money, identity, or scarcity.

## Edge cases

Ask deliberately: empty state · one item · very many items · concurrent actors · partial failure mid-flow · duplicate submission · an unavailable dependency · a user who abandons midway · a malicious user attempting another user's data.

That last one is a requirement, not a security afterthought. It belongs in acceptance criteria.

## Risk classification

Classify the work before planning it:

**Standard** — normal delivery.

**Sensitive** — handles personal data, authentication, or money movement in a non-regulated way. Needs security review and privacy handling.

**Regulated / high-risk** — payments, financial services, investments, healthcare, legal services, employment or hiring, property brokerage, identity verification, sensitive personal data, regulated communications.

**Regulated work fails closed.** Building it is permitted; *activating* it for real users is a separate, explicitly authorized gate. Separate these two from the very first requirements conversation, so nobody is surprised at launch. Route to `pandora-regulated-activation`.

## MVP and scope

Define the smallest thing that delivers the outcome and can be verified end to end. Everything else is explicitly deferred — written down as deferred, so it neither gets silently built nor silently lost.

**Scope control:** new requests during a build are logged and sequenced, not absorbed. Absorbed scope is how a two-week build becomes a two-month one with nobody able to say when it changed.

State assumptions explicitly. An unstated assumption is a defect waiting to surface at acceptance.

## Output

```
OUTCOME       <what changes for whom>
USERS         <roles and permissions>
FLOWS         <core paths>
REQUIREMENTS
  FR-1  <functional> — acceptance: given/when/then
  NFR-1 <non-functional> — acceptance: measurable
DATA          <what is stored, sensitivity, retention>
INTEGRATIONS  <external systems, and behavior when unavailable>
CONSTRAINTS   <real limits>
ASSUMPTIONS   <what you assumed and proceeded on>
EDGE CASES    <enumerated>
RISK CLASS    standard | sensitive | regulated
MVP           <in scope>
DEFERRED      <explicitly out of scope for now>
OPEN          <genuine questions needing the owner>
```

## Handoff

Regulated → `pandora-regulated-activation` before building.
Design → `pandora-architecture`.
Commercial viability unproven → `pandora-commercial-validation`.
Record approved requirements → `pandora-evidence-ledger`.
