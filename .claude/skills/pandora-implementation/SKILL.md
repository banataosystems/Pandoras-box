---
name: pandora-implementation
description: "Write and change application code across the Pandora stack — TypeScript, JavaScript, Node, Next.js, React, SQL, serverless and Edge Functions, REST APIs, webhooks, background workers, and integration adapters. Load when actually implementing a change, after requirements and design are settled. Emphasizes matching existing code, correct async and error handling, and producing changes that can be reviewed and proven."
---

# Pandora Implementation

Write code that reads like the code around it, and that a reviewer can verify.

## Before writing

Read the surrounding code first. Match its conventions — naming, error handling, module structure, comment density, test style. A change that is locally idiomatic is reviewable; one that imports a different philosophy is a rework request even when correct.

Confirm requirements and acceptance criteria exist. Implementing against an unstated requirement produces work that cannot be accepted.

Check whether the capability already exists. In a recovered codebase with multiple lanes, duplicate implementations are a live risk.

## Change discipline

**Keep the diff minimal and scoped.** Do exactly what the task requires. Unrelated refactors, reformatting, and opportunistic cleanups inflate the review surface and hide the real change among noise.

**Do not widen scope on your own.** A defect you notice nearby is a finding to report, not a change to bundle in.

**Never weaken a control to make something pass** — an auth check, a validation, a test, a type. If a control blocks you, either the control is wrong (report it) or the change is (fix it).

## Correctness patterns that matter here

**Async.** Await everything that returns a promise, including inside loops where sequencing matters. An unawaited promise is a silent failure and an unhandled rejection. `Promise.all` for independent work; sequential only when there is a real dependency.

**Errors.** Catch what you can handle; let the rest propagate with context. Never swallow an error into a log line and continue as if it succeeded — that converts a loud failure into a silent data problem.

**The confirmed-mutation shape.** When calling an external provider, record the confirmation *before* any parsing or validation that can throw:

```js
const result = await provider.mutate(payload);
await recordConfirmed(idempotencyKey, result.id);   // before anything that can throw
const parsed = schema.parse(result);                 // a throw here does not undo the mutation
```

Getting this order wrong is how duplicate charges and duplicate emails happen. See `pandora-governance-contract/references/mutation-safety.md`.

**Input validation** at every trust boundary — API handlers, webhooks, queue consumers, Edge Functions. Validate shape and range, not just presence, and never trust a client-supplied identifier without an authorization check.

**Authorization server-side, always.** UI that hides a button is not access control.

**Secrets** from the environment or a secret store. Never inline, never logged, never in error messages, never in a test fixture.

## Domain notes

**TypeScript** — types at boundaries earn their keep; `any` at a boundary defeats the purpose. Prefer parsing untrusted input into a typed shape over casting it.

**Next.js / React** — be deliberate about server vs client components; secrets and privileged calls stay server-side. Handle loading and error states as first-class UI, not afterthoughts. Keys on lists must be stable identities, not array indices.

**Node** — bound concurrency when fanning out; unbounded parallel calls to a provider produce rate-limit failures that look like provider outages.

**SQL** — parameterized queries only, including inside database functions. Never concatenate user input into SQL. See `pandora-supabase`.

**Serverless / Edge** — assume cold starts and short timeouts. No local state between invocations. Idempotency matters more here because retries are automatic and invisible.

**Webhooks** — verify the signature before doing anything else. Respond fast, process asynchronously. Assume duplicate and out-of-order delivery; dedupe on the provider's event ID.

**Background workers** — every job idempotent, every job carrying tenant context, poison messages moved aside rather than retried forever.

## Before handing off

Run the repository's own fast checks — lint, typecheck, and the tests covering what you changed. Read your own diff adversarially: what input makes this wrong, what would a reviewer catch, what did you leave in that should not ship.

Then report honestly. A change is `implemented` when it exists at an exact SHA; it is `tested` only when named tests passed on that SHA. Do not claim the higher state.

## Output

```
CHANGE        <what and why>
FILES         <paths and the nature of each change>
SHA           <exact commit>
CHECKS        <lint / typecheck / tests run, with results>
NOT DONE      <anything in scope you did not complete>
RISKS         <what could go wrong, and what is not covered>
PROOF STATE   implemented | tested
```

## Handoff

Tests → `pandora-testing`. Security-sensitive change → `pandora-security-review`.
Review → `pandora-exact-head-review`. Database → `pandora-supabase`. Commit/PR → `pandora-source-control`.
