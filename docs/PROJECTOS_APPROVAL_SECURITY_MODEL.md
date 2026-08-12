# ProjectOS approval security model

Owner decision: AAL2/TOTP is not required for ordinary MCPMaster/ProjectOS plan approval.

The authorization and execution sequence is:

1. An authenticated human has an active membership in the exact ProjectOS organization.
2. Only an `owner` or `admin` may approve the exact pending durable plan.
3. Approval records the authenticated human identity. It does not execute the plan.
4. A separate owner/admin action claims and executes the exact approved plan once.
5. Every meaningful lifecycle transition is audited.

Read tools may execute automatically when current policy classifies them as reads. Writes and destructive operations use durable plans, exact payload hashes, expiry, and one-time claim semantics. Provider scopes, account/project/repository allowlists, connector mutation switches, confirmation text, and server-only internal credentials remain enforced.

Destructive operations retain their independent controls. High-impact provider operations remain disabled unless the separate supervised break-glass switch is explicitly enabled, and manifest-defined confirmation text must match exactly.

Machine credentials remain operator/service identities. They cannot declare or inherit owner/admin status and cannot approve a human-governed plan. Caller-supplied approval, approver, Vercel OIDC, and other privileged internal headers are removed before the human session and organization membership are evaluated.

Supabase MFA may remain available at the identity provider, and separate sensitive connection or destructive workflows may retain independently classified step-up controls. MCPMaster/ProjectOS does not require AAL2/TOTP for ordinary plan approval or OAuth consent.

OAuth consent continues to require an authenticated Supabase session, active ProjectOS membership, a valid registered client and authorization request, PKCE S256, bound short-lived browser state, registered redirect handling, explicit scopes, and explicit approve or deny consent. Both the MCP boundary and the operator bridge require OAuth-scoped tokens to carry `openid` plus the exact `projectos:read`, `projectos:plan`, `projectos:approve`, or `projectos:execute` scope for each action. Unscoped first-party Control Tower sessions remain role-bound; malformed or identity-only OAuth grants cannot widen into ProjectOS plan, approval, or execution authority.
