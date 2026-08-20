---
name: pandora-security-review
description: "Independent security review of code, database, authorization, CI, and provider configuration. Load when asked for a security review or threat model; when changes touch authentication, authorization, RLS, secrets, dependencies, CI permissions, or tenant isolation; before any release gate; and when a vulnerability is suspected. Issues PASS / PASS WITH NON-BLOCKING FINDINGS / FAIL and never weakens criteria to let a candidate through."
---

# Pandora Security Review

Independent, evidence-based, fail-closed. The same independence rule as `pandora-exact-head-review` applies: **report findings, do not repair them and then approve your own repair.**

Security findings are never "non-blocking" as a convenience. If a control is missing, the verdict is FAIL.

## Scope by change type

Review what the change actually touches; do not run every checklist on every diff.

### Authorization
The highest-value area and the most commonly wrong.

- Is authorization enforced **server-side**, on every path, including ones the UI does not expose?
- Does it **fail closed** — does an unknown role, absent claim, or error deny rather than allow?
- Can a user reach another tenant's data by changing an ID? Test this specifically; it is the single most common real breach.
- Are privilege boundaries (owner / admin / operator / service) actually distinct in enforcement, not just in naming?
- Are there negative tests proving denial? An authorization path with only positive tests is untested.

### Database (Supabase / PostgreSQL)
- RLS enabled on every table holding user or tenant data — enabled *and* with policies. RLS on with no policy denies everything; RLS off with policies enforces nothing. Both appear in advisors and both are defects.
- `SECURITY DEFINER` functions: who can execute them, what do they do with elevated rights, and is `search_path` pinned? An empty or mutable `search_path` on a definer function is a privilege-escalation path.
- Function EXECUTE ACLs — is `PUBLIC` or `anon` able to call something meant for `service_role`?
- Trigger side effects, and whether they can be driven by untrusted input.
- SQL injection anywhere strings are concatenated into queries, including inside functions.

### Secrets
- No credentials, tokens, keys, or OIDC material in source, config, logs, error messages, PR bodies, test fixtures, or Memory.
- Secrets referenced from a secret store, not inlined.
- Check whether a secret was ever committed historically — rotation is required even after removal, because history retains it.

### CI/CD and supply chain
- Workflow permissions least-privilege; no blanket `write-all`.
- Untrusted input (PR titles, branch names, issue bodies) never interpolated into shell — script injection.
- Actions pinned to SHAs, not floating tags.
- No secret exposure to workflows triggered by untrusted contributors.
- Dependency integrity: lockfile present and honored, no unexplained new dependencies.

### Web and API
Input validation server-side · output encoding · CSRF on state-changing requests · CORS not wildcarded with credentials · rate limiting on authentication and expensive paths · SSRF wherever user input becomes a URL · security headers.

### Tenant isolation
Every query scoped by tenant · no cross-tenant identifier leakage · shared caches keyed by tenant · background jobs carrying tenant context rather than running unscoped.

### Logging and privacy
No PII, credentials, tokens, or message contents in logs or telemetry. Errors that echo request bodies are a common leak. Route depth to `pandora-privacy-data-governance`.

## Threat modeling

For a new capability, name the assets, the trust boundaries, who the adversary is, what they gain, and what control stops them. Keep it proportional — a booking form does not need a nation-state model, but it does need "can another customer read this booking?" answered concretely.

## Verifying remediation

A fix is verified when you have re-tested the exact attack path against the exact new SHA and it fails. Not when a patch exists, not when a test was added, not when the implementer says it is fixed.

Re-test the original path, check the fix did not simply move the vulnerability, and confirm no control was weakened elsewhere to accommodate it.

## Advisors

Provider advisors (Supabase security and performance lints) are input, not verdicts. Read every finding, decide whether it applies, and record the ones you deliberately accept with a reason. **Never disable a lint to clear a finding.**

Advisor counts belong in evidence: N notices, M WARN, and which specific ones remain open.

## Output

```
SCOPE         <what was reviewed> at <exact sha>
INDEPENDENCE  <confirmation you did not author or repair this>

VERDICT       PASS | PASS WITH NON-BLOCKING FINDINGS | FAIL

FINDINGS
  [CRITICAL] <finding>
    impact:   <what an attacker achieves>
    evidence: <file:line, query result, config, advisor id>
    fix:      <what would remediate — for the implementer to apply>
  [HIGH] / [MEDIUM] / [LOW] ...

VERIFIED      <controls you confirmed work, with how you confirmed>
NOT VERIFIED  <what you could not test, and why>
ACCEPTED      <advisor findings deliberately accepted, with reasons>
```

Severity reflects impact, not ease of fixing. A trivially fixable authorization bypass is CRITICAL.

## Handoff

FAIL → back to the implementer. You do not fix it.
Database depth → `pandora-supabase`.
Authorization architecture → `pandora-auth`.
Regulated surface → `pandora-regulated-activation`.
Record the verdict → `pandora-evidence-ledger`.
