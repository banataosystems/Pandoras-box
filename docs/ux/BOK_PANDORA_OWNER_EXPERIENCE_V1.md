
# BOK × Pandora — Owner Experience Blueprint v1.0

## Goal

The owner should experience one simple idea: **tell Pandora what the business needs; Pandora understands BOK, proposes the safest useful action, does the permitted work and shows the verified result.**

The BOK pilot is also the design laboratory for Pandora Simple Mode. Internal provider language stays in Professional Mode.

## Preview persona

**Name:** BOK Pilot Owner  
**Role:** Owner  
**Environment:** TEST / PREVIEW  
**Data:** synthetic only  
**Network:** disabled in the first preview implementation  
**Authority:** none over live BOK or Pandora

This persona is intentionally not a fake production login. It exists to visualize the experience safely. When authenticated preview testing becomes necessary, create an environment-scoped test identity with secrets outside source/Memory/chat.

## Information architecture

### Home / BOK workspace
Top: BOK identity, preview/live state, business health and one intent field.

First viewport should answer:
1. What happened?
2. What needs attention?
3. What does Pandora recommend?
4. What can the owner ask/do now?

### Today
Direct orders/sales, repeat customers, operational exceptions, unavailable items, delays and contribution opportunities. Every demo number is visibly synthetic until connected to verified live data.

### Customers
New/repeat/lapsed segments, consent state, repeat behavior and customer contribution. Do not expose raw contact details unless an authorized task actually needs them.

### Orders
Human-readable live queue and exceptions. Details expose fulfillment/payment/delivery status, not database jargon.

### Menu
Availability, pricing, modifiers and branch scope. Reversible actions show before/after and rollback.

### Promotions
Draft, audience, expected cost/margin impact, consent/suppression, schedule, approval state, attribution and result.

### Insights
Explain the evidence behind recommendations. Example: “Direct customers are repeating more often” must link to the cohort definition/time window and uncertainty.

### Changes / Approvals
Show only decisions the owner needs to make. Explain what will happen, why, business impact, reversibility and risk before technical proof.

### Connections
Simple states such as Connected / Needs attention / Not configured. Provider IDs and scopes live in Professional Mode.

### Professional Mode
Exact source SHA, deployment, Supabase project ref, migrations, policies, logs, plans, evidence and rollback. Never dominate Simple Mode.

## Intent interaction

Example intents:
- “Which customers have not ordered in 30 days?”
- “Get some of them ordering this weekend without killing my margin.”
- “Make the crispy pork bowl unavailable in Pasig until tomorrow.”
- “Why were sales weaker yesterday?”
- “How much better are direct customers than Grab customers?”

Response pattern:
**Outcome** → **why** → **what Pandora will do/did** → **business impact** → **approval if needed** → **verified result** → optional **proof**.

## Command classes in UI

Q Query: answer immediately from permitted data.

R Reversible: concise confirmation; display rollback.

B Business-impacting: show audience/margin/operational impact and stronger confirmation.

P Privileged: fail closed into ProjectOS/owner action as required.

## Preview fixture rules

- Persistent TEST/PREVIEW banner.
- Every metric/order/customer count is labeled synthetic.
- Porknyeta may be the preview anchor; Cardiac Delights and 80/20 are preview placeholders until exact business truth/configuration is recovered.
- No test command calls the production owner API.
- Reset is deterministic.
- Preview results always say no live action was executed.

## Mobile quality bar

Design for one-handed Android use, 360px width, large tap targets, readable contrast, dynamic text, screen-reader labels, weak-network states, resumable work and no duplicate command submission.

## Acceptance journeys

### Journey A — understand the business
Open preview → identify BOK + TEST state → understand what needs attention in under 15 seconds → open one insight → return without interpreting hashes/providers.

### Journey B — ask Pandora
Enter a natural-language business question → receive an owner-readable simulated response → distinguish evidence/recommendation/action → see that nothing live was executed.

### Journey C — reversible change design
Ask to change menu availability → see exact restaurant/branch/item, before/after, reversible classification and expected verification/rollback.

### Journey D — business-impacting campaign design
Ask to reactivate lapsed customers → see consent, audience, offer cost, expected contribution, holdout/measurement and approval before activation.

### Journey E — professional proof
Open Professional details → verify technical provenance exists without being required to use normal Simple Mode.

## Research questions for BOK

- Can he understand the home screen without explanation?
- Which three things does he want to ask Pandora first?
- Which decisions would he trust Pandora to execute automatically after repeated success?
- Where does he still reach for Grab/another tool/staff chat?
- What information would make him change a promotion/menu/branch decision?
- Does the experience make him want another restaurant added?

## Exit gate

The preview is successful when a non-technical owner can navigate and express real business intent without technical training, while every visual/demo state remains unmistakably synthetic and incapable of live mutation.
