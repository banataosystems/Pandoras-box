# Pandora's-box Recovery Status

Last updated: 2026-08-08 (Asia/Manila)

## Verified infrastructure

- Replacement GitHub repository: `banataosystems/pandoras-box`
- Repository initialization commit: `333afd6b6b4d05c6c09b866a88bf773e490ff61d`
- Vercel MCPMaster project: `prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk`
- Verified READY production deployment observed during recovery: `dpl_9iftz4UgXPUJFMzFas3DeEoxTgon`
- Pandora Memory Vercel project: `prj_brg3BJDcHfSftHH84NhnFtDJAnDO`

## Current incident

Pandora Memory MCP health is not production-verified because Vercel Deployment Protection is intercepting the MCP request before MCPMaster workload authentication runs. The correct repair is an automation-protection bypass for the machine-to-machine MCP transport while retaining application authentication.

## Source recovery state

This repository is initialized but does NOT yet contain a verified complete MCPMaster source snapshot. The prior GitHub source under the suspended `mbanatao` account must not be assumed available. Recovery must come from independently preserved source, deployment artifacts, or a previously captured source capsule and must be integrity-checked before being designated canonical.

## Gates before canonical designation

1. Recover complete source tree.
2. Produce content-addressed snapshot/hash manifest.
3. Scan for secrets before commit.
4. Verify build/tests from recovered source.
5. Verify MCP route and Pandora Memory integration.
6. Verify exact production deployment and rollback evidence.

Until those gates pass, status is **recovery in progress**, not complete.
