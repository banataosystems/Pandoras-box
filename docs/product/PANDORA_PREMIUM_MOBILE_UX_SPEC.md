# Pandora's Box — Premium Mobile UI/UX Specification

**Design target:** premium, calm, precise, phone-first owner experience  
**Reference quality bar:** Apple-level discipline and finish without copying Apple's product identity  
**Product identity:** distinctly Pandora — institutional monochrome foundation, approved Pandora mark, restrained red emphasis  
**Primary platform for QA:** Android phone  
**Themes:** Light / Dark / System  
**Owner language:** simple by default; no hidden-builder or infrastructure terminology

---

## 1. Design objective

Pandora should feel less like a developer control panel and more like a trusted personal operating system for the owner's businesses and projects.

The visual experience must communicate five qualities immediately:

1. **Calm** — no dashboard noise, no wall of metrics, no visual panic.
2. **Authority** — strong hierarchy, deliberate spacing, confident typography.
3. **Truth** — nothing looks complete, healthy, live, or safe unless it is verified.
4. **Control** — one obvious next action; Undo is always understandable where recovery exists.
5. **Privacy** — implementation internals stay invisible; the owner sees outcomes and proof, not plumbing.

The UI should feel premium through restraint, precision, responsiveness, motion quality, state completeness, and copy quality—not through gradients, glass effects, bright colors, decorative charts, or excessive animation.

---

## 2. User-facing information architecture

### Primary bottom navigation

Use exactly five destinations:

1. **Home**
2. **Actions**
3. **Approvals**
4. **Activity**
5. **Safety**

Bottom navigation is persistent on primary pages, safe-area aware, thumb-friendly, and visually quiet.

### Primary action model

Across the app, the owner's mental model is:

**Build → Preview → Fix → Publish → Live → Undo**

These are product concepts, not necessarily six permanent tabs. They appear contextually where relevant.

### Supporting surfaces

- Projects
- Project detail
- Ask Pandora
- Preview
- Live version
- Version history / Undo
- Roadmap
- Proof
- Memory search
- Connections that the owner intentionally recognizes
- Settings
- Security code / extra identity check

The hidden app builder is not listed in Connections and is not shown anywhere in the user interface.

---

## 3. Design tokens

Use semantic tokens rather than page-specific styling.

### 3.1 Color system

The exact Pandora red seed must be sampled and locked from the approved Pandora product mark. Do not recolor or reinterpret the mark.

#### Dark theme

- `canvas`: near black; visually deeper than cards
- `surface.primary`: black/graphite
- `surface.secondary`: slightly lighter graphite
- `surface.elevated`: reserved for sheets/menus
- `text.primary`: near white
- `text.secondary`: neutral mid-light gray
- `text.tertiary`: lower emphasis but still accessible
- `border.subtle`: low-contrast neutral
- `border.strong`: higher neutral contrast
- `accent.primary`: approved Pandora red
- `accent.subtle`: low-opacity/tinted red for selected or emphasized regions
- `success`: muted verified green only
- `attention`: restrained amber only
- `danger`: semantic destructive red distinct from brand use when necessary

#### Light theme

- `canvas`: soft off-white/very light neutral
- `surface.primary`: white
- `surface.secondary`: light neutral
- `surface.elevated`: white with subtle depth
- `text.primary`: near black
- `text.secondary`: neutral gray
- `border.subtle`: light neutral
- brand/semantic colors use the same meaning as dark mode

### Color rules

- Red is sparse and intentional: primary CTA, selected navigation state, key emphasis, urgent approval—not every icon or card.
- Green is reserved for verified/safe states and never used as general decoration.
- Amber means attention/waiting, not success.
- No blue-dominant UI.
- No gradient backgrounds.
- No status communicated only through color; always pair with text/icon/state label.

### 3.2 Spacing

Use a 4-point base grid:

- 4 — micro gap
- 8 — compact element gap
- 12 — tight card/content gap
- 16 — standard content gap
- 20 — comfortable group gap
- 24 — section spacing
- 32 — major section spacing
- 40 — large break
- 48 — major vertical rhythm

Default page horizontal padding:

- compact phones: 16
- standard phones: 20
- large phones: 24 when space permits
- tablets/web: responsive max-content rules, never giant stretched cards

### 3.3 Typography

Prefer platform-native/system fonts for native feel and reliability. Do not force an ornamental font.

Recommended semantic scale:

- `display`: 32, semibold, compact leading
- `title.large`: 28, semibold
- `title`: 22–24, semibold
- `headline`: 17–18, semibold/medium
- `body`: 16–17, regular
- `callout`: 15, regular/medium
- `caption`: 12–13, regular/medium

Rules:

- avoid all-caps except tiny technical/internal labels that are not owner-facing;
- limit each screen to one dominant heading;
- use weight, spacing, and hierarchy before introducing color;
- support system text scaling without clipping;
- critical status and action labels remain readable at large text sizes.

### 3.4 Corners

- input/button radius: 12
- small card radius: 14–16
- major card/sheet radius: 18–20
- pills only for true compact status/chip controls

Avoid making every surface a pill.

### 3.5 Touch targets

- minimum interactive target: 48dp on Android
- never below 44 logical points on any platform
- icon-only button visual icon can be 20–24, but its hit area remains 48
- destructive actions must not sit immediately adjacent to common primary actions without spacing or confirmation.

### 3.6 Borders, depth, and shadows

- thin neutral borders establish structure;
- subtle tonal layering provides most depth;
- shadows are soft and minimal;
- no glow;
- no glassmorphism haze;
- no heavy floating-card stack.

---

## 4. Component system

All screens should be rebuilt from a small standardized component library.

### Foundation components

- `PandoraAppScaffold`
- `PandoraTopBar`
- `PandoraBottomNav`
- `PandoraMark`
- `PageTitle`
- `SectionHeader`
- `PrimaryButton`
- `SecondaryButton`
- `TertiaryButton`
- `IconButton48`
- `StatusPill`
- `FilterChip`
- `PandoraSearchField`
- `PandoraCommandBar`
- `SheetContainer`
- `ConfirmationSheet`

### Information components

- `PriorityCard`
- `ProjectRow`
- `ProjectCard`
- `ProofLadder`
- `ProofDrawer`
- `ActionRow`
- `ApprovalCard`
- `ActivityRow`
- `SafetyRow`
- `LiveVersionCard`
- `VersionHistoryRow`
- `ProgressBarVerified`
- `FreshnessLabel`

### State components

- `SkeletonBlock`
- `LoadingPageState`
- `EmptyState`
- `ErrorState`
- `OfflineBanner`
- `StaleDataBanner`
- `PermissionRequiredState`
- `NotVerifiedState`
- `InlineRetry`

### Feedback components

- `SuccessToast`
- `WarningToast`
- `InlineStatus`
- `ProgressSheet`
- `ExtraIdentityCheckSheet`

Components use design tokens only. No page can introduce its own random padding, radius, color, or button style unless the design system is intentionally extended.

---

## 5. Motion and interaction

Premium feel comes from predictable motion rather than large animation.

### Timing

- tap/press feedback: ~100–140ms
- simple state change: ~160–200ms
- page/sheet transition: ~220–280ms
- success completion: brief, <=300ms

### Motion rules

- use opacity/position/scale subtly;
- avoid bouncing, elastic motion, spinning logos, or decorative looping animation;
- reduced-motion setting disables nonessential motion;
- skeletons should be subtle and calm;
- do not block the app behind a full-screen spinner when partial content can render.

### Haptics

Use sparse platform-appropriate haptics:

- light selection for tab/filter changes when appropriate;
- confirmation haptic for a completed protected approval or successful publish/undo action;
- warning haptic only for meaningful blocked/destructive decisions;
- never vibrate repeatedly during loading or errors.

---

## 6. One-handed phone behavior

- primary actions should be reachable in the lower two-thirds of the display whenever practical;
- long screens keep primary CTA sticky near the bottom only when it does not obscure content;
- bottom navigation uses large evenly spaced hit areas;
- avoid tiny top-right-only actions for common tasks;
- use bottom sheets for filters, approval context, proof details, and confirmation when appropriate;
- keyboard opening must not hide the Ask Pandora send/submit action;
- no horizontal scrolling on normal owner pages.

---

## 7. Current-screen-to-target mapping

The current project contains ten verified primary pages. Preserve existing route/project history internally while transforming the visible experience.

### 7.1 `SplashConnection` → Launch Gate

**Visible name:** none; this is a transient startup state.

Target behavior:

- approved Pandora mark centered or upper-middle;
- simple line such as `Preparing Pandora` only if launch takes long enough to require copy;
- instant transition when session/state is ready;
- if offline, show calm `You're offline` state with last verified context where safe;
- if session expired, route directly to Sign In;
- no service/provider connection names;
- no developer health dashboard on launch.

Acceptance:

- fast path does not flash unnecessary screens;
- slow path has meaningful progress/feedback;
- offline/auth routes deterministic;
- no hidden-provider text.

### 7.2 `SignIn` → Sign In

Target layout:

- mark + `Pandora's Box`;
- one short sentence, e.g. `Your projects, actions, and approvals in one place.`;
- email/identity entry with large controls;
- single primary CTA;
- passwordless/security method copy in owner language;
- help/recovery subordinate;
- no backend/service names.

States:

- loading;
- wrong/expired link;
- account not permitted;
- network issue;
- successful sign-in.

### 7.3 `CommandCenter` → Home

This becomes the premium primary dashboard.

Order:

1. compact Pandora header;
2. greeting/context line only if useful;
3. dominant **Ask Pandora** command entry;
4. one priority card: approval, blocker, or best safe next action;
5. truthful compact summary strip only if data is verified;
6. Top projects — maximum three;
7. recent meaningful activity — maximum three to five;
8. contextual `View all` links;
9. bottom navigation.

Do not display a fake overall health score or fake percentage.

If data is unknown, hide the metric or show `Not verified yet`; never substitute zero.

### 7.4 `ProjectDetails` → Project Detail

Top area:

- project name;
- one-line purpose;
- current plain-language phase/status;
- last verified freshness.

Primary content:

- `Where we are now`
- five-stage proof ladder
- `Done`
- `In progress`
- `Blocked`
- `What Pandora will do next`
- `What I need from you` only when genuinely needed

Primary actions:

- `Continue safely`
- `Ask Pandora`
- overflow/sheet: `Roadmap`, `Show proof`, `Prepare to publish`, `Version history`.

No raw repository/commit/provider data in the default view.

### 7.5 `ActionsCatalog` → Actions

This becomes the operating inbox.

Top:

- page title `Actions`;
- prominent Ask Pandora field;
- optional suggestion chips based on real current context.

Sections:

- `Next best action`
- `In progress`
- `Waiting`
- `Projects`

Action rows explain outcome, not implementation.

Examples:

- `Continue the website redesign`
- `Check what is blocking this project`
- `Prepare a preview`
- `Fix safe issues`

### 7.6 `ActionBuilder` → Ask Pandora / Build

The current action-builder surface becomes the natural-language creation/repair experience.

Visible title based on context:

- `Ask Pandora`
- `Build`
- `Fix`

Layout:

- conversation/context summary;
- large text input at bottom;
- attachment/context chips only when useful;
- clear send/action button;
- result card with plain-language proposed action;
- `Preview` when a visible change is being prepared;
- `Apply safely` only for reversible non-live changes allowed by policy;
- protected actions route to approval rather than silently executing.

### 7.7 `ApprovalCenter` → Approvals

Cards show:

- what will happen;
- why Pandora needs the owner;
- what could go wrong;
- how Pandora can undo it;
- affected project;
- whether it changes the live system.

Primary actions:

- `Approve`
- `Reject`
- `Ask Pandora`

Protected approval copy:

`Extra identity check required`

Never show AAL2/TOTP terminology.

### 7.8 `PlansExecution` → Preview / Action Progress

The current run/execution page should become the bridge between Build/Fix and the resulting checked change.

For a prepared visible change:

- title: `Preview`;
- before/after or concise change summary;
- checks list;
- `Apply safely` when non-live and allowed;
- `Publish` only when release candidate is ready and separate release policy is satisfied.

For work already running:

- title: `Working on it` or contextual title;
- concise progress steps;
- do not show fake percentages;
- show verified completed steps and current step;
- `Stop` only when safely supported.

For completed non-live action:

- `Change ready`;
- what changed;
- checks;
- `Preview`, `Undo`, or `Prepare to publish` as applicable.

### 7.9 `ActivityAuditTrail` → Activity

Default row:

- clear human event title;
- project;
- outcome/status;
- time;
- optional one-line explanation.

Filters:

- All
- Changes
- Approvals
- Live versions
- Safety
- Blocked

Tap opens proof sheet. Raw IDs/hashes remain secondary proof, not primary copy.

### 7.10 `SecurityOperations` → Safety

This becomes a trust center, not a security console.

Sections:

- `Protection status`
- `Needs attention`
- `Latest checks`
- `Undo readiness`
- `Sign-in protection`
- `Connections` (only owner-recognizable services)
- `Not verified yet`

Use green only for actually verified checks.

Do not show the hidden app builder as a connection.

---

## 8. New supporting surfaces to add

### 8.1 Projects

Searchable project list with owner-friendly filters:

- All
- Active
- Needs approval
- Blocked
- Ready to publish
- Live
- Needs live check

Each row:

- name;
- one-line purpose;
- phase/status;
- verified percentage only when calculated;
- one blocker/next action if relevant.

### 8.2 Publish

This is a focused release sheet/page, not an infrastructure screen.

Stages shown in owner language:

- `Saving the current version`
- `Preparing the app`
- `Running checks`
- `Preparing preview`
- `Preview ready`
- `Ready to publish`

Before live approval:

- what is changing;
- checks status;
- current live version saved/undo-ready;
- preview link/action;
- `Publish now`;
- optional `Not now`.

After approval:

- `Publishing…`
- `Checking live version…`
- success: `Published and checked live`
- failure with rollback: `The new version did not pass the live check. Pandora restored the last safe version.`

### 8.3 Live Version

Shows:

- `Live` status;
- domain/site;
- last checked time;
- release summary;
- `Open site`;
- `Show proof`;
- `Version history`;
- `Undo` when policy permits.

### 8.4 Version History / Undo

Rows show:

- date/time;
- plain-language release description;
- `Checked live` / `Preview only` / `Failed and restored`;
- current badge;
- rollback eligibility.

Undo sheet explains exactly what version will be restored and what will remain unchanged.

### 8.5 Memory Search

Owner language:

- `Search what Pandora remembers`
- project filters;
- decisions, roadmaps, blockers, evidence, open loops.

Do not expose protected/private memory bodies outside authorization scope.

### 8.6 Settings

Sections:

- Appearance: System / Light / Dark
- Pinned projects
- Home layout
- Notifications
- Sign-in & security
- Advanced owner controls

The hidden app builder never appears even in Advanced owner controls.

---

## 9. Home screen detailed layout

### Header

Height should remain compact. Avoid oversized brand chrome.

Left:

- Pandora mark 28–32 logical px;
- `Pandora's Box` or context-specific short title.

Right:

- avatar/settings or compact status access.

### Ask Pandora

A prominent rounded command field/card near the top:

`What do you want Pandora to do?`

Tapping opens the full command experience.

Suggested commands appear only when contextually useful and must not crowd the screen.

### Priority card

Only one dominant card.

Priority order:

1. genuine owner approval;
2. critical blocker/safety issue;
3. release ready for separate approval;
4. highest-value safe next action;
5. calm state: `Nothing needs you right now`.

### Summary metrics

Show at most three compact metrics and only when values are current and canonical.

Candidate metrics:

- approvals;
- active projects;
- needs attention.

Unknown is not zero. If evidence is stale/unknown, hide metric or show freshness state.

### Top projects

Maximum three rows.

Each:

- icon/mark;
- name;
- short phase;
- percentage + progress only when canonical calculation exists;
- chevron/tap affordance.

### Recent activity

Maximum three to five meaningful events. Avoid low-value log spam.

---

## 10. Button hierarchy

### Primary

One per decision area. Uses Pandora red fill or the strongest theme-appropriate emphasis.

Examples:

- Continue safely
- Review
- Preview
- Publish now
- Apply safely

### Secondary

Neutral surface/border.

Examples:

- Ask Pandora
- Show proof
- Not now
- View all

### Tertiary

Text/icon only for low-priority actions.

### Destructive

Use semantic destructive styling only for irreversible/removal actions. Undoing to a verified version is a recovery action and should not look destructive by default, but it still requires a clear confirmation when it changes live state.

---

## 11. Loading states

### First load

- skeleton major regions rather than full-screen spinner;
- preserve layout so content does not jump;
- show freshness once data arrives.

### Partial load

Each module may load independently. One failed module should not blank the entire Home screen.

### Long action

Use a progress sheet showing verified discrete steps rather than guessed percentage:

- `Saving current version` ✓
- `Checking the change` ✓
- `Preparing preview` current
- `Waiting for your approval` pending

---

## 12. Empty states

Every empty state should answer:

1. what this means;
2. whether anything is wrong;
3. what the owner can do next.

Examples:

### Approvals

`Nothing needs your approval right now.`

### Activity

`No activity matches these filters.`

### Projects

`No projects match this view.`

### Live version

`This project is not live yet.`

Never show fake sample cards to make a page look populated.

---

## 13. Error states

Rules:

- never display raw exception/provider text;
- say whether the current/live version changed;
- say what Pandora will do next;
- offer Retry only when retry is safe;
- offer `Show proof` for owner-readable evidence;
- technical detail stays internal.

Examples:

`Pandora could not confirm that this change was saved. Nothing else was changed.`

`A required check failed before publishing. Your live version is unchanged.`

`The new version did not pass the live check. Pandora restored the last safe version.`

---

## 14. Offline and stale states

Offline behavior:

- top-level slim banner: `You're offline`;
- cached safe summaries may render with `Last verified …`;
- disable meaningful writes;
- do not queue production/destructive actions silently;
- Ask Pandora may allow drafting a command but must clearly indicate it cannot execute until reconnected.

Stale data:

- display `Last verified <time>`;
- if freshness exceeds policy threshold, status becomes `Needs checking` rather than remaining green.

---

## 15. Accessibility

Required:

- 48dp Android targets;
- semantic labels for every icon-only control;
- logical screen-reader order;
- no critical information conveyed only through color;
- text contrast at least WCAG AA for normal text;
- dynamic text scaling without clipped CTAs/status;
- focus states on web/keyboard paths;
- reduced-motion behavior;
- form errors linked to fields;
- clear labels rather than placeholder-only forms;
- large tap area around small icons;
- haptics supplementary, never required to understand state.

---

## 16. Android-first visual QA matrix

Every primary screen must be captured and reviewed in at least these logical viewport classes.

### Android phones

- compact: ~360 × 800 dp
- standard: ~393 × 852 dp
- large: ~412 × 915 dp

### Android tablet/foldable width check

- ~600dp content width and wider adaptive layout

### Secondary iPhone checks

- ~390 × 844 pt
- ~430 × 932 pt

### Web/responsive

- 360px narrow
- 768px tablet
- 1024px desktop
- 1440px wide desktop

The owner experience must not become a stretched mobile card column on desktop; use sensible max widths and multi-column layouts only when they improve comprehension.

---

## 17. Visual QA states per screen

Capture at minimum:

- Dark theme normal
- Light theme normal
- System theme behavior
- loading
- empty
- error
- offline
- stale data
- long project/action name
- large text scaling
- 0/1/many approvals
- hidden/unknown percentage
- protected action needing extra identity check

Publish/Live/Undo surfaces additionally require:

- preview ready;
- checks failed;
- awaiting release approval;
- publishing;
- live verification success;
- live verification failure + rollback;
- restored previous version.

---

## 18. String and terminology QA

Before every candidate is considered Tested, scan all user-visible copy case-insensitively for forbidden implementation terms.

Zero-tolerance user-visible strings include:

- `FlutterFlow`
- `MCP`
- `YAML`
- `CI`
- `provider`
- `bearer token`
- internal service-role language
- raw schema/fingerprint language
- raw auth-assurance acronyms

The hidden provider name may remain in internal code paths and engineering evidence, but no component can render it.

---

## 19. Premium acceptance criteria

The redesign is **documented** when:

- tokens/components/screen maps/states/QA matrix are recorded.

The redesign is **implemented** when:

- all ten current primary screens use the standardized component system;
- current visible copy follows owner-language rules;
- themes and responsive rules are applied;
- hidden-provider text is absent from project UI strings;
- exact provider read-back confirms the modified project partitions.

The redesign is **tested** when:

- Android-first visual QA matrix passes;
- navigation passes;
- loading/empty/error/offline/stale states pass;
- large text/accessibility checks pass;
- terminology scan passes;
- generated source analyzes/tests/builds for the required target;
- exact tested source/artifact is recorded.

The redesign is **deployed** when:

- the exact tested candidate has a deployment artifact ID.

The redesign is **production verified** only when:

- separately approved exact candidate is live;
- live smoke/auth/navigation checks pass;
- live version identity matches the approved manifest;
- rollback target is recorded and usable;
- no forbidden provider text is visible in the live app.

---

## 20. Implementation sequence for the current app

1. Lock design tokens and component names.
2. Add zero-tolerance provider-name/user-jargon lint.
3. Rebuild shared app shell and bottom navigation.
4. Redesign Launch Gate and Sign In.
5. Redesign Home/CommandCenter.
6. Redesign Actions and Ask Pandora/ActionBuilder.
7. Redesign Project Detail.
8. Redesign Approvals.
9. Redesign Preview/PlansExecution.
10. Redesign Activity.
11. Redesign Safety.
12. Add Projects list, Publish, Live Version, Version History/Undo, Settings, Memory search.
13. Wire every visible metric/status to truthful backend data or hide it.
14. Implement loading/empty/error/offline/stale states everywhere.
15. Run Android-first visual/navigation/accessibility QA.
16. Export generated Flutter source and run release-level checks.
17. Deploy protected preview and verify.
18. Stop at the production release gate until a separate explicit owner approval exists for the exact candidate.

---

## 21. Final visual rule

If a screen looks impressive because it contains many cards, metrics, effects, or controls, simplify it.

Pandora should look premium because the owner instantly understands:

- what matters;
- what is true;
- what Pandora is doing;
- what needs approval;
- whether something is live;
- how to undo it.
