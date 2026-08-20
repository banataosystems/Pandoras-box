---
name: pandora-documentation
description: "Write operational documentation that stays true — READMEs, architecture docs, runbooks, SOPs, ADRs, API docs, release and recovery docs, evidence manifests, and user documentation. Load when documenting a system or decision, writing a runbook or recovery procedure, or producing an evidence manifest. Enforces that documentation is never implementation proof."
---

# Pandora Documentation

**Documentation is not implementation proof.** A document describing a capability establishes `documented` and nothing more. This is the most common way a project's status gets overstated: a thorough design doc reads like a working system.

Write documents that state their own proof state, so a reader knows whether they are reading a plan or a description of reality.

## Kinds, and what each is for

**README** — what this is, how to run it, where to go next. Written for someone arriving with no context. Keep it current; a stale README is actively misleading because it is the first thing read.

**Architecture** — components, boundaries, data flow, and the reasoning. Explain *why*, since the *what* is recoverable from code and the *why* is not.

**ADR** — one decision, its context, its consequences, its alternatives. Immutable once accepted; superseded by a new ADR rather than edited. Editing an ADR destroys the record of what was known when.

**Runbook** — how to perform a specific operation, written to be followed under pressure by someone who is not the author. Exact commands or exact tool calls, expected output at each step, what to do when a step fails, and how to verify success. Vagueness in a runbook surfaces at 3am.

**SOP** — a recurring process, with who does it, when, and what proves it was done.

**API docs** — endpoints, auth, request and response shapes, error cases, rate limits, idempotency semantics. Generated from source where possible so it cannot drift.

**Release docs** — what shipped, at which SHA, what changed, what to watch, how to roll back.

**Recovery docs** — how to rebuild from durable evidence. See `pandora-disaster-recovery`.

**Evidence manifest** — the content-addressed record binding claims to artifacts.

## Runbooks, specifically

Runbooks fail in predictable ways: they assume context the reader lacks, they skip the step the author does automatically, and they have no failure branches.

Write each step so it can be executed and verified. State the expected result. Then add the failure branch: "if this returns 404, the allowlist does not include the target — see X."

Given the owner operates from a smartphone, a runbook that requires a terminal is a runbook they cannot execute. Where a connected tool can perform the step, write the tool call. Where none can, say so plainly — that is a capability gap, and naming it is more useful than an unusable instruction.

## Evidence manifests

An evidence manifest binds a claim to artifacts a reader can independently verify:

```
CLAIM         <what is asserted>
PROOF STAGE   documented | implemented | tested | deployed | production_verified
ARTIFACTS     <path or ref> · sha256 <hash> · observed <ts>
SOURCE        <repo>@<sha> · tree <sha>
RUNS          <run id> · <suite> · <pass>/<total> · on <sha>
DEPLOYMENT    <id> · <env> · built from <sha>
LIMITS        <what this does NOT prove>
```

`LIMITS` is the field that makes a manifest trustworthy. A manifest asserting only what it proves is far more valuable than one that reads as comprehensive.

## Writing well

State the proof state of what you describe. "Planned", "implemented but untested", "production-verified since 2026-08-14" are all useful; unqualified present tense implies the system does this today.

Write for the reader who arrives without context — including yourself in six months, and the agent recovering this project after a lost session.

Be specific: exact paths, exact SHAs, exact IDs. "Deploy the latest build" is unusable; "deploy the artifact bound to SHA abc123" is executable.

Prefer generating over hand-maintaining. Hand-maintained documentation of things that change drifts, and drifted documentation is worse than none.

Say what you do not know. "Rollback has not been rehearsed" is a genuinely valuable sentence.

## Never document

Credentials, tokens, keys, internal hostnames tied to secrets, customer data, or anything from `pandora-privacy-data-governance`'s never-persist list. Documentation is widely read and widely copied — a secret in a runbook is a secret in every fork of it.

## Keeping docs true

Documentation drifts silently. Bind it to source where possible, review it when the thing it describes changes, and mark superseded documents as superseded rather than deleting them — deleting destroys history that recovery may need.

## Output

```
DOCUMENT      <what, for whom>
PROOF STATE   <of the thing described>
LOCATION      <path> · sha256 <hash>
COVERS        <what it addresses>
LIMITS        <what it does not establish>
```
