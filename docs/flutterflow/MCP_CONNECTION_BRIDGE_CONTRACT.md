# Pandora Mobile — Connection Bridge Contract

**Purpose:** Let the FlutterFlow app use every governed MCP/provider connection through one simple owner-facing interface without embedding provider secrets or teaching the owner MCP terminology.

## Core rule

FlutterFlow does **not** connect directly to each raw MCP server. It connects to one authenticated **Pandora Owner API** deployed as the JWT-required `pandora-owner-api` function in MCPMaster Meta Supabase/ProjectOS. The backend owns MCP discovery, credentials, scopes, policies, approvals, execution, verification, and audit.

This keeps the phone UI simple and means adding a new MCP/service does not require redesigning or republishing the app.

## Simple-mode language

The UI calls MCPs **Connections** or **Connected services**.

Examples:
- GitHub — `Code and changes`
- Vercel — `Web app hosting`
- Supabase — `Database and sign-in`
- FlutterFlow — `App builder`
- PostHog — `Usage insights`
- Gmail — `Email`
- Google Calendar — `Calendar`
- Google Drive — `Files`
- Resend — `App email delivery`
- Outlook — `Work email`

Advanced mode may reveal MCP/provider identifiers, scopes, account IDs, health proof, and raw evidence.

## Dynamic connection model

The app renders Connections from backend data, never from a hardcoded provider list.

```json
{
  "id": "github",
  "name": "GitHub",
  "plainPurpose": "Code and changes",
  "state": "ready",
  "canRead": true,
  "canChange": true,
  "needsOwnerApprovalForChanges": true,
  "lastCheckedAt": "2026-08-10T00:00:00Z",
  "plainStatus": "Ready",
  "advanced": {
    "provider": "github",
    "mcpServer": "...",
    "scopes": [],
    "accountRef": "...",
    "proofRef": "..."
  }
}
```

Allowed owner states:
- `Ready`
- `Problem`
- `Off`
- `Needs permission`
- `Not checked yet`

Do not display `Connected` unless a current backend health/read proof exists.

## Owner API surface

Recommended stable high-level routes:

- `GET /api/owner/home` — health, priority card, counters, top projects, recent activity.
- `GET /api/owner/projects` — canonical project summaries and proof-backed progress.
- `GET /api/owner/projects/:id` — simple project detail plus optional advanced proof.
- `GET /api/owner/connections` — dynamic MCP/provider connection registry.
- `GET /api/owner/approvals` — pending owner decisions.
- `GET /api/owner/activity` — verified activity records.
- `GET /api/owner/safety` — safety/privacy/security/rollback status.
- `POST /api/owner/ask` — natural-language owner intent.
- `POST /api/owner/actions/:id/run` — start an allowed governed action.
- `POST /api/owner/approvals/:id/decide` — approve/reject after required identity check.

FlutterFlow configures one API-group base URL:

`https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/pandora-owner-api`

Each request passes the signed-in Supabase user JWT as `Authorization: Bearer <JWT>` and the active organization as `X-Organization-Id`. Browser requests are accepted only from exact allowlisted HTTPS origins. Before web release, add the final FlutterFlow site origin to `PANDORA_ALLOWED_ORIGINS`; never use `*`.

FlutterFlow should never call raw provider mutation endpoints directly.

## Ask Pandora contract

Input:
```json
{
  "message": "Continue Porknyeta",
  "projectId": "optional-canonical-project-id",
  "clientMode": "simple"
}
```

Output:
```json
{
  "reply": "I found the next safe step and started it.",
  "needsApproval": false,
  "actionId": "...",
  "status": {
    "whatChanged": "...",
    "whereWeAre": "...",
    "whatIsDone": "...",
    "whatIsHappeningNow": "...",
    "whatIsStoppingUs": "...",
    "whatIWillDoNext": "..."
  },
  "advanced": null
}
```

The backend, not FlutterFlow, resolves project aliases, loads Pandora Memory, selects tools/MCPs, applies policy, and verifies results.

## Approval contract

Simple card fields:
- `What will happen`
- `Why I need you`
- `What could go wrong`
- `How we can undo it`
- `Approve`
- `No`
- `Ask Pandora`

Advanced detail may contain exact action hash, provider, environment, commit/deployment IDs, scopes, and evidence.

## Security invariants

1. No MCP/provider token, API key, service-role key, refresh token, or secret is stored in FlutterFlow client state.
2. FlutterFlow receives owner-safe projections only.
3. Provider writes happen server-side after policy evaluation.
4. Protected actions require both the Edge API gate and the database RPC's current non-anonymous AAL2-session check.
5. Every material write has duplicate protection, audit, read-back verification, and recovery evidence where supported.
6. New MCPs start read-only until their provider adapter and approval policy pass verification.
7. When connection health is unknown, UI says `Not checked yet`; it never guesses.
8. Advanced details are optional and collapsed by default.

## Plug-in behavior for future MCPs

A new MCP/service becomes visible in Pandora Mobile when the backend registry returns a new connection record. The FlutterFlow app uses generic `ConnectionCard`, `ActionCard`, and `ProofDrawer` components, so no new bottom-navigation item or app release is required for ordinary provider additions.

This is the required meaning of **plug into all other MCPs**: one governed dynamic bridge, many backend connections, one simple owner experience.
