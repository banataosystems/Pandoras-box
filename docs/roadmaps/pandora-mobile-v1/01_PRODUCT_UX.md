# 01 — Product & UX Specification

## Home — Owner Briefing

Primary job: answer in seconds: **What needs me? What is Pandora doing? What is blocked? What happens next?**

Above the fold:
1. product/owner header
2. system posture with freshness
3. Needs You
4. autonomous work
5. portfolio summary
6. Ask Pandora entry

Needs You items show plain title, project, why the owner is needed, risk, proof state, and recommended next action. Separate external blockers from ordinary engineering work. Never expose raw JSON or internal IDs.

## Projects

Project cards show:
- name and one-line purpose
- phase
- proof ladder
- blocker
- next autonomous action
- freshness

Filters: Needs me, Active, Blocked, Stale, Recently changed, Production verified.

Project detail structure:
Overview · Current phase · Proof ladder · Done · In progress · Blocked · Risks · Next action · Evidence · Deployments/rollback · Activity.

Never render unverified progress as `0%`. Use “Progress not verified.”

## Command

Replace manual action-ID flows with natural-language objectives.

Flow:
1. objective
2. infer/select project
3. Pandora interpretation
4. proposed actions
5. risk + target + preconditions
6. existing evidence + missing proof
7. plan preview
8. create governed plan
9. route approval if required
10. execute separately after approval

No mutation is auto-executed from natural language. Never auto-retry a mutation after an ambiguous network outcome.

## Approvals

Approvals are a contextual queue, not a manual ID form.

Queue card:
- action
- project
- provider/target in human language
- risk
- requester
- expiry
- impact
- evidence completeness

Detail:
- what Pandora wants to do
- why now
- exact target
- what changes
- risk and reversibility
- rollback state
- evidence passed
- evidence missing
- requester
- policy requirements
- sanitized payload/diff
- technical identity
- Approve / Reject

Approve is not execute. Expired or duplicate decisions fail closed. Biometrics may improve local convenience but never replace backend owner authorization.

## Activity

Human-readable timeline:
- event title
- project
- actor
- provider
- result
- time
- risk
- concise outcome

Filters: project, result, risk class, provider, time, actor. Hashes and IDs are one level deeper. Audit-chain validity stays visible at the top.

## Connections

Connection card:
- provider
- account/workspace display name
- health
- scopes summary
- allowlisted targets
- mutation capability
- last successful operation

Secrets never render. Technical IDs are copyable but secondary.

## Safety

Four sections:
1. Identity & Access
2. Approval & Execution
3. Source Authority
4. Runtime & Secrets

Statuses: Healthy · Needs attention · Blocked · Not checked · Not applicable. Do not create a misleading aggregate security score.

## Sign-in / Account

Upgrade with approved mark, system themes, password visibility, autofill/password-manager support, session-expiry explanation, recovery flow, and optional post-login biometric convenience subject to security review.

## Developer Diagnostics

Raw machinery belongs here:
- raw API responses
- runtime endpoints
- source commit
- build version
- organization ID
- request correlation IDs
- cache state
- provider refs
- network diagnostics

Owner-only and secret-sanitized.

## Global UX rules

- null never renders literally
- timestamps get relative human text plus exact detail
- unknown enums render safe “Unknown” plus diagnostics
- structural skeletons instead of generic spinners
- meaningful empty states
- stale data always shows last verified time
- degraded views may remain read-only where safe
- success confirms what happened, what remains, and where evidence was recorded
