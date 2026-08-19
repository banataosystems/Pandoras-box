---
name: preserving-source-provenance
description: "Preserves versioned, content-addressed source and recovery evidence. Use for new source snapshots, imports, reconstructed history, release candidates, rollback anchors, or provider-only artifacts."
---

# Preserving Source Provenance

## Outcome

An immutable lineage from parent source to candidate artifacts, with hashes, manifests, and authority boundaries.

## Use when

- A source candidate or artifact is created.
- Source is recovered from an archive or provider deployment.
- A rollback or release artifact must remain reproducible.

## Workflow

1. Resolve the canonical repository and exact parent SHA.
2. Inventory files, transformations, exclusions, and source authority.
3. Compute content hashes and a deterministic manifest.
4. Preserve parent history and quarantine legacy or provider-only evidence from current authority.
5. Verify remote readback of branch, commit, tree, file hashes, and manifest.

## Proof required

- Exact parent, commit, tree, and file hashes.
- Deterministic manifest and transformation record.
- Remote provider readback matching the candidate.

## Stop conditions

- The source contains secrets or protected customer data.
- Parent history cannot be established.
- An operation would overwrite the only recovery copy.

## Outputs

- `source-snapshot`
- `content-manifest`
- `lineage-record`
- `recovery-anchor`
