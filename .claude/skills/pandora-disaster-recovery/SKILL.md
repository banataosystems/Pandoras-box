---
name: pandora-disaster-recovery
description: "Ensure any Pandora project survives losing a provider, an account, a device, or a conversation — source reconstruction, content-addressed snapshots, database and environment recovery, evidence restoration, provider migration, and single-point-of-failure detection. Load when assessing recoverability, after losing access to a provider, when preserving evidence, or when a project depends on something with no backup."
---

# Pandora Disaster Recovery

**No Pandora project may depend on one chat, one device, one repository host, one deployment host, or human memory.**

This is not theoretical for this platform. Its own history includes a GitHub account becoming unavailable, forcing reconstruction of a canonical repository from preserved deployment artifacts. That recovery succeeded because evidence had been preserved — and it is the reason the rules below are written the way they are.

## Single points of failure

Audit deliberately. For each, ask: if this vanished right now, could the project be rebuilt?

**Source** — one repository on one host under one account. Is a complete content-addressed snapshot preserved elsewhere?

**Identity** — one account owning everything. Account suspension takes every provider it authenticates. This is the failure that actually happened here.

**Deployment** — one host with the only copy of a running artifact.

**Database** — backups that exist but have never been restored. An unrestored backup is an assumption.

**Secrets** — credentials in one place, with no rotation path and no retained superseded version.

**Knowledge** — state that lives only in a conversation or only in a person's head. This is the most common and least visible SPOF, and the whole reason Memory and evidence records exist.

**Provider lock-in** — a capability with no migration path.

Report each finding with what would make it survivable. An unreported SPOF is one nobody chose to accept.

## Content-addressed snapshots

The instrument that makes recovery verifiable:

- SHA-256 per file
- an aggregate manifest hash over the file list and hashes
- preserved parent lineage — what this came from
- recorded provenance — where it was obtained, when, by what method
- a recorded integrity verification result

A snapshot you cannot independently re-verify is not a snapshot; it is a copy you hope is right. Store the manifest separately from the payload so tampering with one is detectable from the other.

## Source reconstruction

When source must be rebuilt from artifacts (deployment images, build outputs, preserved bundles):

1. Establish exactly what you recovered and from where, with hashes.
2. **Preserve provenance for every promoted file** — which artifact, which layer, which deployment revision, which timestamp.
3. Be explicit about what is *not* recovered. If original TypeScript sources were absent and runtime JavaScript was promoted to reviewable source, say exactly that. A reconstruction claiming completeness it does not have is worse than a partial one, because nobody will look for the gap.
4. Compare against any independent record — a running deployment, an old manifest, a partial mirror.
5. Treat the result as a **candidate**, not canonical, until reviewed. Reconstruction is evidence-gathering, not authority.

## Preserving evidence

**Never overwrite or delete historical evidence to make state look cleaner.** Quarantine superseded material from operational authority instead of destroying it — which is exactly what the repository's source-authority policy does with blacklisted legacy repositories: readable for forensics, hashes, lineage, and rollback provenance; never authoritative for current state.

Deleting inconvenient history is how a project loses the ability to explain itself, and how a rollback target quietly disappears.

## Database recovery

Backups have a restore procedure that has been **tested**. Know the recovery point objective (how much data you can lose) and the recovery time objective (how long restore takes) — measured, not assumed.

Migrations must be replayable from clean state to produce the current schema. Where source/provider parity is broken, a rebuild produces a *different* database than the one running, and nobody discovers this until they need it. That is why parity is a recovery concern, not only a governance one.

## Provider migration

For each provider: what would migrating require, what is portable, what is proprietary, what would be lost. You do not need a migration ready — you need to know the cost and to have avoided gratuitous lock-in.

Where a provider holds something irreplaceable (a signing key, a domain, an account identity), custody and backup are owner-level concerns.

## Recovery drills

An untested recovery plan is a document, not a capability.

Drill periodically: restore a database into an isolated environment and verify · rebuild source from a snapshot and compare hashes · deploy a rollback artifact to a preview and confirm it runs · verify the audit chain.

Record drill results with dates. A drill from a year ago against a system that has changed proves little.

## Output

```
PROJECT       <identity>
SPOFS         <each>: <what fails> · <survivable? how>
SNAPSHOTS     <what exists> · manifest hash · verified <ts>
SOURCE        recoverable: <bool> · <from what> · <what is not recoverable>
DATABASE      backup: <bool> · restore tested: <bool> · RPO/RTO
EVIDENCE      <what is preserved, where, verifiable how>
DRILLS        <last performed, results>
GAPS          <what cannot currently be recovered>
```

## Handoff

Source reconstruction → `pandora-source-control`. Database → `pandora-supabase`.
Provider access lost → `pandora-mcp-discovery`. Preserve findings → `pandora-evidence-ledger`.
