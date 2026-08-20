---
name: pandora-regulated-activation
description: "Fail-closed gate for regulated and high-risk domains — payments and money movement, financial services, investments, healthcare and medical records, legal services, employment and hiring, property brokerage, and regulated communications. Also load whenever a feature stores or verifies identity documents such as passports, driver licenses, national IDs, or KYC material, or handles biometric, health, or financial records. Load before building and again before any activation. Separates technical implementation from authorized production activation."
---

# Pandora Regulated & High-Risk Activation

**This gate fails closed.** When in doubt about whether something is regulated, treat it as regulated and escalate. The asymmetry is stark: an unnecessary check costs a conversation, an unauthorized activation costs a legal exposure.

## The separation that governs everything here

> **Technical implementation** and **authorized production activation** are two different things, gated separately.

Building a payment flow is engineering work. Turning it on for real customers with real money is a business, legal, and regulatory decision that engineering evidence cannot supply.

**Never activate a regulated capability because the software technically supports it.** Working code is not authorization. A passing test suite is not a license. A green deployment is not a compliance determination.

Say this explicitly in every report, so nobody reads "the payment integration is complete" as "we can take payments."

## Domains

Payments and money movement · financial services, lending, investments · healthcare and health data · legal services and advice · employment, hiring, and candidate screening · property brokerage and real-estate transactions · identity verification and KYC · sensitive personal data at scale · regulated communications (marketing, SMS, automated calling).

Adjacency counts. A booking system that stores a card is a payments system. A scheduling tool for clinics handling patient notes is a health-data system.

## Building safely

You can build without activating, and this is usually the right sequence:

- Use sandbox and test credentials exclusively. Make it structurally impossible to point at production by accident — separate credentials, separate environments, an explicit activation flag defaulting to off.
- Build the full state machine including failure and reconciliation paths. Regulated systems fail in ways that need to be recoverable and auditable.
- Build the audit trail from the start. Retrofitting an audit trail into a financial system is far harder than building it in.
- Never process real customer data during development. Synthesize it.

## Money movement

Idempotency is mandatory — a duplicate charge is a real financial harm to a real person, and it is exactly the failure the confirmed-mutation rule prevents. Use the provider's own idempotency mechanism.

Design the payment state machine explicitly: initiated → authorized → captured → settled, plus failed, refunded, disputed, and reconciling. Ambiguous states must be resolvable by reading provider state, never by assumption.

Reconcile against the provider as the source of truth for money. Your ledger is a projection of theirs; where they disagree, they are right and you have a defect.

Webhooks: verify signatures, assume duplicate and out-of-order delivery, dedupe on the provider's event ID, and never treat webhook receipt as the only record of a state change.

Refunds and payouts are irreversible outward-facing actions. They escalate.

## Legal and compliance claims

**Never assert a compliance or legal status without proper evidence.** Not "this is GDPR compliant", not "this is HIPAA compliant", not "this meets PCI requirements", not "this is legal in jurisdiction X".

You can state what the system *does*: what it stores, what it encrypts, what it logs, what controls exist. Whether that satisfies a regulation is a determination for qualified people with authority — and Pandora explicitly prohibits fabricating legal or compliance status.

Where a requirement is known and concrete (data residency, retention minimums, consent capture, an audit trail), implement it and say what you implemented. That is honest and useful. Do not extrapolate from it to a compliance claim.

## The activation gate

Before a regulated capability serves real users with real consequences, **all** of these are required, and none is substitutable:

- explicit owner authorization for **this specific activation**
- named accountable person
- legal or regulatory review appropriate to the domain, by someone qualified
- required registrations, licenses, or agreements in place
- terms, privacy policy, and disclosures accurate to actual behavior
- security review passed with no open CRITICAL or HIGH
- data handling verified against the classification
- full audit trail operating
- reconciliation proven against the provider
- incident and dispute response defined, with a named responder
- rollback and kill switch proven — you can stop it immediately
- monitoring that would detect a failure affecting real people

Missing any one → **do not activate**. Report exactly which are missing.

The kill switch deserves emphasis: for anything touching money or health, being able to stop instantly is more important than any feature. Prove it works before activation, not after.

## Output

```
DOMAIN        <which regulated domain, and why it qualifies>
BUILD STATE   <technical proof stage>
ACTIVATION    NOT AUTHORIZED | AUTHORIZED — <ref>
GATE          <each requirement>: met | unmet | not applicable — <evidence>
SANDBOX ONLY  <confirmation no production credential or real data is in use>
BLOCKERS      <what is missing before activation is even discussable>
CLAIMS        <what the system does — never a compliance verdict>
ESCALATION    <what the owner must decide, and what qualified review is needed>
```

Always report build state and activation state as separate lines. Collapsing them is the failure this skill exists to prevent.
