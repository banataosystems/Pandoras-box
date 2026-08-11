# Pandora's Box — Full-Capacity Master Plan

**Status:** canonical implementation plan candidate  
**Date:** 2026-08-12  
**Canonical project:** Pandora's Box / MCPMaster  
**Canonical source repository:** `banataosystems/Pandoras-box`  
**Current app project:** `pandoras-box-gj9hnb`  
**Primary device:** smartphone  
**Release policy:** production release is **not authorized by this plan** and always requires a separate explicit owner approval for the exact candidate.

---

## 1. Product objective

Pandora's Box becomes the single owner-facing operating surface for building, changing, checking, publishing, monitoring, and undoing applications and systems. The owner describes the desired outcome in normal language. Pandora chooses and operates the implementation tools behind the scenes.

The user-facing lifecycle is intentionally small:

**Build → Preview → Fix → Publish → Live → Undo**

Everything underneath this lifecycle—visual builder, project schema, project APIs, source export, Git, build runners, hosting APIs, database services, authentication, tests, release manifests, deployment IDs, hashes, provider errors, rollback machinery, and policy engines—is an implementation detail.

### Non-negotiable product rule

The word **FlutterFlow must never appear in any user-visible Pandora surface**. This includes normal pages, advanced pages, error messages, notifications, approval copy, activity rows, screenshots generated for the user, connection lists, help text, release summaries, live status, audit summaries, or exported user-facing reports.

The same presentation firewall applies by default to `MCP`, `YAML`, `CI`, `provider`, `token`, and other infrastructure jargon. Pandora translates the implementation state into owner language.

Internal engineering source, audit evidence, provider contracts, and server logs may retain the exact implementation identifiers when required for provenance, but those fields are never rendered directly into the owner UI.

---

## 2. Current verified baseline

This plan starts from the current exact branch state rather than from a greenfield design.

### Verified source baseline

- Repository: `banataosystems/Pandoras-box`
- Active app branch at planning start: `feature/flutterflow-pandora-mobile-v1`
- Exact branch head at planning start: `f5db616d7ba6c57acdeda25387c9b69cffd620d5`
- Exact app project ID already verified: `pandoras-box-gj9hnb`
- Project partitioner version: `9`
- Recorded schema fingerprint: `f237da5d53110b3aa14501753ed13f6687ce0033`
- Current provider defect repair snapshot: `15e6d5e8-bbcb-4812-b507-f20fbed88ef8`

### Current proof ladder

- **Documented:** yes
- **Implementation prepared:** yes
- **Provider project read/write client overlay:** implemented and type-checked
- **Provider credential live acceptance:** verified through the governed server-side path
- **Exact app project:** verified
- **Previously evidenced project defects:** repaired and read back
- **Owner API bridge:** implemented; contract/client tests passed; edge function deployed
- **Page layer fully wired to truthful live owner API:** not yet proven
- **Android-first visual/navigation verification:** not yet proven
- **Protected approval/AAL2 flow in the app:** not yet proven
- **Generated application fully tested:** no
- **Application deployed:** no
- **Production verified:** no

### Current architectural truth

The existing mobile project is retained and upgraded. Do not create a replacement project merely to obtain a cleaner starting point. Preserve project history and rollback evidence.

The current backend already has a governed owner-facing API boundary. The next architecture extends that boundary so Pandora can inspect, modify, export, test, version, deploy, verify, and undo the application without exposing the implementation provider to the owner.

---

## 3. Target architecture

### 3.1 Owner surface

The Pandora app exposes only owner concepts:

- **Build** — create or change something.
- **Preview** — show what it will look like or do before it becomes live.
- **Fix** — diagnose and repair safe issues.
- **Publish** — prepare an exact release candidate and ask for approval when required.
- **Live** — show what is actually running and when it was last verified.
- **Undo** — restore the last safe version or a selected verified version.

### 3.2 Pandora orchestration plane

The orchestration plane receives owner intent and decides which internal capability should run. It owns:

- project identity and scope;
- permissions;
- action policy;
- evidence requirements;
- environment selection;
- provider routing;
- retries and ambiguity handling;
- approval state;
- release state machine;
- rollback selection;
- plain-language translation;
- final status reporting.

### 3.3 Hidden app-engine adapter

Internally, the current visual-builder/project API remains an app-engine implementation adapter. It is not a first-class user concept.

The adapter supports:

1. project discovery;
2. project structure inspection;
3. exact partition/file reads;
4. schema/version/fingerprint inspection;
5. validation before mutation;
6. minimal partition updates;
7. read-back verification after updates;
8. code export;
9. provider branch/environment selection when supported;
10. provider-contract drift detection.

The adapter must fail closed when the project schema changes unexpectedly.

### 3.4 Source-export plane

A release does not depend on the visual builder's hosted Publish button.

Pandora exports the complete generated Flutter application using the provider's official code-export mechanism. The exported application then becomes a normal Flutter source tree under Pandora's release pipeline.

Required export evidence:

- project ID;
- provider branch/environment;
- export time;
- provider project schema fingerprint/version;
- Flutter/Dart compatibility information available from the export;
- complete file manifest;
- SHA-256 of every relevant source file or a content-addressed manifest root;
- complete source archive SHA-256;
- dependency lockfile hash;
- asset manifest hash.

No provider credential is stored in the exported source.

### 3.5 Source-control plane

Generated application source is preserved in GitHub before any release claim.

Target layout:

- canonical product/control source remains in `banataosystems/Pandoras-box`;
- generated app source is stored under a dedicated release-controlled subtree or exact candidate branch;
- every export is content-addressed;
- parent history is preserved;
- generated source is never silently overwritten without preserving the previous manifest;
- release candidates are immutable once they enter verification.

Recommended candidate naming:

`release/pandora-mobile/<YYYYMMDD>-<short-source-hash>`

Recommended release identity:

`pandora-mobile-<source-sha-prefix>-<candidate-sequence>`

### 3.6 Build and verification plane

After export and versioning, Pandora runs the generated Flutter project independently from the visual builder.

Minimum checks for every web release candidate:

1. dependency resolution using the compatible Flutter toolchain;
2. `flutter analyze` with zero release-blocking errors;
3. unit/widget tests;
4. integration/smoke tests required by the candidate scope;
5. forbidden-user-string scan;
6. secret scan;
7. security configuration checks;
8. `flutter build web` release build;
9. serve the exact `build/web` artifact and test it locally/ephemerally;
10. visual regression checks for required screens/themes/viewports;
11. generated artifact manifest + SHA-256.

Android candidates additionally require Android build verification and device/emulator checks. iOS candidates require a macOS build/signing pipeline and Apple signing assets isolated in an approved secret store.

### 3.7 Hosting plane

Hosting is implemented through an adapter interface rather than hard-coding the product to one vendor.

Required hosting adapter operations:

- `prepareCandidate`
- `deployPreview`
- `verifyPreview`
- `stageProductionCandidate`
- `promoteExactCandidate`
- `verifyLive`
- `rollbackToRelease`
- `getLiveRelease`
- `getDeploymentLogs`
- `checkDomain`

Vercel is the default web adapter where already configured, but the release state machine does not depend on Vercel-specific terminology.

The exact tested web artifact should be the artifact promoted live. Avoid rebuilding after the owner's release approval when the host supports artifact promotion. Candidate immutability prevents "tested one thing, deployed another" failures.

### 3.8 Release evidence ledger

Every candidate receives a release manifest containing at minimum:

- `candidate_id`
- project key
- source project ID
- provider snapshot/read-back identifier
- source export SHA-256
- Git repository + exact commit SHA
- parent candidate/release ID
- dependency lock hash
- Flutter/Dart versions
- test suite results
- static-analysis result
- security/secret scan result
- visual QA manifest
- web/mobile build artifact SHA-256
- preview deployment ID and URL
- preview verification result
- owner approval record when required
- identity-assurance result for protected approval
- production deployment/promoted artifact ID
- live URL/domain
- production verification checks
- rollback target release ID
- rollback verification result
- timestamps

The manifest never contains passwords, API keys, bearer tokens, private customer content, or protected documents.

---

## 4. Capability model

All capabilities are explicit, project-scoped, environment-scoped, and independently grantable.

### 4.1 Inspection

Internal scope family: `app.inspect.*`

Capabilities:

- discover project metadata;
- list pages/components/actions;
- inspect navigation;
- inspect state variables;
- inspect API/action bindings;
- inspect design tokens;
- inspect custom code;
- inspect branch/environment metadata;
- inspect generated source manifests;
- search project-wide references;
- detect broken/dead references;
- compare current state with a snapshot.

Default policy: automatic, read-only, audited.

### 4.2 Validation

Internal scope family: `app.validate.*`

Capabilities:

- project schema validation;
- change-set validation;
- type/reference validation;
- navigation integrity validation;
- user-facing terminology lint;
- design token conformance;
- secret exposure lint;
- accessibility lint where mechanically testable.

Default policy: automatic, no owner interruption.

### 4.3 Snapshot and recovery

Internal scope family: `app.snapshot.*`

Capabilities:

- provider snapshot/read-back capture;
- source manifest capture;
- content hashes;
- diff generation;
- rollback target selection;
- snapshot restore preparation.

Default policy: automatic before consequential writes and before release preparation.

### 4.4 App modification

Internal scope family: `app.edit.*`

Capabilities:

- design token edits;
- page/component edits;
- navigation edits;
- state/action edits;
- API binding repairs;
- generated/custom-code edits where allowed;
- whole-project safe refactors;
- user-facing copy updates;
- accessibility fixes.

Default policy:

- safe, reversible, no-cost changes in a non-live work context may execute autonomously after snapshot + validation;
- security-boundary changes, permission expansions, destructive operations, paid changes, or live changes require the applicable approval gate;
- no ambiguous write is automatically retried.

### 4.5 Source export

Internal scope family: `app.export.*`

Capabilities:

- export exact generated source;
- select provider branch/environment;
- include required assets;
- generate content-addressed manifest;
- compare export to previous source snapshot.

Default policy: automatic when preparing Preview/Publish; no live effect.

### 4.6 Source versioning

Internal scope family: `source.version.*`

Capabilities:

- create candidate branch;
- write exported source;
- commit exact export;
- attach manifest;
- tag verified candidate;
- compare candidates;
- preserve parent history.

Default policy: automatic on work/release branches; never rewrite historical recovery evidence.

### 4.7 Build and test

Internal scope family: `release.check.*`

Capabilities:

- dependency resolution;
- static analysis;
- unit/widget/integration tests;
- release web build;
- Android build;
- iOS build on approved macOS runner;
- visual regression;
- responsive checks;
- accessibility checks;
- terminology/secret checks.

Default policy: automatic.

### 4.8 Preview deployment

Internal scope family: `release.preview.*`

Capabilities:

- deploy protected preview;
- verify preview;
- collect logs;
- compare preview release marker with candidate manifest.

Default policy: automatic only when it is reversible, uses an already-authorized no-new-spend destination, and does not create a new public/legal commitment. Otherwise request approval.

### 4.9 Production publication

Internal scope family: `release.live.*`

Capabilities:

- stage exact candidate;
- request release approval;
- promote exact candidate;
- verify live;
- bind custom domain;
- mark release current.

**Default policy: always blocked until a separate explicit owner approval exists for the exact release candidate.**

This plan supersedes any earlier broad release authorization for this application. A prior approval cannot be silently carried forward to a later candidate.

### 4.10 Rollback

Internal scope family: `release.rollback.*`

Capabilities:

- restore the last production-verified version;
- restore a named verified version;
- verify rollback live;
- mark failed candidate superseded.

Policy:

- release approval may pre-authorize an automatic rollback to the immediately previous production-verified release if post-promotion verification fails;
- rollback to any other version requires the applicable owner approval unless incident policy explicitly preauthorizes it.

---

## 5. Permission and identity model

Use least privilege with separate principals/functions for separate duties.

### Required internal principals

1. **Inspector** — project read only.
2. **Validator** — validation only; no mutation.
3. **Editor** — project-scoped, non-live edits only.
4. **Exporter** — source export only.
5. **Source writer** — release branch/manifest Git operations only.
6. **Build worker** — source read + build/test; no provider write or production promotion.
7. **Preview deployer** — preview environment only.
8. **Release promoter** — exact approved candidate only; short-lived grant.
9. **Rollback executor** — last verified production artifact only unless broader approval exists.
10. **Evidence recorder** — append-only release/audit records; no release authority.

### Required boundaries

- no wildcard production grant across all app projects;
- no user/mobile-client access to provider credentials;
- server-side secrets only;
- short-lived workload grants where possible;
- exact repository/ref/workflow/commit binding for automated credential handoff;
- exact project ID binding;
- environment binding;
- audit allow/deny/error;
- protected actions require the configured extra identity check;
- secret values never enter GitHub, analytics, screenshots, semantic Memory, or user-visible error messages.

---

## 6. Release state machine

A release candidate moves through explicit states:

1. `draft_change`
2. `validated_change`
3. `provider_snapshot_saved`
4. `provider_change_applied`
5. `provider_readback_verified`
6. `source_exported`
7. `source_versioned`
8. `source_checks_passed`
9. `release_artifact_built`
10. `preview_deployed`
11. `preview_verified`
12. `awaiting_release_approval`
13. `release_approved`
14. `production_staged`
15. `production_promoted`
16. `production_verified`

Failure states include:

- `validation_failed`
- `provider_write_ambiguous`
- `provider_readback_failed`
- `export_failed`
- `source_checks_failed`
- `build_failed`
- `preview_failed`
- `approval_rejected`
- `promotion_failed`
- `production_verification_failed`
- `rollback_in_progress`
- `rolled_back_verified`

No state transition may skip its required evidence.

---

## 7. Publish workflow

When the owner says **Publish**:

### Step 1 — Freeze and snapshot

- freeze the exact candidate change set;
- capture provider snapshot/read-back;
- capture current live release and rollback target;
- record current schema fingerprint/version;
- reject publication if a provider/schema drift is unresolved.

### Step 2 — Validate project state

- run provider validator against every changed partition;
- validate references/types/navigation;
- run forbidden user-facing terminology scan;
- verify no secrets are embedded in the client project;
- re-read changed partitions.

### Step 3 — Export real source

- export the complete generated Flutter project from the exact candidate branch/environment;
- preserve required assets;
- create source manifest and hashes;
- reject export if output is incomplete or provider export identity is ambiguous.

### Step 4 — Version source

- commit the exact export to an immutable candidate branch;
- record parent candidate;
- record export + lockfile hashes;
- do not overwrite the previous verified export.

### Step 5 — Analyze and test

At minimum:

- resolve dependencies;
- `flutter analyze`;
- automated tests;
- terminology leak scan;
- secret scan;
- route/deep-link checks;
- auth/session checks;
- owner API contract checks;
- responsive/visual checks;
- build release artifact.

### Step 6 — Deploy protected preview

- deploy the exact tested artifact to the selected preview host;
- record preview deployment ID/URL;
- verify boot, routing, auth entry, critical API health, and version identity;
- never label preview as live.

### Step 7 — Present owner release summary

User copy should be similar to:

- `Ready to publish`
- `All required checks passed`
- `Your current live version is saved and ready to restore`
- `This will replace the version people see now`
- `Publish now`

Technical proof remains expandable but translated.

### Step 8 — Separate explicit approval

The owner must explicitly approve the exact candidate after preview verification. Protected production release requires the configured extra identity check.

A generic earlier instruction to "finish everything" or "deploy when ready" is not sufficient for a newly generated candidate under this plan.

### Step 9 — Promote exact candidate

- promote the exact staged/tested artifact; avoid rebuilding;
- verify deployed release identity matches the approved manifest;
- record deployment/promotion ID.

### Step 10 — Verify live

Required minimum live checks:

- correct domain/URL responds;
- application bootstrap succeeds;
- expected static assets load;
- version marker matches approved candidate;
- sign-in entry works;
- owner API health path works from the live origin;
- primary navigation loads;
- no forbidden provider/jargon strings leak;
- no release-blocking console/runtime error;
- security/privacy checks required by the release manifest pass.

Only then mark **Checked live / Production verified**.

### Step 11 — Automatic rollback on failed verification

If the owner approved a release with automatic rollback enabled and post-promotion verification fails:

- immediately restore the last production-verified artifact;
- verify the rollback live;
- mark the failed candidate superseded/failed;
- preserve all evidence;
- notify the owner in plain language.

---

## 8. Web, Android, and iOS release paths

### Web

Primary default path:

`Provider project → source export → GitHub exact candidate → Flutter web build → protected preview → owner approval → host promotion → live verification`

Vercel may implement the hosting adapter, but the Pandora UI shows the owner the site/domain and release status rather than infrastructure internals.

### Android

`Source export → GitHub exact candidate → analyze/tests → signed Android build → device/emulator verification → owner release approval → Play testing/release workflow → store/live verification`

Signing credentials remain in an approved server-side secret system. Never store keystores or passwords in the repository.

### iOS

`Source export → GitHub exact candidate → analyze/tests → macOS signed archive → simulator/device checks → owner release approval → TestFlight/App Store workflow → store/live verification`

Any Apple-account spending, agreements, certificates, store declarations, or public release remain explicit gates.

---

## 9. Plain-language translation firewall

### Forbidden implementation terms in user-visible UI

Always block at minimum:

- FlutterFlow
- MCP
- MCP server
- YAML
- CI
- pipeline
- provider
- bearer token
- API key/token
- service role
- schema fingerprint
- Git commit SHA as primary copy
- AAL2
- TOTP

### Preferred owner language

- app setup
- connection
- saved version
- automatic checks
- extra identity check
- proof
- checked
- put live
- checked live
- undo to last safe version
- needs permission
- could not be confirmed
- last verified

### Error sanitizer

Every internal error passes through a translation layer before reaching the client. The owner never receives a raw exception body from the project provider, build runner, Git host, database, or deployment host.

Examples:

| Internal failure | Owner-facing message |
|---|---|
| invalid action variable binding | `One action needs a setting repaired before this can continue.` |
| project schema changed | `The app changed underneath this work. Pandora stopped so nothing unsafe was applied.` |
| provider update response ambiguous | `Pandora could not confirm that the change was saved, so it stopped before doing anything else.` |
| source export failed | `Pandora could not prepare the app source yet. The current version was not changed.` |
| dependency resolution failed | `One app component could not be prepared for publishing.` |
| static analysis failed | `The app still has code issues to repair before publishing.` |
| automated test failed | `A required check failed. Nothing was published.` |
| preview deployment failed | `Pandora could not prepare the preview. The live version was not changed.` |
| production verification failed | `The new version did not pass the live check. Pandora is restoring the last safe version.` |
| host permission expired | `Publishing needs permission again.` |

Raw technical evidence is retained internally for diagnosis and provenance.

---

## 10. Evidence and status rules

Pandora must always distinguish:

### Documented

Required proof:

- requirement/decision recorded;
- acceptance criteria recorded;
- dependencies and risks recorded;
- source of the requirement recorded.

### Implemented

Required proof:

- exact changed source/project state exists;
- project/provider read-back confirms the change;
- content/hash/commit evidence is recorded;
- no claim of testing or deployment is implied.

### Tested

Required proof:

- applicable validators pass;
- generated-source checks pass;
- automated tests required by scope pass;
- required mobile/browser visual checks pass;
- security/privacy checks required by scope pass;
- exact tested candidate is identified.

### Deployed

Required proof:

- exact tested candidate has a deployment/promoted artifact identifier;
- target environment is known;
- deployment event succeeded;
- this status does **not** imply the app works live.

### Production verified

Required proof:

- exact deployed candidate identity matches tested/approved manifest;
- required live checks pass from the live destination;
- auth/API/critical flow required by the release passes;
- rollback target is recorded;
- final verification timestamp and evidence are stored.

### Completion percentage

A percentage may be shown only when calculated from the current weighted roadmap/task/proof state. Missing/unknown proof is not treated as complete. No UI placeholder percentage is allowed.

---

## 11. Failure handling rules

### Read failures

- retry only when failure is clearly transient and bounded;
- do not translate missing evidence into a healthy/default state;
- show `Not verified yet` or `Last verified …`.

### Write failures

- validate first;
- write minimal partitions;
- on ambiguous response, do not retry automatically;
- re-read current state before any next action;
- preserve pre-change snapshot.

### Build/test failures

- never deploy a failed candidate;
- repair on the candidate branch;
- restart required checks after material source change;
- do not reuse stale pass evidence from an earlier source hash.

### Deployment failures

- live version remains unchanged unless promotion actually occurred;
- if promotion occurred but verification fails, follow rollback policy;
- preserve logs and deployment identity.

### Provider outage

- Pandora remains usable for previously captured non-sensitive state with freshness labels;
- project mutations are disabled;
- release preparation may continue only through steps whose inputs are already content-addressed and complete;
- never infer current provider state while provider read-back is unavailable.

---

## 12. Security and privacy requirements

- no provider credentials in the mobile/web client;
- no service-role credentials in generated source;
- no secret values in Git commits, release manifests, analytics, or user-facing errors;
- project-scoped and environment-scoped grants;
- protected release/destructive/security-sensitive actions require stronger identity proof where configured;
- database tenant/project authorization remains server-side;
- audit events identify actor, action, resource, outcome, candidate, and evidence reference without secret values;
- private Memory/customer content is not copied into release artifacts unless explicitly required and safe;
- source and artifact secret scanning is mandatory before release;
- web-origin allowlists are bound to exact preview/live domains;
- unknown authorization state fails closed.

---

## 13. Provider-invisibility test suite

Every release candidate must automatically fail if any hidden implementation name leaks into user-visible content.

Required scans:

1. project UI string resources;
2. generated Dart source string literals used by UI;
3. route/page titles;
4. snackbars/dialogs/error mappings;
5. connection/service labels;
6. notification templates;
7. activity/approval copy;
8. release summary copy;
9. accessibility labels;
10. public static HTML/metadata where visible to the end user.

The word `FlutterFlow` has a zero-tolerance user-visible rule. Internal source paths and engineering logs may contain it, but those fields must be redacted/translated before display.

---

## 14. Deployment-host abstraction

The host layer must allow Pandora to switch destinations without changing the owner workflow.

### Host adapter contract

Input:

- immutable build artifact;
- artifact SHA-256;
- target project/site identity;
- environment;
- required non-secret configuration references;
- candidate/release ID.

Output:

- deployment ID;
- preview/live URL;
- deployment state;
- logs reference;
- promoted artifact identity;
- domain state;
- rollback target capability.

### Owner UI

Default UI shows:

- site/domain;
- `Preview ready` / `Ready to publish` / `Live` / `Needs attention`;
- last checked time;
- `Publish`;
- `Undo`;
- `Show proof`.

Host vendor names are not needed for ordinary use. If the owner deliberately manages a specific hosting account in an advanced administrative surface, that service name may be shown; the hidden app builder remains permanently invisible.

---

## 15. Observability and evidence capture

Pandora records operational evidence without turning the UI into a developer dashboard.

Internal telemetry:

- provider read/write latency and errors;
- schema drift;
- source export duration/hash;
- analyzer/test/build duration/results;
- preview deploy/verify status;
- production promotion/verify status;
- rollback status;
- app crash/runtime errors;
- owner command outcome;
- approval outcome;
- evidence freshness.

Owner-facing summaries:

- `All required checks passed`
- `1 thing needs your approval`
- `The preview needs repair`
- `The live version was checked 5 minutes ago`
- `Pandora restored the last safe version`

No fake health or fake uptime. Unknown stays unknown.

---

## 16. Maximum-capacity extension roadmap

After the core release pipeline is production-verified, expand the same architecture rather than creating parallel workflows.

Potential supported capabilities:

- full-project semantic search;
- typed bulk refactors;
- automatic repair of stale references;
- design-system drift detection;
- accessibility repair suggestions and safe fixes;
- cross-platform responsive optimization;
- generated-code regression diagnosis;
- dependency upgrade preparation on isolated candidates;
- feature-flagged staged rollout;
- host migration without changing owner UX;
- custom-domain migration and verification;
- release channels (internal, preview, beta, live);
- Android/iOS store release orchestration;
- deterministic visual regression library;
- automatic rollback on health regression;
- incident evidence package generation;
- release provenance export for auditors;
- multi-app/project orchestration using the same capability model.

Every extension inherits the same rules: least privilege, snapshots, validation, exact source identity, evidence, separate production approval, and provider-invisible owner UX.

---

## 17. Implementation order

1. **Canon and release-policy correction** — record this plan and supersede prior blanket production authorization.
2. **Provider-invisibility firewall** — zero-tolerance user-visible hidden-provider string policy and translation layer.
3. **Design system and premium shell** — implement standardized tokens/components and the five-tab phone-first shell.
4. **Truthful live reads** — Home, projects, approvals, activity, safety, and Ask Pandora projections use canonical backend data only.
5. **Governed writes** — safe app edits/fixes run snapshot → validate → write → read-back → evidence.
6. **Generated-source export** — exact source export + manifest + hashes.
7. **GitHub candidate versioning** — immutable candidate branches/commits and parent lineage.
8. **Flutter checks/builds** — analyze, tests, terminology/secret scans, web/Android builds, visual QA.
9. **Protected preview hosting** — deploy and verify exact artifact.
10. **Release approval surface** — owner sees simple exact-candidate summary; protected approval required.
11. **Exact candidate promotion** — no rebuild after approval where avoidable.
12. **Production verification and rollback** — live proof and automatic restore of last safe version on failed verification when preauthorized.
13. **Android/iOS distribution** — same candidate/evidence model adapted to signed store release workflows.
14. **Operational hardening** — drift detection, recovery drills, independent review, adapter contract tests, backup/restore evidence.

The machine-readable roadmap is maintained separately in `docs/product/PANDORA_FULL_CAPACITY_ROADMAP.json`.

---

## 18. Definition of done for full-capacity v1

Full-capacity v1 is complete only when all of the following are production-verified:

- the existing app project can be inspected through the governed server-side adapter;
- provider identity is completely absent from all user-visible Pandora strings and surfaces;
- owner can use Build, Preview, Fix, Publish, Live, and Undo without infrastructure knowledge;
- project edits are snapshot/validate/write/read-back/evidence governed;
- current app pages are redesigned to the premium Pandora design system;
- live data replaces all fake/mock state that could be mistaken for truth;
- source can be exported automatically without owner desktop/manual download;
- every export is content-addressed and versioned in GitHub;
- generated Flutter source passes release checks;
- web release artifact can be deployed to a protected preview automatically;
- exact candidate preview is verified;
- production release remains blocked until explicit exact-candidate approval;
- exact approved candidate can be promoted without code drift;
- live deployment is verified independently;
- failed live verification can restore the last safe verified version;
- release manifest and rollback evidence are stored;
- Android-first visual/accessibility QA passes;
- app-level protected approval flow is verified;
- production status in Pandora reflects proof, never inference.

---

## 19. Official implementation references

The implementation should track current official documentation before each adapter/tooling upgrade:

- FlutterFlow Project APIs: `https://docs.flutterflow.io/resources/projects/settings/project-apis/`
- FlutterFlow CLI: `https://docs.flutterflow.io/flutterflow-cli/`
- FlutterFlow code export: `https://docs.flutterflow.io/flutterflow-cli/exporting/`
- Flutter generated code/local run: `https://docs.flutterflow.io/testing/local-run/`
- Flutter web release build: `https://docs.flutter.dev/deployment/web`
- Flutter web build: `https://docs.flutter.dev/platform-integration/web/building`
- Vercel CLI deployment: `https://vercel.com/docs/cli/deploy`
- Vercel staged/preview deployment: `https://vercel.com/docs/cli/deploying-from-cli`

Provider/API version changes must be treated as schema/contract drift and revalidated before enabling writes.

---

## 20. Immediate next safe action

Implement the premium UI/design-system plan and provider-invisibility lint on the existing app candidate while keeping production publication disabled. In parallel, finish truthful Owner API wiring so the redesigned UI has no mock state that could be mistaken for verified reality.
