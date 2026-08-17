# Pandora Mobile Owner Intelligence

This document records the governed owner-intelligence surface implemented on `feature/pandora-mobile-premium-foundation`.

## Owner-facing capabilities

- **Portfolio Intelligence** — summarizes system posture, pending owner decisions, high-value project signals, and ranked recommendations from authorized owner data.
- **Memory & Learning** — exposes owner-readable project truth and recent learning signals without silently promoting candidates into canonical Memory.
- **Universal Search** — searches the already-authorized local owner snapshot across projects, approvals, activity, and connections without sending each keystroke to providers.
- **Notifications** — prioritizes approvals, blockers, unverified progress, and meaningful owner-attention events while keeping raw telemetry in Developer Diagnostics.
- **Autopilot** — supports `Prepare next action` and `Continue safe work` through the governed Pandora command path. Safe-work delegation is explicitly bounded to reversible, no-cost connected work.
- **Release Center** — renders the documented → implemented → tested → deployed → production-verified proof ladder per project and shows blockers/next gates without equating a successful build with production verification.

## Fail-closed boundaries

The mobile client does not:

- embed provider secrets, service-role credentials, access tokens, or refresh tokens;
- silently promote learning candidates into canonical Pandora Memory;
- bypass approval and execution separation;
- treat cached read-only summaries as authority for approval, execution, or authorization;
- turn Autopilot into permission for new spending, destructive production/data changes, legal or public commitments, regulated activation, or production release;
- claim production readiness from source existence, formatting, compilation, automated tests, or an Android artifact alone.

## Acceptance boundary

The candidate source and test tree is normalized with the repository-pinned Flutter 3.47.0 Dart formatter before acceptance verification.

Source implementation is only **implemented** until the exact branch head passes the pinned mobile integration workflow (formatting, static analysis, complete Flutter tests/goldens, Web release build, and Android debug artifact) and ProjectOS security regression. A real authenticated Android-device journey, device accessibility/lifecycle verification, independent review when required, deployment, and production verification remain separate proof gates.
