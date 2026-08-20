# Independent portfolio review — all open issues and pull requests

- **Scope:** `banataosystems/Pandoras-box` (17 open issues, 14 open PRs) and `banataosystems/pandoras-box-memory` (source + live Memory runtime).
- **Observed:** `2026-08-20T00:45Z` → `2026-08-20T01:05Z`
- **Reviewer:** Claude (Anthropic), different-vendor. Not the implementation identity.
- **Method:** every claim below was recomputed from a primary source — GitHub API, Actions job logs, git objects, or a live Memory tool call. Issue and PR narratives were treated as assertions, not evidence.
- **Mutations performed:** none. No merge, deployment, grant change, migration, provider mutation, or Memory write.

---

## 1. Executive summary

Four findings are new — none of them is tracked by any open issue.

| # | Finding | Severity | Evidence |
|---|---|---|---|
| **F1** | The entire ProjectOS `github_*` tool family returns HTTP 502 in production. Root cause narrowed by owner reconciliation to legacy environment-configuration precedence. | **CRITICAL** | Reproduced 4× across 2 repos + `github_get-me`; narrowed by Supabase + Vercel evidence |
| **F2** | `memory.canonicalContext` reports `degraded:false` on approved data that is ~6 days old. The fail-closed freshness contract is caller-opt-in, not enforced. | **HIGH** | Live probe with and without `maxAgeMs` |
| **F3** | The privacy scrubber rejects ISO-8601 timestamps and pseudonymous actor ids as if they were phone numbers, silently destroying event-time and dedupe determinism. Pre-existing on `main`; PR #76's test merely exposed it. | **HIGH** | Failure reproduced and root-caused to one regex |
| **F4** | PR #75 — the pending GitHub fix — is based on the mobile integration branch, so the fix for a live production outage cannot land without shipping all of Pandora Mobile first. | **HIGH** | PR base refs |

Findings F1, F2 and F3 are now **repaired on this branch** with non-vacuity proofs against `main`; F4's candidate is extracted onto clean `main`. All four remain source-level — none is deployed or production-verified.

Beyond those: **merge-ready: none; release-ready: none.** That part of the Control Tower's disposition is correct. But three of its recorded anchors are now stale, and two of its recorded CI states have since flipped (§5).

---

## 2. F1 — ProjectOS GitHub tool family is down in production

**CRITICAL.** Every `mcp__Pandoras-Box__github_*` call returns Cloudflare 502 `origin_bad_gateway`.

Reproduced at `2026-08-20T00:53Z`–`00:55Z`:

| Call | Result |
|---|---|
| `github_list-pull-requests` (`pandoras-box-memory`) | 502 |
| `github_list-issues` (`pandoras-box-memory`) | 502 |
| `github_get-repository` (`Pandoras-box`) | 502 |
| `github_get-me` | 502 |

It is **not** repo-specific and **not** a whole-server outage: `memory_health`, `memory_search`, and `memory_canonicalContext` on the same MCP server all succeeded in the same window. The fault is isolated to the GitHub adapter's configuration path.

### Duration

This is not a transient blip. The same 502 is independently recorded three times before this review:

- Issue #69 (`2026-08-19T13:06Z`) — "direct current collaborator enumeration through the governed path is blocked by upstream 502".
- Issue #70 (`2026-08-19T13:17Z`) — a real governed evidence submission "execution returned upstream HTTP 502".
- The Claude review on PR #65 (`2026-08-19T20:38Z`) — "the Pandora provider gateway returned HTTP 502 on repeated attempts".

**≥ 12 hours of continuous production outage on the governed GitHub control path.**

### Root cause — narrowed by owner reconciliation

My original hypothesis was that PR #52's `MCPMASTER_GITHUB_ACCOUNT_ID: "github-primary"` failed to match the Vault catalog's account id. **That is ruled out.** Owner reconciliation against Supabase found exactly one active governed GitHub installation whose id *is* `github-primary`, with `allow_mutations=true`. Vercel independently confirms repeated production `/mcp` 502s.

The actual fault is **configuration precedence**. In `src/runtime/service-config.js`, `buildGitHubConfiguration` consults `GITHUB_TOKEN` *before* the OIDC/Vault resolver:

```js
if (process.env.GITHUB_TOKEN?.trim()) {
    return buildGitHubEnvironmentConfiguration();   // legacy path wins
}
```

The legacy path derives mutation authority from the environment — `allowMutations: process.env.GITHUB_ALLOW_MUTATIONS === 'true'` — never from the governed catalog. That produces the exact split-brain observed: **Supabase's catalog grants mutations while the executing runtime refuses them**, failing a real governed plan with `GitHub mutations are disabled for account github-primary`.

This is precisely what PR #75 reverses, which raises its priority from "pending fix" to **the unblock for the whole repair chain**.

### Status — repaired on this branch

A clean-main extraction of PR #75's two GitHub-configuration files now sits on this branch, carrying no mobile lineage. It adds a third regression test beyond the original candidate, binding the fix to the observed failure: with the catalog granting mutations and `GITHUB_ALLOW_MUTATIONS=false`, mutation authority must follow the catalog. Non-vacuity verified — the precedence and mutation-authority tests fail on `main` and pass here, while the legacy fallback test passes on both.

---

**Recommended:** apply a server-side default `maxAgeMs`, and make `freshestRecordAt` a namespace-wide value independent of query and `maxItems`.

## 3. F2 — Memory's freshness contract does not fail closed

**HIGH — confirmed in both runtime and source by owner reconciliation.**

`memory.canonicalContext` advertises that it "fails closed to GitHub and Supabase when approved memory is unavailable or **stale**."

Two live calls, same namespace, minutes apart:

| Call | `degraded` | `freshestRecordAt` |
|---|---|---|
| No `maxAgeMs` (the default) | **`false`** | `2026-08-14T02:42:46Z` — ~6 days old |
| `maxAgeMs: 3600000` | `true`, "The most recent approved record is older than the configured freshness window." | `2026-08-12T23:06:21Z` |

The source confirms the mechanism. In `src/tools/memory-governance.js`, the staleness check was gated on the caller:

```js
if (options.maxAgeMs !== undefined && freshest !== null) { … }
```

So the detector works — but **only when the caller opts in**. With the default call there was no freshness window at all, and arbitrarily stale approved memory came back with `degraded:false`, `degradedReasons:[]`, `warnings:[]`.

This was materially worse than the tracked situation. Issue #55's newest control comment (`2026-08-19T23:04Z`) states "canonicalContext is stale/degraded". **It did not report degraded.** A reader checking the tool directly would conclude Memory was healthy.

### Two adjacent gaps in the same contract

- **Unprovable freshness passed as fresh.** Approved records carrying no parseable timestamp left `freshest` null, which skipped the check entirely rather than degrading.
- **`freshestRecordAt` is query-scoped.** It is the newest record *that query returned*, not the newest in the namespace — which is why the two calls above legitimately report different values. It therefore cannot be read as "how fresh is Memory".

### Status — repaired on this branch

A default 24-hour window now applies whenever the caller supplies none; an explicit `maxAgeMs` still overrides it in both directions. Unprovable freshness now degrades. Where Memory reports more approved records than were returned, the result carries `freshestRecordScope: 'returned_records_partial'` and a warning that the anchor is a lower bound, and `appliedMaxAgeMs` exposes which window was used.

A *true* namespace-wide anchor needs a field the Memory service does not return today, so this makes the existing value honest rather than inventing one. **That half remains open on the Memory side.**

Non-vacuity verified: four of the six new tests fail on `main` and all six pass here; the two passing on both confirm fresh memory is still served and an explicit window is still honoured.

### Corroboration: Memory writes are still frozen

The newest approved record in `real_life` is `2026-08-13T21:08Z` (25/25 canonical records fall in `2026-08-12` → `2026-08-13`). Nothing has been approved in ~6 days, which independently confirms the issue #55 blocker: governed candidate writes remain unavailable. Transport is healthy (`memory_health` → `projectos-connected`, `vercel_oidc`); the write path is not.

---

## 4. Per-PR review

CI recomputed from the GitHub checks API at `2026-08-20T00:53Z`. All PRs are drafts **except #65**.

### Merge order is a 3-deep stack, not 14 parallel lanes

```
main
├── #57 #58 #61 #65 #67 #68 #76        (based on main)
│    └── #74                            (based on #65)
└── #53  integration/pandora-mobile-p1
     ├── #71  #72  #73  #75
     │         └── #77                  (based on #73)
```

Nothing based on `#53` can land before `#53` does.

### Red CI — four PRs, four different root causes

**#76 — `feat(posthog)` — RED, real product defect.** `node24` fails at `test/pandora-product-intelligence-lifecycle.test.js:109`: two normalizations of an *identical* envelope produce different `dedupeKey`s.

I reproduced this and root-caused it to one line — `src/projectos/product-intelligence.js:58`:

```js
const DIRECT_IDENTIFIER_PATTERN =
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{7,}\d)/i;
```

The second alternative is a phone-number heuristic: *digit, then 8+ of `[digit space ( ) . -]`, then digit.* It matches far more than phone numbers. `normalizeString` returns `null` on any match:

| Input | Result |
|---|---|
| `"2026-08-20T00:00:00.000Z"` | **`null`** — `2026-08-20` matches |
| `"actor_00000000000000000000000000000000"` | **`null`** — the zero run matches |
| `"hello"` | `"hello"` |

Consequences, all silent:

1. `occurredAt` falls back to `new Date()` at `product-intelligence.js:153`. **Every event is stamped with ingest time, not event time**, so `dedupeMaterial` embeds a millisecond clock and `dedupeKey` can never be stable. Dedupe/idempotency is entirely non-functional — retries create duplicates.
2. `anonymousActorHash` becomes `null`, so all per-actor analytics is lost.
3. `privacy_tier` silently degrades to the `aggregate_only` default.

**Ownership correction.** This defect is **pre-existing on `main`** — `git diff origin/main origin/feature/pandora-posthog-phase1-20260820 -- src/projectos/product-intelligence.js` shows the candidate only widened `ALLOWED_PROPERTY_KEYS`; it left `DIRECT_IDENTIFIER_PATTERN` untouched. The candidate did not introduce the bug, its new lifecycle test merely exposed it.

**Status — repaired on this branch.** Two repairs, because either alone leaves the contract broken: the phone alternative is now bounded to a standalone token of at most E.164's 15 digits (so a digit run inside a larger identifier is not a "phone number"), ISO-8601 is exempted explicitly rather than by loosening the heuristic, and the ingest-time fallback is kept out of the dedupe material so the key is stable across deliveries regardless of clock.

Determinism is asserted **across a deliberate millisecond boundary** — worth noting, because back-to-back calls land in the same millisecond and a naive determinism test passes by luck. That is also why this reads as an intermittent CI failure rather than a hard one: it fails only when two deliveries straddle a tick.

Applying these repairs to the candidate's own copy of the file turns its suite from 3 failing to **4/4 passing**, so the telemetry candidate should rebase onto this rather than carry a fix of its own.

**#72 and #71 — RED, but the candidates are innocent.** `exact-head-gate` runs the whole gate successfully, then dies on its *last* step, publishing the summary comment:

```
gh: Resource not accessible by integration (HTTP 403)
```

The workflow's token cannot write PR comments. This is proven by direct comparison — `.github/workflows/pandora-mobile-exact-head-gate.yml`:

| Branch | `permissions:` | Gate |
|---|---|---|
| #71 `feat/pandora-value-widget-v1` | `actions: read`, `contents: read`, `issues: write` | **FAIL** |
| #72 `feat/pandora-users-access-v1` | `actions: read`, `contents: read`, `issues: write` | **FAIL** |
| #73 `fix/pandora-mobile-owner-test-internet` | same **+ `pull-requests: write`** | **PASS** |

The fix already exists on #73's branch. Commenting on a PR requires `pull-requests: write`; `issues: write` does not cover it. **Cherry-pick the one-line permission addition onto #71 and #72** (or land #73 first and rebase). No candidate source change is warranted, and the red badges on #71/#72 should not be read as defects in the widget or access work.

**#57 — `governance: protected main` — STILL RED, bootstrap deadlock.** Re-verified at current head `2a9396a3`. Owner reconciliation reported #57 as no longer red, and it is true that its *ProjectOS security regression* and *Governance candidate exact-head proof* workflows are green. But a third check on that same head — `Evaluate exact-head evidence from trusted main` — is still `failure`:

```
Error: Cannot find module '.../scripts/evaluate-protected-main.mjs'
```

By design the job checks out **trusted main** and then runs a script that exists **only on the candidate branch**. Confirmed directly: `scripts/evaluate-protected-main.mjs` is present at `origin/governance/protected-main-enforcement` and absent at `origin/main`. The gate can never go green before the PR it gates is merged. This is unresolvable by iterating on the branch, and it compounds the six blocking findings (F1–F6) already recorded against #57. **Split #57 into (a) a minimal PR that lands the evaluator script on `main`, then (b) the enforcement PR that the now-present script can gate.**

### Green CI

| PR | Title | Base | Notes |
|---|---|---|---|
| **#65** | `fix(projectos)` provider mutation truth | `main` | Head `3890340a`; `215/215`; **Claude different-vendor PASS with non-blocking findings** is current at this exact head. The only non-draft PR, and the furthest along. Still blocked only on the reviewer-identity gate (§6). |
| #74 | narrow evidence-candidate scope | `#65` | Cannot land before #65. |
| #73 | mobile Owner Test network | `#53` | Carries the gate permission fix #71/#72 need. |
| #75 | GitHub Vault OIDC precedence | `#53` | **See F4 below.** |
| #53 | Pandora Mobile 0.3.0-rc.1 | `main` | Now fully green, including `exact-head-gate` — see §5. |
| #58 | Vercel provenance/promotion | `main` | `verify-release-evidence` green. Jules review pending (issue #64). |
| #61 | Worker-8 commercial baseline | `main` | Docs-only. |
| #67 / #68 | skills systems | `main` | See §4.1. |
| #77 | mobile owner-outcome P0 | `#73` | In progress at time of review. |

### F4 — the GitHub fix is trapped behind the mobile release

**HIGH.** PR #75 (`fix(github): prefer governed Vault connector on Vercel`) modifies `src/runtime/service-config.js` — runtime GitHub configuration, the exact area implicated in F1. Its base branch is `integration/pandora-mobile-p1-current-main-20260819` (PR #53).

So the pending remedy for a **live production outage** is sequenced behind the entire Pandora Mobile 0.3.0-rc.1 integration, which carries its own physical-Android and independent-review gates. **Rebase #75 directly onto `main`.** It shares no files with the mobile lane and there is no technical reason for the dependency.

This is the same lane-ownership violation the Control Tower already flagged for #53 (mobile PR carrying non-mobile workflow and security paths), now appearing in the opposite direction.

**Additional review finding on #75's content.** The diff inverts precedence so the OIDC/Vault catalog is consulted *before* `GITHUB_TOKEN`:

```js
const oidcToken = context.vercelOidcToken || process.env.VERCEL_OIDC_TOKEN;
if (oidcToken) {
    return new GitHubControlResolver().resolve(oidcToken, process.env.MCPMASTER_GITHUB_ACCOUNT_ID);
}
if (process.env.GITHUB_TOKEN?.trim()) { return buildGitHubEnvironmentConfiguration(); }
```

Governance-wise this is the right direction — a stale env token should not silently outrank the governed Vault connector. But note the interaction with F1: this change **removes the `GITHUB_TOKEN` escape hatch** whenever an OIDC token is present. If F1's cause is the `github-primary` id mismatch, #75 converts a recoverable misconfiguration into an unconditional one. Its own test asserts the catalog returns `id: 'github-primary'` — that assumption is exactly what is unverified in production. **Confirm the live catalog id before landing #75.**

### 4.1 — #67 and #68 are overlapping duplicates

- **#67** `feat(skills): Pandora Claude skill system — 33 skills, router, governance contract, evals` (branch `claude/pandora-skill-system-mle99x`)
- **#68** `feat(skills): add governed Pandora capability system v1` (branch `skills/pandora-capability-system-v1-20260819`)

Both target `main`, opened 21 minutes apart, both introduce a governed skill/capability system. Neither references the other. Both are green — but only on `node24`; neither triggers `exact-head-gate` or `verify`, so their governance claims carry markedly weaker CI evidence than #53 or #65. **Pick one lane before either is reviewed**, or the second will land as a conflicting parallel definition of the same subsystem.

---

## 5. Control Tower drift — issue #60 is stale in six places

Issue #60 is the designated coordination fallback. Five of its recorded facts no longer match the providers:

| # | Issue #60 records | Verified now |
|---|---|---|
| 1 | Memory main `27a3db9c` | **`63d133f6`** — two merges since (`3aa26cd` #42, `63d133f` #43) |
| 2 | Memory production `dpl_G8trVgo…` @ `27a3db9c` | **`dpl_6gn8vjxc…` @ `63d133f6`** (per #55's own newer comment) |
| 3 | W1 lane = PR #56 @ `fc46fb40` | Superseded twice: **PR #65 @ `3890340a`** |
| 4 | W5 mobile CI **FAIL** (scanner invoked without a source path) | **Fully green**, `exact-head-gate` included, run `32249952700` |
| 5 | Mobile review targets stale head `2a07efe…` | Still true, but the *reason* changed — CI is no longer the blocker |
| 6 | `canonicalContext` degraded | **Reports `degraded:false`** — see F2 |

Items 4 and 6 matter most: both are recorded as **blockers that have since cleared or inverted**, and acting on #60 as written would send work to the wrong lane. **#60 needs a re-anchor pass, and its "verified shared state" header should carry a machine-readable observation timestamp per row rather than one for the whole issue.**

The same drift affects issue #70, which requests review of PR #65 at head `85327f36`. That head has been superseded by `3890340a`, and a Claude different-vendor review already exists at the *current* head. **Issue #70 is satisfiable only by re-pointing it at `3890340a`** — as written it asks for a review of a head that is no longer the candidate.

---

## 6. Issue review — the one gate that blocks everything

### The structural blocker (issues #69, #70, and every review on every PR)

Every review on every PR in this repository is authored by `banataosystems` — the PR author. GitHub records them as `COMMENTED`, never `APPROVED`. **Formal independent approvals: 0.** Issue #69 diagnoses this precisely and correctly: these are personal-account repos with no organization, so the minimum viable independent reviewer is a repository-scoped collaborator with `write`.

This is the single highest-leverage open item. Roughly ten lanes are each individually blocked on "independent review", and none of them can clear while the topology makes a qualifying approval impossible to record. **#69 should be sequenced ahead of every source lane** — including #65, which is otherwise the most nearly complete work in the portfolio.

One caveat on #69's own proof plan: step 2 requires "direct GitHub readback shows collaborator permission `write`/`push`". **That readback runs through the governed GitHub path, which is down (F1).** #69 is currently blocked on F1, which is not noted in the issue.

### Issue disposition

| Issue | Assessment |
|---|---|
| **#69** Reviewer topology | **Do this first.** Blocks ~10 lanes. Itself blocked on F1. |
| **#55** Memory evidence 400 / Supabase arrays | Accurate and current. Corroborated: no approved Memory record in ~6 days. Repair chain in its newest comment is correct. |
| **#60** Master Control Tower | Useful, but stale in 5 places (§5). Re-anchor. |
| **#70** Different-vendor review of #65 | **Stale target.** Re-point from `85327f36` to `3890340a`, where a Claude PASS already exists. |
| **#66** Control Tower consolidation | Overlaps #60 and #69. Consider folding into #69 to avoid a third coordination surface. |
| **#63** W7 Technical Alpha | Correctly gated. Its stated prerequisites (Memory writes, Supabase reads, protected main, qualified release) are each still open, so Alpha cannot be called. |
| **#64**, **#54**, **#23** Jules reviews | Three parallel external-review requests against three different PRs (#58, #53, #22). #23 has been open since 2026-08-12 with one comment — likely dead; close or re-scope it. |
| **#44** AAL1 approval release gate | Blocked behind #69 (approval identity) and F1. |
| **#43**, **#42**, **#41** Portfolio gates (Battle, Porknyeta, CallGate) | Cross-repo work in repositories not in this session's scope. Not reviewable here — flagging only that they are unblocked by the Pandora critical path and could proceed in parallel. |
| **#35** Mobile roadmap v1.0 | Planning artifact; superseded in practice by the #53 → #71/#72/#73/#77 stack. Reconcile or close. |
| **#30** MCPMaster-derived skills evidence | Directly related to the #67/#68 duplication (§4.1). Resolve the lane choice here. |
| **#26** FlutterFlow deployable clone | Independent of the critical path. Can proceed. |
| **#16** DEP0169 on `/mcp` | Cosmetic warning, open since 2026-08-10. Lowest priority — but note it sits on the same serverless path as F1. |

---

## 7. Recommended sequence

Three of these are implemented on this branch and are marked accordingly. Each carries a non-vacuity proof against `main` rather than a green badge.

1. **Land the clean-main GitHub precedence fix.** ✅ *implemented here.* A governed portfolio whose GitHub control plane is down cannot verify anything about itself — including #69's own proof steps. This is the unblock for everything else: until the OIDC/Vault-first path is restored, Pandora cannot create its own repair candidates, which is exactly why the governed extraction plan was rejected with `GitHub mutations are disabled for account github-primary`.
2. **Make Memory freshness fail closed by default.** ✅ *implemented here,* with the namespace-anchor half explicitly left open on the Memory side.
3. **Repair the identifier heuristic and the determinism contract.** ✅ *implemented here.* Verified to turn the telemetry candidate's own suite from 3 failing to 4/4.
4. **Establish the independent reviewer (#69).** Still the gate on roughly ten lanes, and still blocked on step 1.
5. **Unblock the cheap reds:** cherry-pick `pull-requests: write` to #71/#72; split #57 into script-then-enforcement so its evaluator reaches `main` before the gate that runs it.
6. **Align the four-part Memory activation contract** (§8) — bridge capability, client scope, canonical project identity — leaving `can_propose` closed until the rest is independently reviewed.
7. **Re-anchor #60 and #70**, then run the #65 → #74 → Memory #48 chain.
8. **Decide #67 vs #68** before either is reviewed.

Steps 1–3 are source-level only. **None of them is deployed or production-verified**, and none authorizes the activation gates in step 6.

## 8. Memory restoration is larger than PR #48

Owner reconciliation against live providers established a finding this review did not reach, and it materially resizes the Memory lane.

Memory PR #48 is a sound least-privilege component — its head `4d0075a2` is green across Capability Registry, Memory evidence intake and source-security CI, and it correctly narrows submission authority to `memory:evidence-candidate:submit`. **But #48 alone cannot restore durable Memory writes.** Four separate gaps remain:

| # | Gap | Effect |
|---|---|---|
| 1 | Live `pandora-projectos-bridge@13` does not implement `submit_evidence_candidate` | The production bridge cannot accept the call at all |
| 2 | Pandora's client still requires broad `memory:write` | Contradicts #48's narrowed scope |
| 3 | ProjectOS submits project key `pandoras-box`; Memory's active canonical row is `mcpmaster-pandoras-box` | Identity mismatch on every submission |
| 4 | The production ProjectOS principal's project grant has `can_propose=false` | The proposed bridge correctly fails closed against it |

Gap 4 was **intentionally preserved by earlier Memory governance** and was deliberately not enabled during reconciliation. That is the right call: it is a security gate, not a bug, and it should be the last thing opened — after the other three are aligned and independently reviewed.

The practical consequence is that the six-day Memory write freeze corroborated in §3 is not one blocked PR but a four-part activation contract, none of whose parts is provider-applied.

## 9. Limitations

- **`pandoras-box-memory` issues and PRs could not be enumerated.** The GitHub MCP surface is scoped to `Pandoras-box`; the ProjectOS bridge that covers it is down (F1); and attaching the repo with API access was denied in this session. Memory findings here are derived from its git history, its live runtime, and what `Pandoras-box` issues record about it. Its open-PR set (#25, #30–#36, #40, #41, #47, #48) is known only by PR ref, and squash-merge history makes open/closed status unresolvable from git alone.
- **No live Vercel or Supabase provider reads** — those connectors are unauthorized in this session, so deployment identities are taken from repository records and are marked as such.
- **F1's specific root cause is a leading hypothesis, not a proof.** The two candidate causes are named and distinguishable by one read-only check.
- Everything here is source-, provider-metadata-, and runtime-level review. **No production behavior was verified**, and nothing in this document authorizes a merge, deployment, grant change, or release.
