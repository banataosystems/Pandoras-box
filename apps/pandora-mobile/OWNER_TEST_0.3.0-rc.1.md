# Pandora Mobile 0.3.0-rc.1 — Owner Test

This build is a **non-production Android pre-release** for validating whether Pandora is becoming the right owner/admin control center. It is not a production release, does not authorize a merge, and does not satisfy the physical-device or production-verification gates by itself.

## Truth model

Pandora must keep these states distinct:

`Documented → Implemented → Tested → Deployed → Production Verified`

A build, passing CI, or provider `READY` state must never be presented as Production Verified.

## What to test

Use the app as an owner, not as a developer. Begin at Home, then inspect Projects, Activity, Approvals, Command, Memory, Connections, Safety, and Settings. Missing backend capabilities must appear as honest degraded or unavailable states rather than invented success.

## Ten product questions

1. Within five seconds of opening Home, can you tell what is happening and what needs your attention?
2. Is the single recommended next action obvious, useful, and safe enough to trust?
3. Can you understand each project’s purpose, phase, proof state, blocker, latest verified result, and next action without knowing GitHub or CI/CD?
4. Does Activity describe meaningful outcomes and worker actions rather than dumping technical logs?
5. Before approving, can you clearly understand the action, reason, impact, risk, environment, reversibility, cost implication, and what approval does not do?
6. Does Command make it natural to express an outcome, understand Pandora’s interpretation, and follow progress toward a working result?
7. Does Memory clearly distinguish approved knowledge, proposed state, freshness, and degraded or stale information?
8. Do Connections translate provider health into understandable healthy, degraded, unavailable, or action-required language?
9. Does Safety make release risk, rollback qualification, incidents, and recovery readiness understandable without claiming recovery that is not verified?
10. Does the complete experience feel calm, premium, coherent, accessible, and simpler than the infrastructure underneath it?

## Evidence to record

Record the exact APK filename and SHA-256, Android device model/version, install and launch result, authentication/session result, screens visited, any visual or interaction defects, provider reads attempted, governed actions attempted, and whether each result was verified or merely displayed.

Do not enter credentials, tokens, private customer data, or sensitive production information into screenshots or issue reports.
