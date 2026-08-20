---
name: pandora-ecosystem
description: "Design reusable templates, components, skills, connectors, agents, SDKs, and marketplace/publishing capability for the later platform stage. Load only when ecosystem work is explicitly requested or when evidence shows reuse demand is real. Treats marketplace capability as evidence-gated, not an immediate requirement, and covers publishing, discovery, quality review, monetization, reputation, and ecosystem security."
---

# Pandora Ecosystem & Platform

**Load this skill sparingly.** Ecosystem capability is a late-stage investment, and Pandora's governance explicitly prohibits creating large speculative systems merely because they might be useful later.

The strategic sequence is: **focused entry → horizontal growth → platform/ecosystem.** Skipping to the third stage before the first is validated builds infrastructure for participants who do not exist.

## The evidence gate

Before building ecosystem capability, require actual evidence — not intent:

- the same artifact has been rebuilt repeatedly across projects (reuse demand is observed, not predicted)
- someone outside the core team wants to build on the platform, and has said so with commitment
- the core product is validated and retained — `pandora-commercial-validation`
- the economics support the ongoing cost of curation, review, and support, which is where marketplaces actually spend money — `pandora-unit-economics`

Missing these → **document the design and stop.** A recorded design is cheap and preserves the thinking; a built marketplace with no participants is a maintenance burden that also signals emptiness to every visitor.

## Reuse before marketplace

The honest first step is almost always internal reuse, which requires no marketplace at all.

Extract to a template or component when the same thing has been built three or more times with genuinely similar shape. Two occurrences is a coincidence; the third is a pattern. Premature extraction produces an abstraction fitted to two cases that fights every subsequent one.

Reusable artifacts need: a clear contract, versioning, a migration path when the contract changes, and a maintainer. An unmaintained shared component is worse than duplication, because a break propagates everywhere at once.

## If the gate is met

**Publishing** — every published artifact carries identity, version, author, a content hash, and a declared contract. Immutable versions: a published version is never mutated in place, since consumers pin to it and silent mutation is a supply-chain attack.

**Discovery** — searchable by what the artifact does, with enough metadata to evaluate before installing: what it requires, what it accesses, what it costs.

**Quality review** — a defined bar, applied by someone independent of the author, before an artifact is listed. This is the expensive part and the part that determines whether the ecosystem is trusted or a liability.

**Security** — this is the load-bearing concern. Third-party code and connectors execute with real access:

- review every submission for what it accesses and what it can mutate
- sandbox execution; least privilege by default
- explicit, informed permission declarations shown to the installer
- pinned, hash-verified dependencies
- a revocation path that actually works — you must be able to pull a malicious artifact from every consumer immediately
- **never** allow a third-party artifact to bypass Pandora's governance gates. Ecosystem code goes through plan → approve → execute like everything else.

An ecosystem is a supply chain. Every published artifact is an attack surface on every consumer, and a marketplace without revocation is a distribution mechanism for whatever gets through review.

**Monetization and reputation** — pricing, payouts (regulated: `pandora-regulated-activation`), and a reputation signal based on verifiable outcomes rather than self-reported ratings.

**Developer tooling and SDKs** — only when external developers exist. An SDK for nobody is maintenance with no return.

## Output

```
GATE          <evidence for ecosystem investment, or NOT MET — with what is missing>
REUSE         <observed repetition, with counts>
DESIGN        <what would be built, if the gate were met>
SECURITY      <review, sandboxing, permissions, revocation>
GOVERNANCE    <how third-party artifacts stay inside Pandora's gates>
RECOMMENDATION <build now | document and defer — with reasoning>
```

When the gate is not met, "document and defer" is the correct recommendation and should be stated plainly. Deferring is a decision, not a failure to decide.
