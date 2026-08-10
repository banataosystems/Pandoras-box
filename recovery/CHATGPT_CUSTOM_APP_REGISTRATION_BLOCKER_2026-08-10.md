# ChatGPT custom app registration blocker — 2026-08-10

## Current user-facing blocker

The provider runtimes are reachable, but the two private ChatGPT custom dev-app registrations are absent from the current ChatGPT installed-app registry:

- Pandoras-box: `dev-6a740a072c9481918a93bd1c77a33d69`
- Pandoras-box memory: `dev-6a789b815cb88191b52947de79757f12`

Plugin Management reports both IDs as not installed, and neither ID nor the MCP/Memory production endpoint is discoverable in the installable plugin index available to this session.

## Provider runtime evidence

- MCPMaster remote MCP: `https://mcpmaster.vercel.app/api/mcp`
  - reachable
  - unauthenticated requests fail closed with HTTP 401
  - OAuth protected-resource metadata points at the MCPMaster Supabase authorization server
- Pandora Memory production: `https://pandorasbox-memory.vercel.app`
  - ProjectOS health/search routes were previously restored and production-verified
  - production deployment: `dpl_7CbTiMxMXQZjrLQDKchf455iBxi4`

Therefore missing ChatGPT app registration must not be treated as evidence of a dead MCPMaster or Memory backend.

## Recovery gate

Restore/re-publish the two private ChatGPT app registrations in the ChatGPT app control plane, reconnect their OAuth configuration to the existing production endpoints, then prove:

1. Pandoras-box tool discovery succeeds.
2. Pandoras-box Memory `memory.health` succeeds through the installed app.
3. Memory search returns namespace-isolated context.
4. OAuth denial/wrong-client paths remain fail closed.
5. No provider runtime or production database is changed merely to compensate for missing ChatGPT registration.

The currently connected Plugin Management surface does not expose an install/connect/re-publish action for unlisted private dev apps, so this gate cannot be executed from the present ChatGPT session.
