---
name: pandora-mobile-flutter
description: "Build, verify, and release mobile and PWA experiences — Flutter, Dart, FlutterFlow, Android, iOS, responsive web, and installable PWAs. Load for mobile app work, viewport and device verification, build pipelines, APK/AAB artifacts, app-store readiness, or when checking that an owner-facing workflow actually works on a phone. Enforces real-device-class verification over emulator-only claims."
---

# Pandora Mobile & Flutter

The owner operates from a smartphone. Mobile is not a secondary target here — it is the primary operating surface for the person running the platform.

## The owner-experience constraint

Never design a workflow that requires the owner to open a terminal, run CLI commands, clone a repository, hand-edit source, download-edit-upload files, use a developer console, or copy code between providers — when a connected tool can do it.

When you catch yourself about to write "then run `flutter build`", stop and check whether a connected capability can do it instead. If none can, that is a **capability gap to report**, not a task to hand to the owner. Reporting the gap honestly is more useful than an instruction they cannot follow from a phone.

## FlutterFlow

The connected FlutterFlow provider is **read-only**: it lists accounts and allowlisted projects and returns a fail-closed readiness assessment. It registers no update, export, deploy, or release operation.

This matters for honest reporting: **Project API access is not deployment readiness**. Being able to read a project's structure tells you nothing about whether it builds, works, or is releasable. Do not let a successful readiness read become a claim that the app is deployable.

## Flutter architecture

Separate presentation, business logic, and data. Pick one state-management approach and use it consistently — mixed approaches in one codebase are the main source of Flutter maintenance pain.

Keep platform-specific code behind a single abstraction rather than scattering platform checks through the widget tree. Build for the smallest supported viewport first and expand; the reverse order produces layouts that break on real phones.

## Responsive and device verification

Verify at real device classes, not one convenient emulator size: small phone (~360×640), standard phone (~390×844), large phone, tablet, and desktop web if targeted.

Check specifically: no horizontal overflow at any width · touch targets at least 44–48px · safe-area insets respected (notches, home indicators) · text scaling at large accessibility sizes without clipping · landscape orientation if supported · keyboard-open layout, where the field being typed into stays visible.

That last one is the most-missed defect in mobile forms and the most visible to users.

## Platform specifics

**Android** — target and minimum SDK stated deliberately. Permissions requested at point of use with a reason, not all at launch. Back-navigation behaves correctly. Test on a low-end device profile; mid-range Android is the real-world floor.

**iOS** — safe areas, swipe-back gesture, permission strings present and honest.

**PWA** — a valid manifest, an installable configuration, an offline story that is deliberate (even if "shows a clear offline message"), and a service worker whose caching strategy will not serve stale critical data. Verify installability directly rather than assuming it from the manifest's presence.

## Builds and artifacts

Record for every build: exact source SHA · build configuration (debug/profile/release) · toolchain versions · artifact hash · target platform. Without this binding, an artifact cannot be tied to reviewed source and cannot support a release claim.

**Signing.** Signing keys are secrets — never in source, never in CI logs, never in evidence. Loss of an Android signing key permanently prevents updating a published app, so key custody and backup are an owner-level concern, not an implementation detail. Never generate or rotate signing keys without explicit authorization.

## Testing

Widget tests for component behavior · integration tests for real flows · golden tests for visual regression where layout matters, understanding that they need updating deliberately rather than automatically.

**An emulator pass is not device verification.** Emulators miss performance on real hardware, real network conditions, actual touch ergonomics, and platform-specific rendering. State which you actually did — "verified on emulator" is honest and useful; calling it device verification is not.

## App-store readiness

Readiness is a checklist, and each item is either done or not: signed release artifact · privacy policy accurate to what the app collects · store listing and assets · permission justifications · data-safety declaration matching actual behavior · account-deletion path where required · tested install-from-artifact on a clean device.

A data-safety declaration that does not match actual behavior is a compliance problem, not a paperwork one. Verify against what the code does.

Store submission is an outward-facing action requiring owner authorization.

## Output

```
PLATFORM      <targets>
ARCHITECTURE  <state management, structure>
VIEWPORTS     <verified sizes and results>
ACCESSIBILITY <touch targets, text scaling, contrast>
BUILD         <sha> · <config> · <artifact hash> · toolchain <versions>
TESTING       <what ran, and on emulator vs real device>
SIGNING       <configured: bool — never the key material>
READINESS     <checklist state>
PROOF STATE   <stage>
OWNER PATH    <how the owner does this from a phone, or the capability gap>
```

## Handoff

UI quality → `pandora-ui-ux`. Release → `pandora-deployment-release`.
Pipeline → `pandora-cicd`. Mobile security → `pandora-security-review`.
