---
name: pandora-privacy-data-governance
description: "Classify data, set privacy boundaries, and keep sensitive content out of logs, telemetry, analytics, source, screenshots, and semantic memory. Load when handling personal or sensitive data, designing storage or retention, adding logging or analytics, building deletion workflows, or reviewing whether something is safe to record. Enforces data minimization and the never-persist boundaries."
---

# Pandora Privacy & Data Governance

Privacy failures are usually not breaches — they are **accidental persistence**. Data ends up in a log, an analytics event, a screenshot, an error message, or a memory record where nobody intended it, and then it is everywhere backups reach.

## Classification

Classify before designing storage. The class determines everything downstream.

**Public** — no restriction.
**Internal** — operational data; not for external exposure.
**Personal** — identifies a person: name, email, phone, address, IP, device ID, user ID tied to identity.
**Sensitive personal** — health, financial, biometric, government identifiers, precise location, sexual orientation, religion, political views, and similar. Elevated obligations nearly everywhere.
**Regulated** — KYC documents, payment credentials, health records, legal matter content. See `pandora-regulated-activation`.
**Secret** — credentials, tokens, keys, OIDC material. Never persisted anywhere outside a secret store.

When a field's class is unclear, treat it as the higher class. The cost of over-protecting a field is small; the cost of under-protecting one is not.

## Never persist

Into logs, analytics, telemetry, error messages, source, test fixtures, screenshots, PR bodies, evidence records, or semantic memory:

credentials, tokens, keys, OIDC material · private KYC or identity documents · financial documents and payment credentials · protected customer data · message contents · precise location · health information.

Record the **shape and location**, never the content: "3 service-role-callable functions in schema X" rather than their bodies; "user record contains a verified phone" rather than the number.

`[REDACTED]` appearing in a provenance field is the system working correctly. Do not try to recover the value, and do not treat it as a gap.

## Logging safely

The frequent leak paths, in order of how often they actually happen:

1. **Error handlers that echo the request body.** A validation failure logs the whole payload including the password field.
2. **Debug logging left in production.** Written to diagnose one incident, never removed.
3. **Third-party error reporters** capturing request context, headers, and local variables by default.
4. **URLs with data in query strings** — logged by every proxy in the path.
5. **Analytics event properties** carrying an email or a name as an identifier.

Log identifiers, not content. Redact at the logging boundary so a future caller cannot bypass it. Never put personal data in a URL path or query string.

## Telemetry and analytics

Analytics answers questions about behavior; it does not need identity to do it. Use opaque identifiers not tied to personal data, send event names and counts rather than content, and never send free-text user input — it always eventually contains something personal.

Before adding an event, ask what decision it informs. Events collected "in case they are useful" are pure liability.

## Minimization and retention

Collect only what a stated purpose requires. Every field justifies its existence — an optional field collected "for later" is a liability with no current benefit.

Set retention per class, delete on schedule automatically, and know what backups and logs retain. Retention that depends on someone remembering is not retention.

## Deletion

A deletion workflow must actually delete: primary records, derived and denormalized copies, caches, search indexes, analytics stores, logs where feasible, backups per their own schedule, and third-party processors.

Know what you cannot delete — immutable audit records, legally required retention — and say so honestly rather than claiming complete deletion. Verify deletion actually happened; an unverified deletion workflow is a claim, not a control.

## AI boundaries

Never send regulated, secret, or sensitive personal data into a model context, an evaluation set, or a training corpus without an explicit basis. Do not persist model inputs and outputs containing personal data into general logs. Be explicit about which provider processes what — that is a data-processing relationship whether or not anyone documented it.

## Access and lineage

Least privilege on personal data, with access logged for sensitive classes. Know where each class flows: collected here, stored here, processed here, sent to these third parties, retained this long. That lineage is what makes a deletion or breach response possible at all.

## Output

```
DATA          <field or dataset>: <class> · purpose · retention
FLOWS         <collected → stored → processed → shared>
LOGGING       <what is logged, what is redacted, where redaction happens>
TELEMETRY     <events, and what they carry>
DELETION      <workflow, what it covers, what it cannot>
FINDINGS      <leaks, over-collection, missing retention>
```

## Handoff

Regulated data → `pandora-regulated-activation`. Access enforcement → `pandora-auth`.
Independent verification → `pandora-security-review`.
