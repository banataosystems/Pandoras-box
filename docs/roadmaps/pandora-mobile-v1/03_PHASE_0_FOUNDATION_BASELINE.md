# 03 — Phase 0 Delivery Envelope & Foundation Baseline

- **Product:** Pandora Mobile
- **Canonical repository:** `banataosystems/Pandoras-box`
- **Foundation branch:** `feature/pandora-mobile-premium-foundation`
- **Branch parent:** `main@3f1f3343ed94ae4df5f4cee3465c10a9f4fa3c2b`
- **Recorded:** 2026-08-14 Asia/Manila
- **State:** Documented delivery envelope; not release or production evidence

## 1. Outcome and authority

Phase 0 freezes the exact starting point, preserves prior evidence without
overstating it, identifies what may be salvaged from stale work, and defines
the proof required for the premium foundation.

The authority order for this slice is:

1. the owner's latest direction;
2. live provider read-back for operational state;
3. GitHub issue #35, the authoritative detailed execution tracker;
4. canonical `main` and the roadmap files landed at `3f1f3343`;
5. PR #8 and other historical branches as evidence or design archaeology only.

Issue #35 and the landed roadmap define the current product direction. PR #8
does not override them. Pandora Memory promotion remains review-gated, so this
file must not be treated as proof that structured Memory task state advanced.

## 2. Exact baseline freeze — PMOB-0001

There are three related but different baseline identities:

| Identity | Exact value | Meaning |
|---|---|---|
| Foundation branch parent | `3f1f3343ed94ae4df5f4cee3465c10a9f4fa3c2b` | Current canonical `main`; includes the Apple-level roadmap documentation. |
| Repository tree | `6411f61b01be835bb8e296bca0071816c1f501c8` | Complete tree at the branch parent. |
| Application-code merge | `1cfccdc37f77a314f2afb5f56a2f23f953e19f8b` | Latest application repair merged before the documentation-only roadmap commit. |
| Corrected mobile candidate | `256124d8ea1b2253f16491c20367a83e4b711a2b` | Exact repaired Android/Web build candidate, tagged `pandora-mobile-0.1.1-test.2`. |
| Corrected candidate tree | `2a51cd286e29360a645df532526a9ef9735b0535` | Tree bound to the corrected build evidence. |
| Mobile subtree at branch parent | `351c85fdf7e33cfb6ed8ec806fd73acc336a378f` | Canonical `apps/pandora-mobile` starting source. |
| Mobile package version | `0.1.1+2` | Version recorded in `apps/pandora-mobile/pubspec.yaml`. |

Baseline file SHA-256 values:

| Path | SHA-256 |
|---|---|
| `apps/pandora-mobile/pubspec.yaml` | `15d4aaf0be2af31e3b6aadf2aad6ece685a2e2d021c4f133737212f15b448a56` |
| `apps/pandora-mobile/lib/main.dart` | `ec55fe829dd614f1467ee2da7d57436719bec80467279b8ef4bc2a92ff20f0b5` |
| `apps/pandora-mobile/lib/pandora_api.dart` | `eed944f8721677590fff6499a451e64c14d40319e568eae14e189bb486a87a30` |
| `apps/pandora-mobile/lib/pandora_config.dart` | `f4b46144b613ed22788d390e604cc539a1730f90823eead002b704909ef79acd` |
| `apps/pandora-mobile/test/pandora_contract_test.dart` | `f8392392b0c6bc2d93cf16e2dc6335d124fb1afa936738a12ecf17e319c7b5c8` |
| `.github/workflows/pandora-mobile-integration.yml` | `e29e7be0446aad40e8f4aab1f4787801be03ec092353e814a527ccb4cc609bab` |

### Runtime configuration at the baseline

- Authentication project: the canonical `jcyqixttuebxqqfkjonq` Supabase
  project.
- Primary owner API used by the client:
  `https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/pandora-owner-api`.
- Configured future fallback:
  `https://mcpmaster.vercel.app/api/operator`.
- Pandora Memory origin: `https://pandorasbox-memory.vercel.app`.
- Organization context is supplied through the canonical organization
  configuration and the signed-in user's session.

The public publishable client credential is intentionally not duplicated in
this document. Service-role credentials, provider tokens, and private payloads
must never be embedded in the mobile source or evidence.

The baseline README still describes the Vercel route as owner-API authority,
while the repaired source uses the Supabase Edge Function as primary. Also,
`PandoraConfig.ownerApiBaseUrls` lists both routes, but the baseline
`PandoraApi` consumes only `ownerApiBaseUrl`. Therefore fallback is configured,
not runtime-proven. Phase 1 API tests must not claim failover until the client
actually implements and verifies it.

### Baseline architecture liabilities

The existing client is a functional secure prototype, not the premium
foundation:

- `main.dart` contains the app shell, authentication, primary screens, state,
  and presentation in one large file;
- widgets own API-triggering state and primary surfaces render arbitrary JSON;
- the app forces dark mode;
- ordinary flows request manual project, action, and approval identifiers;
- loading and errors are generic, while empty, stale, degraded, and freshness
  states are incomplete;
- current tests bind configuration but do not cover typed presentation,
  themes, component goldens, accessibility, or repository/cache behavior.

These are the Phase 1 starting conditions, not defects to hide from the proof
record.

## 3. PR #8 salvage map — PMOB-0002

PR #8, `Complete FlutterFlow Pandora Mobile v1`, is a historical design and
test source only.

| PR #8 identity | Exact value |
|---|---|
| State | Open draft; not merged; GitHub reports `mergeable=false` |
| Base | `ced72940812724b366766e6f99b31cebbd81acde` |
| Head | `f73c477d6eb2e287c59c895bc1c5017ab4b17980` |
| Tree | `01d4d6f0440ee460c0c9f7c99486b57c932d47ab` |
| Scale | 120 commits; 166 files; 27,674 additions; 295 deletions |
| Independent review | None recorded; no review submissions or review threads |
| Native mobile source | No `apps/pandora-mobile/**` files in its changed-file set |

Current main and the PR head diverge by 11 main-only commits and 120 PR-only
commits. PR #8 predates the canonical native Flutter client and is not a
candidate to merge, overlay, or check out as the current application.

### Reusable concepts and test cases

These items may be re-expressed against the current native Flutter source.
They must not be copied blindly:

| Historical source | Salvage into the foundation |
|---|---|
| `docs/product/PANDORA_PREMIUM_MOBILE_UX_SPEC.md` | State completeness, restrained spacing and typography, 48dp touch targets, one-handed layout, accessibility cases, and visual-QA viewport/state coverage. |
| `docs/flutterflow/PANDORA_MOBILE_APP_SPEC.md` | Owner-language presentation, truthful proof ladder, freshness, unverified-progress behavior, and safe read-only degraded behavior. |
| `docs/flutterflow/PLAIN_LANGUAGE_DICTIONARY.json` and `automation/pandora_p1_source_guard.py` | Rewrite useful terminology and leak cases as typed Dart mapping and widget tests. Developer Diagnostics is an intentional, sanitized exception to ordinary owner language. |
| `automation/pandora_p2_design_guard.py` | Retain the 4-point geometry idea, token-only styling discipline, and explicit 48dp target checks. Use the current canonical semantic palette instead of its historical colors. |
| `automation/pandora_p3_screen_guard.py` | Retain tests for removing manual IDs, human-readable headings, and touch targets. Rewrite them as Flutter widget, semantics, and golden tests. |
| `recovery/overlay/pandora-owner-api-client.ts` and its tests | Adapt tests for HTTPS, signed-in JWT and organization binding, no network without a session, encoded identifiers, sanitized error mapping, and bounded decision payloads to the current routes and models. |
| PR #8 evidence workflow pattern | Reuse exact-head binding, bounded secret scanning, content-addressed artifacts, sanitized manifests, and read-back principles in the native mobile workflow. |

### Rejected or quarantined changes

The following are outside the Phase 0/1 implementation source or contradict
newer canon:

| Historical material | Disposition and reason |
|---|---|
| `automation/flutterflow/dsl/**` and `automation/flutterflow/run.json` | Quarantine as builder-specific archaeology. The canonical app is native Flutter source under `apps/pandora-mobile`. |
| `.github/workflows/flutterflow-unattended.yml` | Do not import. It contains write-capable builder modes, OIDC broker behavior, and stale project assumptions. Only its evidence principles may be reimplemented. |
| Supabase functions, target files, migrations, inactive SQL repairs, and migration-recovery material | Do not cherry-pick or apply. Foundation work authorizes no database or provider mutation, and current main contains newer reconciliation and AAL1 work. |
| AAL2/TOTP UI, actions, tests, and approval requirements | Reject. They conflict with the current AAL1 owner/admin authorization direction. Server authorization still remains authoritative. |
| Historical five-tab navigation `Home · Actions · Approvals · Activity · Safety` | Reject. Issue #35 requires `Home · Projects · Command · Approvals · Activity`, with Safety secondary. |
| Historical red-primary or no-blue rules | Reject. Current canon uses blue/violet for ordinary primary action; red is semantic critical/destructive or identity-only. |
| A blanket ban on provider/runtime terms in every surface | Narrow it. Ordinary screens stay human-readable; sanitized technical identities belong in owner-only Developer Diagnostics. |
| `docs/product/PANDORA_FULL_CAPACITY_ROADMAP.json` weights, statuses, and percentages | Do not import. PMOB task identities and current evidence govern status. Percentages require current weighted roadmap/proof evidence. |
| Random per-call idempotency UUID behavior | Do not port. A new key on retry does not resolve an ambiguous mutation result; current server evidence must be reconciled before retry. |
| PR #8 owner-API/server sanitizer changes | Do not transplant. The current owner API has evolved and is outside this source-only foundation scope. |
| PR #8 security snapshots and release blockers | Preserve as dated historical evidence only. They are not live read-back for the current runtime. |

### Exact PR #8 evidence classification

- Owner API/source-guard workflow run `31588850195`, job `94088872724`:
  success at the exact PR head.
- ProjectOS security workflow run `31588850200`, job `94088872835`:
  success at the exact PR head.
- Owner-app operation run `31588847670`, job `94088864702`: failure.
- Failure artifact `9138251969`, archive digest
  `sha256:1cdd30032cc969730094599a3cb3764cabf6939819a3e43565cc021c7dfea66f`.
- Its sanitized manifest recorded `operation_outcome=failure` and an empty file
  list. The grant was unavailable, and the owner app was neither reached nor
  mutated.

The strongest honest state is: useful stale concepts were source-tested on the
PR head. They were not applied to the current native app, independently
reviewed, deployed, or production-verified.

## 4. Product-mark provenance expectations — PMOB-0003

PR #12, not PR #8, is the authoritative identity source to reconcile.

- Decision identity: `PB-BRAND-2026-08-10-01`.
- Provenance master path:
  `assets/brand/pandoras-box/product-mark/2165-original.jpg`.
- Approved master SHA-256:
  `d6f055b88b962b4dbae4ac67bc30f5e31b6c3a90997dfd5fddf9a0be23aa5970`.
- The source is the owner-approved monochrome spiral-apple artwork. It must not
  be redrawn, regenerated, recolored, inverted, distorted, or replaced by a
  generic apple or ownership mark.
- The provenance master remains immutable. Display, launcher, splash, sign-in,
  notification, favicon, and manifest assets must be deterministic derivatives
  with recorded transformation provenance and checksums.
- Product-mark integration requires rendered safe-area, smallest-size,
  light/dark, launcher, splash, and device verification.

Exact derivative selection, transforms, dimensions, output hashes, and visual
acceptance belong to the dedicated brand task. PR #8 derivative outputs may be
used for comparison, but their manifest's `verified` claims are not acceptance
evidence for this branch by themselves.

## 5. APK and device evidence classification — PMOB-0004

| Candidate/evidence | Exact evidence | Honest classification |
|---|---|---|
| Original native candidate | Commit `006fedad8d955ba3e6e1c0132af5ae7623ba0e6f`; CI run `31709218285`; Android artifact `9184656076`; archive digest `sha256:3c040efd19e9325a285e470c952501c73aa850646fef20593b5b81d930294ad2`. | Implemented and CI-built. |
| Original owner recording | PR #29 records private Android video `2879.mp4`: install and Supabase sign-in succeeded, then Command Center returned HTTP 404. | Documented authenticated failure evidence, not acceptance. The private video was not copied into this repository or independently reinspected for this envelope. |
| Corrected candidate | Commit `256124d8ea1b2253f16491c20367a83e4b711a2b`; tree `2a51cd286e29360a645df532526a9ef9735b0535`; version `0.1.1+2`. | Implemented repair. |
| Corrected CI | Mobile run `31718495356`, job `94509202869`: dependency resolution, analysis, tests, Web release build, debug APK build, and artifact upload succeeded. ProjectOS security run `31718495369` succeeded. | CI-tested on the exact candidate. |
| Corrected Android artifact | Artifact `9188485914`; size `74,842,256` bytes; archive digest `sha256:641d59aa44af046d49a8e62a8ad87ffef196fbf259378b8ef36dc1801901ced9`; retained through 2026-11-11. | Exact GitHub Actions archive evidence. This is not the inner APK file digest. |
| Corrected device acceptance | PR #29 explicitly requires an authenticated on-device Home/API journey after the repair. No corrected visual journey is durably bound in issue #35, PR #29, or canonical source. | Outstanding. Not device-accepted, deployed, or production-verified. |

Future Android evidence must record the actual APK SHA-256 in addition to the
GitHub artifact archive digest, application version, candidate SHA, signing
identity/class, device model/OS, installation result, authenticated route
journey, visual recording identity, network/runtime identity, and rollback
route.

## 6. Phase 0 and Phase 1 dependency graph

Phase 0 work begins from the frozen baseline. PR #8 salvage, PR #12 identity
reconciliation, and APK evidence classification may then proceed independently.
The acceptance matrix depends on all three. Phase 1 implementation begins only
after those proof boundaries are explicit.

| Task | Outcome | Dependencies | Blocks |
|---|---|---|---|
| PMOB-0001 | Freeze branch, application, runtime configuration, CI, and artifact baseline. | None | PMOB-0002, PMOB-0003, PMOB-0004 |
| PMOB-0002 | Salvage PR #8 concepts/tests without stale-source merge. | PMOB-0001 | PMOB-0005; informs PMOB-0101/0102/0104/0105 |
| PMOB-0003 | Reconcile the approved PR #12 product-mark master and provenance. | PMOB-0001 | PMOB-0005, PMOB-0102, PMOB-0103, later brand integration |
| PMOB-0004 | Separate original failure, corrected CI artifact, and missing device acceptance. | PMOB-0001 | PMOB-0005 and all future Android acceptance claims |
| PMOB-0005 | Define observable acceptance and evidence for every foundation slice. | PMOB-0002, PMOB-0003, PMOB-0004 | All Phase 1 completion claims |
| PMOB-0101 | Modular app shell and route composition. | PMOB-0005 | PMOB-0107 and feature-screen work |
| PMOB-0102 | Semantic design tokens. | PMOB-0002, PMOB-0003, PMOB-0005 | PMOB-0103, PMOB-0104 |
| PMOB-0103 | Porcelain/Graphite system themes. | PMOB-0102 | PMOB-0104 and theme goldens |
| PMOB-0105 | Typed core presentation models. | PMOB-0002, PMOB-0005 | PMOB-0106, PMOB-0104, PMOB-0107 |
| PMOB-0106 | Repository/state and freshness/cache model. | PMOB-0105 | PMOB-0104, PMOB-0107 |
| PMOB-0104 | Shared proof, freshness, loading, empty, error, confirmation, and detail components. | PMOB-0102, PMOB-0103, PMOB-0105, PMOB-0106 | Phase 1 exit and feature screens |
| PMOB-0107 | Move raw machinery behind Developer Diagnostics. | PMOB-0101, PMOB-0105, PMOB-0106 | Phase 1 exit |

After PMOB-0005, PMOB-0101, PMOB-0102, and PMOB-0105 may proceed in parallel.
PMOB-0103 follows tokens, while PMOB-0106 follows typed models. Shared
components and Diagnostics then bind those foundations together.

## 7. Acceptance and evidence matrix — PMOB-0005

Every slice must record the exact baseline, intended paths, observable
acceptance, checks, exact candidate, artifact identity, review, rollback, and
proof state. A head change invalidates checks, review, visual evidence, and
artifacts from the previous head unless equivalence is independently proven.

### Phase 0 matrix

| Task | Observable acceptance | Required evidence | Current state in this envelope |
|---|---|---|---|
| PMOB-0001 | Branch/application/artifact identities and configuration behavior are unambiguous. | Exact commit/tree/subtree/version, file hashes, endpoint behavior, CI and artifact IDs. | Documented and provider/local-read verified. |
| PMOB-0002 | Every relevant PR #8 concept has a reuse, rewrite, reject, or quarantine disposition; no wholesale merge is permitted. | Live PR metadata, changed-file list, exact workflow runs, reviews, and failure manifest identity. | Documented and provider-read verified. |
| PMOB-0003 | Approved master provenance is preserved and derivative work has an explicit proof gate. | Decision ID, exact source SHA-256, immutable master, derivative manifest, rendered/device checks. | Source provenance documented; branch integration and derivative acceptance remain separate. |
| PMOB-0004 | Original failure cannot be mistaken for acceptance; corrected CI cannot be mistaken for device verification. | Candidate/run/artifact identities, recording classification, actual future APK digest and authenticated device journey. | Classification documented; corrected device acceptance remains outstanding. |
| PMOB-0005 | Each Phase 1 task has observable acceptance and exact evidence requirements. | This matrix plus exact-head results populated by each implementation slice. | Documented; implementation evidence must be added on the candidate head. |

### Phase 1 matrix

| Task | Observable acceptance | Minimum exact-candidate proof |
|---|---|---|
| PMOB-0101 | `lib/app`, `lib/core`, and `lib/features` responsibilities are separated; shell/router composition is testable; primary widgets do not own direct network calls. | Static analysis, architecture/source-boundary test, navigation widget tests, auth and API regression tests. |
| PMOB-0102 | Spacing scale `4/8/12/16/20/24/32/40/48`, typography, semantic colors, shape, elevation, motion, and touch targets have named tokens; page code does not invent competing visual constants. | Token unit tests, source/style guard, contrast review inputs, documented extension rule. |
| PMOB-0103 | `ThemeMode.system` selects Porcelain or Graphite correctly; ordinary actions, verified success, attention, destructive/critical, and identity colors retain distinct semantics. | Light/dark widget and golden tests, system-theme test, contrast check, large-text goldens. |
| PMOB-0105 | Required presentation models parse known, missing, malformed, and unknown fields safely; proof stage and freshness never invent completion. | Unit tests for all models, enum/status humanization, nulls, stale thresholds, unknown fields, error mapping, and percentage eligibility. |
| PMOB-0106 | Repositories own networking/state; safe read-only summaries can be cached with freshness; approvals, execution, and current authorization always require live verification. | Repository tests with fake transport/clock/cache, session expiry, network loss, safe cache allowlist, no queued high-impact writes, endpoint/failover behavior. |
| PMOB-0104 | Shared card, status, proof, freshness, skeleton, empty, error, confirmation, and detail components render consistent states without raw JSON or color-only meaning. | Widget/semantics tests and phone light/dark, narrow-width, stale/error/empty, and largest-text-scale goldens; touch-target audit. |
| PMOB-0107 | Raw API responses, endpoints, organization/source/build identities, correlation IDs, cache state, and provider references render only in owner-gated, secret-sanitized Diagnostics. Primary screens show typed owner summaries. | Diagnostics redaction unit tests, primary-surface leak tests, malformed-error test, owner/session gate test, semantics/golden coverage. |

### Evidence record required for every implementation slice

- task ID, scope, non-goals, risk, dependencies, intended paths, and rollback;
- branch parent, candidate commit, candidate tree, and changed-path manifest;
- unit, API-contract, widget, golden, accessibility, security, and privacy checks
  applicable to the slice;
- exact CI run and job bound to the candidate;
- artifact ID, archive digest, actual packaged-file digest, version, and signing
  identity/class when packaging is involved;
- viewport, theme, text scale, locale, device/OS, and build identity for visual
  evidence;
- authenticated journey identity when auth or live data is involved;
- different-vendor reviewer, exact reviewed head, verdict, limitations, and
  unresolved findings;
- rollback target and a statement of whether rollback was designed, tested, or
  exercised;
- strongest proven state: documented, implemented, tested, deployed, or
  production-verified.

## 8. Safety invariants

The foundation must preserve:

- backend owner/admin authorization and organization binding;
- plan integrity and approval/execution separation;
- provider allowlists and high-impact operation gates;
- secret exclusion from client source, UI, logs, analytics, screenshots,
  diagnostics, and Memory;
- expiry and duplicate-decision handling;
- server authority regardless of later biometric convenience;
- no automatic retry after an ambiguous mutation result;
- exact-source, exact-artifact, and rollback evidence binding.

Read-only cache may contain only explicitly safe summaries and evidence
metadata, always with freshness. It may not authorize approvals, execution, or
current security state.

## 9. Rollback and no-production boundary

This delivery envelope authorizes source and test work on
`feature/pandora-mobile-premium-foundation` only.

It does not authorize:

- merging PR #8 or applying its builder/SQL/server changes;
- Supabase schema, Auth, Edge Function, or data mutation;
- FlutterFlow or other external app-builder mutation;
- Vercel preview promotion or production deployment;
- store publication, signing-key changes, or production release;
- deletion or replacement of the current working Android artifact.

Source rollback for the foundation is the exact branch parent
`3f1f3343ed94ae4df5f4cee3465c10a9f4fa3c2b`. The corrected historical test
artifact at `256124d8` and its GitHub evidence remain preserved as comparison
and recovery evidence. Rollback must remove only new foundation references and
must not rewrite or erase roadmap, brand provenance, APK failure, or prior
artifact history.

Any future merge must satisfy the active exact-head policy. Any production or
store release requires a separate explicit owner authorization for one exact
tested candidate after visual, accessibility, authenticated-device, security,
runtime-identity, rollback, and independent-review gates pass.

## 10. Current proof state

| Surface | Strongest proven state |
|---|---|
| Apple-level roadmap and Phase 0 delivery envelope | Documented in canonical source. |
| Existing native Flutter operator prototype | Implemented on canonical main. |
| Corrected `0.1.1+2` candidate | CI-tested for analysis, unit tests, Web release build, Android debug build, and ProjectOS security. |
| Corrected authenticated Android journey | Not verified; remains an open acceptance gate. |
| PR #8 premium concepts | Source-tested only on stale PR head; not applied to the native app. |
| PR #12 product-mark master | Approved provenance known; current-branch integration and derivative acceptance are separate gates. |
| PMOB-0101 through PMOB-0107 | No state is advanced by this document. Each task requires exact-candidate implementation and proof. |
| Preview, deployment, production, or store release | Not performed and not authorized by this envelope. |

Phase 0 exits only when source authority, PR #8 disposition, product-mark
provenance, APK evidence boundaries, and this acceptance matrix are all bound
to the foundation work. Phase 1 exits only when the shared light/dark component
goldens pass, core screens no longer depend on raw JSON, auth/API behavior is
regression-tested, and every exact-candidate gate above is recorded.
