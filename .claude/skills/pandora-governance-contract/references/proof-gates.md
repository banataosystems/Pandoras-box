# Proof gates — what each state actually requires

Read this when deciding which `proofStage` to claim, or when judging whether someone else's completion claim holds up.

## documented
A versioned artifact exists describing intent, at a known path and commit, with a content hash.

Required: repository path · commit SHA · SHA-256 of the content.
Insufficient: a chat message, a plan, an intention, a comment on a PR.

## implemented
Code, migration, or configuration exists at an exact commit and is syntactically valid.

Required: exact commit SHA · exact tree SHA · changed-file list.
Insufficient: a branch name (branches move) · a PR number (heads move) · "the code is written".

Use tree SHA, not just commit SHA, when you need to assert content identity across rebases.

## tested
Named tests executed against an exact SHA and passed.

Required: exact SHA tested · test suite identity · run/job ID · pass and total counts.
Insufficient: "tests pass locally" · a green check of unknown provenance · CI green on a *different* SHA than the one under review.

The most common fraud here is CI-green-on-a-moving-head: the check ran on an earlier commit and the head advanced. Always bind the run to the SHA.

## deployed
An exact artifact is live in a named environment, and you have verified the binding between the deployed artifact and the source SHA.

Required: deployment ID · environment · exact source SHA the deployment was built from · READY/ACTIVE state.
Insufficient: a READY status alone. READY means the build finished, not that the right code is serving, and not that it works.

The Pandora repository's own history is the cautionary case: a READY Vercel deployment sat behind Deployment Protection and returned 401 before application code ever executed. READY was true and meaningless.

## production_verified
Observed correct behavior in production, on the exact deployed artifact, with rollback proven.

Required, all of them:
- exact production artifact identity (deployment ID + source SHA)
- observed correct behavior of the actual capability, not just a health endpoint
- monitoring in place that would detect regression
- a rollback target that has been proven to work, not merely identified

Insufficient: a merged PR · a green pipeline · a 200 from `/health` · an agent's assertion · "it deployed and nothing broke".

Rollback "proven" means the rollback path was exercised or its exact artifact was verified retrievable and deployable — not that a previous deployment ID was written down.

## Downgrade rules

State degrades when its binding breaks:
- head advances past the tested SHA → `tested` reverts to `implemented`
- deployment replaced → `deployed` and `production_verified` revert
- migration applied to provider but absent from source → parity is broken; the capability is at most `deployed`, never `production_verified`, until source parity is restored

Do not carry a stale proof state forward because it was true last week.
