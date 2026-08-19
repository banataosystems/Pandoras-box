# Pandora Mobile 0.3.0-rc.1 — Owner Test contract

This candidate is a **non-production GitHub pre-release** for owner product testing. It is not a store-ready Android release and does not authorize a production deployment or merge.

## Product acceptance journey

Launch Pandora → authenticate → understand platform status → open a project → inspect phase and proof → review active work and approvals → inspect provider health and recovery → issue an instruction → observe governed execution → see the verified result.

## Truth model

Pandora must keep these states distinct:

Documented → Implemented → Tested → Deployed → Production Verified

A successful build, CI run, preview, provider `READY` state, or APK installation is never presented as production verification.

## Owner Test scope

The candidate covers the production Home, Projects, Activity, Approvals, Command, Connections, Memory, Safety/Recovery, Settings, and advanced evidence experiences. Provider-backed states must remain honest when upstream contracts are degraded or unavailable.

The Android artifact is built in release mode with the Android debug key and is classified only as an Owner Test pre-release. Physical-device installation, authenticated owner journey, independent code/security review, release recovery proof, and production verification remain separate gates until exact-head evidence exists.

## Visual evidence contract

Foundation goldens use the reviewed transparent Pandora mark with no matte rectangle. Production-screen evidence must include all 15 declared owner-screen cases, including compact-phone, dark, degraded, loading, and 1.6× text states. Capture-only evidence is not sufficient for final visual-regression acceptance; reviewed production baselines must be committed and required by CI.

Production-screen captures load `Roboto-Regular.ttf` from the pinned Flutter SDK and fail closed if that font is unavailable. This keeps screenshot text readable without committing or distributing a separate font file and leaves production application source unchanged. The harness does not silently fall back to Flutter's block-style test font. SDK font file I/O and font registration run in Flutter's bounded real-async test zone; screen state and rendering remain in the deterministic widget-test clock.
