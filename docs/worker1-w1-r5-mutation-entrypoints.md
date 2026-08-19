# Worker 1 W1-R5 Provider-Mutation Entry Point Contract

Exact historical review baseline: `85327f360976c87b385a93289ea71c7b6ce587d2`.

This document defines the source-side mutation outcome contract for ProjectOS. It does not authorize merge, deployment, provider mutation, Memory write probing, or production release.

## Invariant

Once a provider side effect may have occurred, ProjectOS must never represent the operation as a definite pre-side-effect failure. Retry eligibility is derived from provider-outcome evidence, not from a generic HTTP status or exception class.

## Stateful entry-point inventory

### Governed MCP `/mcp`

`request authentication and organization membership`
→ `assertToolScope`
→ `owner/admin execution role`
→ `approved durable plan claim`
→ `payload-hash and tool binding`
→ `shared provider-execution state machine`
→ `provider result bounds`
→ `durable completion or reconciliation summary`
→ `MCP result shaping bounds`
→ `response delivery`

The MCP wrapper does not replace authorization, approval, allowlist, payload-binding, or one-time-claim controls. It wraps the already-authorized provider dispatch and finalization boundaries.

### Governed HTTP `/api/tools/execute`, `/tools/execute`, and deprecated `/tools`

`admin-token/OIDC runtime authorization`
→ `runtime schema and risk policy`
→ `durable plan requirement for writes/destructive operations`
→ `approved plan claim and payload binding`
→ `shared provider-execution state machine`
→ `provider result bounds`
→ `durable completion or reconciliation summary`
→ `HTTP response shaping bounds`
→ `response delivery`

All three route aliases use the same wrapped Express application. The deprecated alias cannot select a legacy mutation engine.

### Container and operator mounts

The local HTTP server, Vercel handler, and ProjectOS container/operator servers mount the same `createHttpApp` implementation. They do not contain alternate provider-dispatch logic.

### MCP stdio

The stdio transport is read-only. It rejects mutation tools before provider dispatch and therefore is not a stateful mutation engine.

## Canonical provider-outcome model

| ProjectOS meaning | Source representation | Retry rule |
|---|---|---|
| Definitely not dispatched | `not_executed` / `DEFINITELY_NOT_DISPATCHED` | Normal retry policy may apply |
| Proven rejected before side effect | `failed_before_side_effects` / `PROVIDER_REJECTED_WITH_NO_SIDE_EFFECT` | Retry only under operation policy |
| Dispatched, outcome unknown | `ambiguous` / `OUTCOME_AMBIGUOUS_AFTER_DISPATCH` | Reconcile first; no blind automatic retry |
| Provider side effect confirmed | `succeeded` / `PROVIDER_SUCCEEDED` | Never repeat mutation |
| Provider succeeded, local processing failed | `succeeded` / `PROVIDER_SUCCEEDED_LOCAL_FINALIZATION_FAILED` | Repair or reconcile local state; never repeat mutation |

`automaticRetryAllowed` is always false for ambiguous or successful dispatch. A provider-idempotent operation may expose the exact immutable identity required for a controlled replay after reconciliation, but correlation IDs and caller-shaped fields never establish idempotency.

## 409 classification

HTTP 409 alone provides no side-effect guarantee. The Memory evidence adapter therefore treats every 409 as ambiguous unless a stronger provider contract or provider readback proves prior success or proves no side effect. A genuine idempotency conflict remains distinguishable in the sanitized backend error envelope, but it is not relabelled as a definite pre-side-effect failure.

## Durable evidence and privacy

Completed and reconciliation records contain only bounded metadata:

- provider outcome and mutation state;
- downstream processing outcome;
- safe error code and validation category;
- retry contract and reconciliation flag;
- payload SHA-256;
- one-way idempotency identity hash where supported;
- bounded provider/operation/status/correlation/privacy metadata;
- candidate and review identifiers for Memory results.

They do not persist raw provider payloads, raw idempotency keys, credentials, private messages, or unbounded backend detail.

## Result and response bounds

Provider results are bounded before entering either MCP or HTTP finalization. The provider-result byte limit reserves deterministic headroom for the duplicated MCP text and structured representations. Tool presentation, error envelopes, and durable summaries are independently bounded. Non-plain objects, getters, symbols, cycles, excessive depth, node count, key count, array count, string length, and total bytes fail closed.

## Reconciliation

The operation ledger is the primary local recovery anchor. A confirmed or ambiguous provider dispatch is completed with a privacy-safe reconciliation summary when that write is available. If durable completion itself fails, ProjectOS returns `execution_finalization_ambiguous`, leaves the claimed operation non-repeatable, and emits a bounded reconciliation event. Provider readback and the immutable payload/idempotency identities must be used before any controlled replay.

## Preserved governance controls

The remediation does not change:

- OAuth scope enforcement and `assertToolScope`;
- organization, namespace, project, and resource binding;
- owner/admin approval and execution roles;
- durable plan and approval requirements;
- provider allowlists;
- destructive-operation gates;
- exact payload hashing;
- one-time plan claim;
- Memory privacy preflight and provenance;
- backend error allowlisting and redaction.
