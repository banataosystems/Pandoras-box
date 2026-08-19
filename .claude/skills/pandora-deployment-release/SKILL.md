---
name: pandora-deployment-release
description: "Prepare, gate, verify, and roll back an identified release candidate. Load when promoting a known candidate to an environment, verifying a deployment's source binding, planning or proving rollback, or checking whether a specific artifact is live. Assumes the candidate and its proof state are already established; for an open-ended or unexamined release request, pandora-control-tower runs first. Enforces exact artifact-to-source binding, proven rollback, and the rule that a READY deployment is never production verification."
---

# Pandora Deployment & Release

Two rules govern everything here:

1. **A READY deployment is not production verification.** READY means a build finished. It does not mean the right code is serving, that it works, or that users can reach it.
2. **Production release stays separately owner-authorized** unless a different durable policy explicitly permits it. A passing gate is permission to *ask*, not permission to release.

The cautionary case is in this repository's own history: a READY Vercel deployment sat behind Deployment Protection and returned 401 before application code ever ran. Every automated signal was green. Nothing worked.

## Release candidate

A candidate is immutable and exactly identified:

```
source SHA · tree SHA · repository · base SHA
build artifact identity (deployment ID, image digest, or artifact hash)
migrations included, with hashes
rollback target: exact prior artifact + its source SHA
proof state per capability
review verdicts, bound to this SHA
```

If any field is a branch name or "latest", the candidate is not identified. Fix that before proceeding.

## Artifact-to-source binding

**Verify the deployment was built from the SHA you think it was.** Read the deployment's recorded source commit from the provider and compare it to the candidate SHA.

Binding breaks quietly when a deployment is created outside the normal path, when git metadata points at a stale or blacklisted repository, or when a build is promoted rather than rebuilt. A deployment whose git metadata names a historical-only repository is a source-reliability defect and must be reported as one — legacy provenance never confers current authority.

Unbindable artifact → the capability is not `deployed` in any meaningful sense. Report it.

## Gates

Each gate is met with evidence, not assertion:

| Gate | Met when |
|---|---|
| Tests | Named suites passed on the **exact candidate SHA**, with run IDs |
| Independent review | PASS at the exact head, from a reviewer who did not author it |
| Security review | PASS, with no open CRITICAL or HIGH |
| Parity | Source matches provider state (migrations, config) |
| Preview acceptance | Actual capability exercised in preview, not just a health check |
| Rollback | Rollback artifact identified **and proven** |
| Monitoring | Something would detect a regression |
| Authorization | Explicit owner authorization for this specific release |

**Never weaken a gate to release.** If a gate cannot be met, the honest outcome is that the release does not happen and the blocker is named.

Every mutation in this flow — promoting a deployment, changing an alias or domain, applying a migration as part of the release, executing a rollback — is a provider mutation and goes through `pandora-governed-execution` (plan → approve → execute). A release is not an exception to the governed path; it is the case the governed path exists for.

## Environment separation

Preview and production must be genuinely distinct: separate environment variables and secrets, separate data, separate domains. Verify separation rather than assuming it — a preview pointed at the production database is a data-loss incident waiting for its trigger.

Confirm which environment a deployment actually serves; do not infer from a URL.

## Preview acceptance

Exercise the real capability against the preview: the user flow end to end, on a real device viewport if mobile is in scope, with authorization paths tested as each role.

A 200 from `/health` accepts nothing. Acceptance means the thing the feature exists to do was observed working.

## Rollback

**Proven** means: the exact prior artifact is confirmed retrievable and deployable, the database rollback (if any) has been replayed, and the path has been exercised or explicitly verified — not that a previous deployment ID was written down.

Data migrations often have no clean rollback. Say so when true, and make the forward path safe instead (additive changes, dual reads) rather than claiming a rollback that does not exist.

Rehearse rollback before the release that might need it, not during the incident.

## Production verification

After release, verify on the exact production artifact:

- the capability behaves correctly for a real user path
- authorization behaves correctly for each role, including denial
- error rates, latency, and logs are within expectation
- monitoring is live and would catch a regression
- the rollback target remains valid for the new state

Only then is the capability `production_verified`. Record the deployment ID, source SHA, what you observed, and when.

## Post-release

Watch for a defined window. Know your rollback trigger *before* releasing — the error rate, latency, or failure signature that means revert — so the decision under pressure is mechanical rather than improvised.

Close the release: record outcome, evidence, and the new rollback baseline via `pandora-evidence-ledger`.

## Output

```
CANDIDATE     <sha> · tree <sha> · artifact <id>
BINDING       deployment <id> built from <sha> — verified: <bool>
ENVIRONMENT   <env> · separation verified: <bool>
GATES         <each gate>: met | unmet — <evidence>
ROLLBACK      <artifact> · proven: <bool> · <how>
AUTHORIZATION <owner authorization ref, or NOT AUTHORIZED>
PROOF STATE   <stage>
VERIFICATION  <what you actually observed in the environment>
```

## Handoff

Gate unmet → the skill that owns it.
Any deployment, promotion, alias change, or rollback mutation → `pandora-governed-execution`.
Release authorization needed → escalate per `pandora-governance-contract/references/escalation.md`.
Post-release monitoring → `pandora-runtime-observability`.
