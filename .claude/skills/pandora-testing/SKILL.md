---
name: pandora-testing
description: "Design and execute testing that produces real proof — unit, integration, contract, end-to-end, database, migration replay, concurrency, authorization, fault injection, and acceptance. Load when writing or reviewing tests, deciding what testing a change needs, or determining whether test evidence actually supports a completion claim. Binds test results to exact SHAs so they count as proof."
---

# Pandora Testing

Tests exist to produce **proof**, and proof binds to an exact SHA. "Tests pass" without a SHA, a suite identity, and counts is not evidence — it is a claim.

## The test that proves nothing

A test that passes against a deliberately broken implementation is not coverage. Before trusting a suite, break the behavior on purpose and confirm the test fails. This one habit catches more false confidence than any coverage metric.

Watch for: assertions that cannot fail · mocks so complete the real code never runs · snapshots asserting current behavior including its bugs · tests asserting the implementation rather than the behavior.

Coverage percentage measures lines executed, not behavior verified. Do not report it as proof.

## Choosing the level

Match the level to the risk, rather than testing everything at every level.

**Unit** — pure logic, calculations, edge cases, error handling. Fast, many. Do not mock the thing under test.

**Integration** — components against real collaborators: real database, real schema, real queries. This is where most real defects live, because it is where assumptions between components meet.

**Contract** — the boundary between services or against a provider API. Verifies your assumptions about a shape you do not control.

**End-to-end** — the critical user paths only. Expensive and flaky at volume; a handful that actually exercise the product beats a hundred that mostly test the harness.

**Database** — RLS policies per role, constraints, triggers, transaction correctness. Covered in `pandora-supabase`.

**Migration replay** — apply migrations from clean state, verify resulting schema, verify rollback. Non-negotiable before a migration reaches a shared database.

**Concurrency** — anything with a race: double booking, double payment, simultaneous updates, idempotency under retry. These defects do not appear in sequential tests, and they are exactly the ones that cost money.

**Authorization** — every role against every protected path, **including denial**. A suite with only positive tests has not tested authorization at all.

**Fault injection** — provider down, timeout, malformed response, partial failure. Especially: does a mutation that succeeds at the provider but fails during response handling get retried? That is the confirmed-mutation bug, and a test is the only reliable way to keep it fixed.

**Acceptance** — does it satisfy the stated acceptance criteria? Traces back to `pandora-requirements`.

## Binding results to proof

Record for every run: exact SHA · suite identity · run/job ID · pass and total counts · environment.

Then check the binding is honest: did the run execute on the candidate SHA, or on an ancestor? A green check on a SHA that is not the one under review is the most common false proof in this system.

A capability is `tested` when named tests covering its behavior passed on its exact SHA. Not before.

## Flakiness

A flaky test is a defect. It either indicates a real race or it destroys the signal, and both are unacceptable in a system where tests gate releases.

Never disable, skip, or quarantine a test to get green. If a test is wrong, fix or delete it deliberately with a recorded reason — silently skipping converts a known problem into an unknown one.

Re-run only to confirm infrastructure failure (checkout, install, runner loss) or when it passed earlier on the exact same commit. "Flake" is not a root cause.

## Test data

Never real customer data in tests. Generate it. Where a fixture must approximate production, synthesize the shape without the content — and never commit anything derived from real identities, financial records, or messages.

## Output

```
SCOPE         <what was tested> at <exact sha>
LEVELS        <levels run, and why these>
RESULTS       <suite>: <pass>/<total> · run <id> · on <sha>
NEGATIVE      <denial and failure cases covered>
GAPS          <what is not covered, and the risk of that>
FLAKY         <any, with what you did about them>
PROOF STATE   tested | not tested — <justification>
```

## Handoff

Authorization gaps → `pandora-auth`.
Database testing → `pandora-supabase`.
Pipeline wiring → `pandora-cicd`.
Record results → `pandora-evidence-ledger`.
