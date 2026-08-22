# ProjectOS → Pandora Windows Worker v1

**Status:** source implementation candidate; verification-only; no production activation.

## Purpose

Use owner-controlled Windows CPU, RAM, NVMe, Android tooling, and optional GPU capacity as a governed compute/evidence plane without moving execution authority out of Pandora / ProjectOS.

Architecture:

`Owner → Pandora / ProjectOS → exact bounded job → Windows Worker → evidence/artifacts → Pandora verification`

## V1 scope

V1 performs only deterministic verification workloads against exact immutable source. It does not implement provider mutation.

Allowed classes:

1. Node regression/security tests.
2. Flutter web/Android build verification.
3. Supabase migration replay against local replay tooling.
4. Pandora skill/evaluation checks.

## Security invariants

1. Full 40-character source SHA required.
2. Only `banataosystems/Pandoras-box` is allowlisted in v1.
3. No caller-supplied shell or command line.
4. `productionMutationAllowed` must equal `false`.
5. Remote jobs require Ed25519 signatures and expire within one hour.
6. Subprocesses use `shell: false`.
7. Each step has a bounded timeout and the whole job has a bounded runtime.
8. Logs are secret-redacted and capture is bounded.
9. Worker evidence never promotes canonical Memory by itself.
10. Builder/worker evidence cannot satisfy an independent-review requirement for its own work.

## Relationship to the Phase 0 execution lane

The active Phase 0 PR introducing `execution_dispatch_outbox` and `execution-worker` is a separate recovery candidate and is not modified by this worker PR.

Once the Phase 0 dispatch contract is exact-head green and independently accepted, a later bounded integration should map dispatch work items into the Windows signed-job contract. That integration must not place the Supabase service-role key or provider administrator credentials on Windows workers.

## Activation ladder

`documented → implemented → tested → enrolled → dispatch-integrated → production-observed`

A source PR can prove only the early stages. Installing a worker on a real Windows server and running an exact-SHA verification job is required before enrollment is claimed.
