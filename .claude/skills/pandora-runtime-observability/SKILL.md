---
name: pandora-runtime-observability
description: "Diagnose live systems, run incidents, and decide on safe automated repair or rollback. Load when something is down, slow, erroring, or behaving unexpectedly; when asked whether a system is healthy; for log or error analysis; and for root-cause analysis or postmortems. Enforces diagnose-before-change and defines when autonomous repair is safe versus when to roll back or escalate."
---

# Pandora Runtime & Observability

**Diagnose before you change anything.** An untargeted fix during an incident adds a variable to a system you do not yet understand, and it destroys the evidence that would have identified the cause.

## Health is layered

A system can be healthy at every layer but the one that matters. Check in order and stop where it breaks:

1. **Provider** — is the platform itself healthy?
2. **Deployment** — is the artifact READY, and is it the artifact you think? READY is a build status, not a behavior.
3. **Reachability** — does a request actually reach application code? Protection layers, auth gateways, and redirects intercept *before* your code runs and produce failures your application logs will never show.
4. **Application** — does the app respond correctly?
5. **Capability** — does the actual user-facing function work?
6. **Data** — is the database reachable, correct, and consistent?

Layer 3 is the one that surprises people. When application logs are empty during an outage, suspect interception before you suspect the application.

## Incident procedure

**1. Establish blast radius.** Who is affected, which capability, which environment, since when. Broad or narrow changes everything downstream.

**2. Preserve evidence before mutating.** Capture logs, error signatures, the exact deployment ID, the source SHA, recent changes, and provider state. A fix applied first destroys the diagnosis.

**3. Correlate with change.** Most incidents follow a change. What deployed, migrated, rotated, or expired recently? Check plans and audit events, not just deploys.

**4. Form a hypothesis and test it cheaply.** A read that would distinguish two causes beats a change that assumes one.

**5. Decide: repair, roll back, or escalate.**

**6. Verify the fix on the actual capability**, not on a health endpoint.

**7. Record**, including what you ruled out. Ruled-out causes save the next responder real time.

## Rollback vs repair

**Roll back when:** the cause is a recent change, the rollback target is proven, the blast radius is wide, or the fix is not well understood. Rolling back to a known-good state is almost always the fastest way to restore service.

**Repair forward when:** the cause is understood and narrow, rollback would lose data or is not possible, the fix is small and reversible, or the problem predates the last known-good artifact.

**Escalate when:** the fix requires new spending, a destructive action, regulated activation, or a production release you are not authorized for — and when you cannot determine the cause and the blast radius is severe.

Under time pressure the instinct is to try things. Resist it. An unverified change during an incident frequently becomes the second incident.

## Autonomous safe repair

Repair without asking only when **all** hold: the cause is understood and evidenced · the fix is reversible · no new spending · no destructive action · it does not weaken a security control · it is within existing authorization · you can verify it worked.

If any fails, escalate. In particular, restarting or redeploying to clear a symptom you have not diagnosed is not repair — it is hiding a defect that will recur, usually at a worse time.

## Rollback triggers

Define triggers *before* release so the decision is mechanical: an error-rate threshold over a window, a latency threshold, a specific failure signature, an authorization or data-integrity failure of any volume.

Authorization and data-integrity failures have a threshold of one. They do not get a rate.

## Root cause and postmortem

Root cause is not the last thing that changed — it is why the system permitted the failure. Distinguish the trigger, the cause, and the contributing conditions that let a small trigger become an outage.

A postmortem records: timeline with timestamps · impact including who was affected and for how long · trigger, cause, contributing conditions · how it was detected (and whether monitoring or a user found it) · what was ruled out · what would have prevented it · what would have detected it sooner.

Blameless and specific. "An agent applied an unreviewed migration" is a process finding, not a person finding.

**Detection gaps are findings.** If a user reported it before monitoring did, that is its own defect.

## Cost and drift

Watch runtime cost as a signal, not just a bill — a sudden change usually means a behavior change (a retry storm, a loop, a cache miss). Watch for configuration drift between what source says and what is running.

## Output

```
INCIDENT      <what> · <blast radius> · started <ts>
LAYER         <where it breaks: provider | deployment | reachability | app | capability | data>
EVIDENCE      <logs, error signatures, deployment id, source sha>
CORRELATION   <recent changes that could explain it>
RULED OUT     <hypotheses eliminated, and how>
CAUSE         <root cause, or "not yet determined">
ACTION        <repair | rollback | escalate> — <why>
VERIFICATION  <how you confirmed the capability works now>
PREVENTION    <what stops recurrence> / DETECTION <what would catch it sooner>
```

## Handoff

Rollback → `pandora-deployment-release`.
Database cause → `pandora-supabase`.
Security cause → `pandora-security-review`.
Provider unreachable → `pandora-mcp-discovery`.
Record the incident → `pandora-evidence-ledger`.
