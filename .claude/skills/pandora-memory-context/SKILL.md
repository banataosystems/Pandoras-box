---
name: pandora-memory-context
description: "Retrieve and reason over Pandora Memory as structured operational intelligence. Load when you need canonical project context, decisions, roadmap, or prior evidence; when Memory and provider state disagree; when a claim needs provenance; or when you suspect the picture you are working from is stale. Covers namespace isolation, degraded-result handling, contradiction detection, and privacy-safe retrieval."
---

# Pandora Memory Context

Pandora Memory is the operating source of truth for project reality. It is not chat history — it is a governed store of approved, provenanced records with an explicit canon status.

## Tools

| Tool | Use for |
|---|---|
| `memory_health` | Confirm the OIDC connection before trusting anything else |
| `memory_canonicalContext` | **Approved-only** canonical state, with conflicts and degradation surfaced |
| `memory_search` | Broader retrieval: semantic, recent, open loops, profiles |

Namespaces (`real_life`, `au`) are hard isolation boundaries. Never blend records across them, and never assume a project lives in a namespace you have not confirmed.

## Reading a canonicalContext result correctly

The envelope matters more than the payload. Check it first, every time:

```
degraded          true → your picture is stale or unavailable. Say so.
degradedReasons   why. Often the actionable part.
conflicts         non-empty → unresolved contradictions. Resolve before relying on contested facts.
freshestRecordAt  age of the newest record. Old canon + active provider = re-read the provider.
fallbackAuthority what to fall back to when degraded (typically github_and_supabase)
retrievalMode     how results were selected; affects how complete the set is
```

`canonical` contains approved records only. `proposed` (only when `includeProposed: true`) contains **drafts that are never canonical** — useful for reviewer inspection, never citable as project truth. Do not let a proposed record leak into a status report as fact.

Each record carries `trust`, `confidence`, `strength`, `canonStatus`, and `provenance`. When two records touch the same fact, these fields decide precedence — not recency alone.

### Handling large results

Canonical context payloads routinely exceed what is worth pulling into context. When a result is written to a file, query it with `jq` for the fields you need rather than reading it whole. Recovery should be cheap; a recovery that costs half your context defeats itself.

## Contradiction detection

A contradiction is any case where two authoritative-looking sources assert incompatible facts. Common shapes in this system:

- Memory says a migration is applied; the provider ledger does not list it
- Memory records a deployment; the Vercel project has no such deployment
- Memory names a canonical SHA; the branch head has advanced
- Two Memory records assert different values for the same field
- A project appears under multiple project keys

When you find one:

1. **Get fresh provider evidence for the exact external state.** The provider is authoritative for what the provider holds — this is level 1 of the source hierarchy.
2. **Determine which is stale**, and say which. Usually Memory lags a provider change.
3. **Preserve the correction with its provenance.** Never silently drop the Memory record and move on. Submit an evidence candidate via `pandora-evidence-ledger` recording the old claim, the new evidence, and how you established it.
4. **Report the contradiction** even after resolving it. A pattern of contradictions is a signal about a broken write path, and that signal is lost if each one is quietly fixed.

The rule from the governance contract applies exactly here: provider evidence may correct stale Memory, but the correction and its provenance must be preserved rather than the Memory record being ignored.

## Stale-state detection

Treat your picture as stale when:
- `freshestRecordAt` predates a known provider mutation
- a branch, PR, or deployment has moved since the record was written
- a plan executed after the record's timestamp
- the record describes a capability whose tool is no longer in the catalog

Staleness is not degradation — a non-degraded result can still be out of date relative to a provider that changed five minutes ago. Check both.

## Privacy-safe retrieval

Never write into Memory, or quote out of it into logs, PR bodies, code, or reports: credentials, tokens, keys, OIDC material · private KYC or identity documents · financial documents · protected customer data · message contents · anything the platform already returns as `[REDACTED]`.

`[REDACTED]` in a provenance field is the system working. Do not attempt to recover the underlying value, and do not treat its absence as a gap to fill.

When recording a finding that touches sensitive material, record the *shape* and the *location*, never the content: "3 service-role-callable functions found in schema X" rather than the function bodies.

## Querying well

Name the project, the artifact, and the question. `"PLP Boracay Supabase migration parity and advisor state"` retrieves usefully; `"status"` does not.

Bound your retrieval — `maxItems` exists so recovery stays cheap. Start narrow, widen only if the answer is not there.

Use `currentTask` to give the retrieval its context; it materially improves relevance.

## Output

```
NAMESPACE     <real_life | au>
FRESHNESS     <freshestRecordAt> · degraded: <bool> <reasons>
FINDINGS      <the facts you established, each with its provenance>
CONFLICTS     <contradictions found, with which source won and why>
STALE         <records you believe are out of date, and the evidence>
UNVERIFIED    <what Memory could not answer>
```

## Handoff

Contradiction needing a durable record → `pandora-evidence-ledger`.
State recovered for planning → `pandora-control-tower`.
Provider truth needed to settle a conflict → `pandora-source-control` or `pandora-supabase`.
