# Pandoras-box

Canonical recovery repository for MCPMaster / Pandora's-box.

## Source authority

Pandora Memory hard-canon state is the operating source of truth. The canonical source repository for MCPMaster / Pandora's-box is `banataosystems/Pandoras-box`; the canonical Memory source repository is `banataosystems/pandoras-box-memory`.

The legacy repositories `mbanatao/mcpmaster` and `mbanatao/Memory` are **operationally blacklisted**. They may be read only for historical provenance, source recovery, hash comparison, parent lineage, deployment evidence, and rollback evidence. They must not determine current state, become a default Git remote, receive normal new work, or authorize a new release.

Machine-readable enforcement policy: `SOURCE_AUTHORITY_POLICY.json`  
Human governance record: `docs/governance/DEPRECATED_SOURCE_DENYLIST.md`

Legacy Vercel hostnames or deployment metadata containing `mbanatao` do not make the old Git repositories canonical. Existing network aliases may remain temporarily for OAuth, runtime continuity, or rollback until separately migrated and verified.

## Current state

This repository was initialized on 2026-08-08 as the replacement GitHub recovery target after the prior `mbanatao` GitHub account became unavailable.

The authoritative running system remains the Vercel `mcpmaster` project while source recovery and connection repair are performed. Do not infer source parity merely from a Vercel deployment or legacy Git metadata.

## Recovery rules

- Preserve source history and recovery evidence; do not overwrite evidence to make state look cleaner.
- Never store credentials, tokens, private keys, OIDC material, customer data, or other secrets here.
- Distinguish documented, implemented, tested, deployed, and production-verified state.
- Production deployment and Pandora Memory health must be independently verified before being marked complete.
- Fail closed if any tool tries to restore operational authority to a blacklisted legacy source without a new explicit owner decision.

## FlutterFlow readiness provider

MCPMaster includes a read-only FlutterFlow Project API provider. The non-secret production binding is pinned to project `pandoras-box-gj9hnb`; its bearer token must be supplied only through the protected `FLUTTERFLOW_API_TOKEN` runtime secret. The provider registers no update, export, deploy, or release operation and never interprets Project API access alone as deployment readiness.

See `docs/integrations/FLUTTERFLOW_READINESS_PROVIDER.md` for configuration, evidence gates, and rollback.
