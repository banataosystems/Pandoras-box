# Pandora's-box Recovery Status

Last updated: 2026-08-08 23:06 (Asia/Manila)

## Verified infrastructure

- Replacement GitHub repository: `banataosystems/pandoras-box`
- Repository initialization commit: `333afd6b6b4d05c6c09b866a88bf773e490ff61d`
- Recovery provenance merged to `main`: `40ced7e81e94a809318aa4d43ff50d3484f77e4c`
- Recovered MCP route/evidence merged to `main`: `882fd075c37d81b29b083c61420da6ec06565ed9`
- Vercel MCPMaster project: `prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk`
- Verified READY production deployment: `dpl_9iftz4UgXPUJFMzFas3DeEoxTgon`
- Pandora Memory Vercel project: `prj_brg3BJDcHfSftHH84NhnFtDJAnDO`
- Pandora Memory Supabase project: `ivmvufhcsezyhczzondn` (`Memory`) — `ACTIVE_HEALTHY`
- Direct Memory Edge Function: `pandora-projectos-bridge` version 13 — `ACTIVE`
- Active ProjectOS workload principal: `projectos-mcpmaster-production`
- Allowed namespace: `real_life`
- Principal scopes: `memory:health`, `memory:read`

## Current incident

The Pandora Memory data service and direct ProjectOS bridge are healthy. The ChatGPT/Pandora MCP connector remains unavailable because Vercel Deployment Protection intercepts MCPMaster requests before application workload authentication executes.

A Vercel temporary share-link bypass was tested against both the production alias and the exact production deployment. Both still redirected to Vercel SSO, so a share URL is not a valid durable machine-to-machine repair.

The required control-plane repair is to configure a Vercel Automation Protection Bypass for MCPMaster and have the MCP transport send `x-vercel-protection-bypass`, while retaining the existing Vercel OIDC application authentication. The currently connected Vercel toolset can inspect projects, deployments, logs, authenticated URLs and deploy projects, but does not expose the project protection-bypass mutation endpoint.

## Pandora durable evidence

Recovery incident event recorded directly in Pandora Memory on 2026-08-08:

- event id: `96eff269-e4ad-4eb7-b0e7-eefccb283d5a`
- source: `projectos_recovery`
- source_ref: `pandora-mcp-incident-2026-08-08`
- sensitivity: `private`

## Source recovery state

Independently preserved source snapshots have been recovered and content-addressed. The replacement repository does not yet contain the entire 1,379-file recovered tree, so full source restoration is still in progress. The suspended `mbanatao` GitHub account is not an operational dependency for this recovery.

## Gates before canonical designation

1. Restore complete recovered source tree under `banataosystems/pandoras-box`.
2. Run dedicated secret scanning.
3. Verify dependency install/build/tests.
4. Compare recovered source against latest independently recoverable production evidence.
5. Configure Vercel Automation Protection Bypass without making MCPMaster public.
6. Re-run Pandora Memory health through the real ProjectOS workload identity.
7. Verify search retrieval through ChatGPT/Pandora MCP.
8. Record exact deployment and rollback evidence.

Until these gates pass, state is **recovery in progress**, not production-complete.
