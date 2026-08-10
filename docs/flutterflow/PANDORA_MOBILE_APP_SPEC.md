# Pandora Mobile — FlutterFlow Product Specification

**Project key:** `mcpmaster`  
**Target:** existing FlutterFlow Pandora project + Android/iOS/web-responsive owner app  
**Primary device:** smartphone  
**Status:** documented; FlutterFlow Project API adapter implemented and locally tested; live FlutterFlow project mutation not yet authorized/verified  
**Canonical source:** `banataosystems/Pandoras-box`

## 1. Product intent

Pandora Mobile is the owner-facing control surface for Pandora's-Box / MCPMaster / ProjectOS. It must make a powerful multi-project system feel obvious to use: say what you want in normal language, see what matters now, approve only what actually requires approval, and inspect proof only when you want it.

The software adapts to the owner. The owner does not reorganize their work around developer terminology.

## 2. Recovered FlutterFlow project evidence

A previously captured mobile FlutterFlow session shows an existing **Pandoras Box** project open in FlutterFlow and connected to the Supabase organization/project labeled **MCPMaster Meta**. The same evidence shows three visible FlutterFlow issues: two navigation actions targeting pages that do not exist and one property-override return-type mismatch.

Therefore the default execution strategy is **bind and repair the existing Pandora FlutterFlow project**, not create a duplicate. The exact FlutterFlow `projectId` must be resolved by the authenticated `listProjects` API before any mutation. Never guess it from a screenshot or URL fragment.

## 3. UX principles

1. **Plain language first.** Translate technical terms by default: `deployment` → `live version`, `pull request` → `proposed code change`, `AAL2` → `extra identity check required`.
2. **One obvious next action.** Home emphasizes the highest-value safe next step or the one owner approval that matters most.
3. **Truthful proof ladder.** Always distinguish `Documented → Implemented → Tested → Deployed → Production verified`.
4. **Evidence on demand.** Simple summary first; commits, hashes, deployment IDs, tests, reviews, audit IDs, and rollback details are expandable.
5. **Phone first.** One-hand use, large touch targets, no horizontal scrolling, minimal typing, common Android viewport first.
6. **Flexible.** Projects can be pinned; home modules can be reordered/hidden; simple/advanced mode can be changed anytime.
7. **Fail closed.** Unknown or stale state displays `Not verified yet` or `Last verified …`; never estimate from UI alone.
8. **No accidental authority.** Protected production, destructive, spending, legal/public, regulated, permission, or security-sensitive actions route through the correct approval gate.
9. **Real percentages only.** A project completion percentage may appear only when Pandora calculates it from the current weighted roadmap/task/proof state. Never reuse visual-demo numbers such as 82%, 61%, or 44% as live facts.

## 4. Visual source of truth

The approved dark dashboard reference is the primary visual direction.

### Core appearance
- Near-black institutional background with black/graphite layered cards.
- Bright white primary text, softened gray secondary text.
- Restrained Pandora red as the dominant accent for primary actions, selected navigation, progress, and urgent approval emphasis.
- Green only for verified/safe system status; amber only for attention; other colors are semantic and sparse.
- Red geometric Pandora mark at the top left; do not overdecorate the product with logos.
- Thin neutral borders, subtle shadows/depth, controlled rounded corners.
- Strong, large, extremely readable typography.
- No blue-dominant theme, no noisy gradients, no excessive glassmorphism.
- Light and System themes remain supported, but the dark reference defines hierarchy and spacing.
- Accessibility: high contrast, scalable text, meaningful labels, minimum 44px touch targets, and no color-only status.

### Home hierarchy from the approved reference
1. Pandora header and system-health pill.
2. One large **approval / most-important action** card with clear `Review` and secondary action.
3. Three compact counters: approvals, active projects, needs attention.
4. **Top projects — A quick look at progress:** exactly up to three proof-backed project rows, percentage + progress bar + plain-language state, with `View all`.
5. **Recent activity:** newest meaningful verified events, with `View all`.
6. Bottom navigation.

The home screen should be understandable in seconds without scrolling through a developer dashboard.

## 5. Navigation

Use the approved five-item bottom navigation:

1. **Home**
2. **Actions**
3. **Approvals**
4. **Activity**
5. **Safety**

`Projects`, `Ask Pandora`, Memory, Connections, Audit, and Settings remain first-class surfaces reached from Home/Actions/contextual controls rather than crowding the bottom bar.

A persistent **Ask Pandora** command entry is available from Home and Actions. It should feel like the fastest way to say “continue this”, “what is blocking this?”, or “do the next safe thing”.

## 6. HomePage

### Header
- Pandora mark.
- `Pandoras-Box`.
- Short subtitle such as `Everything in one place`.
- truthful system-health pill: `All systems protected`, `Needs attention`, `Degraded`, or `Offline`, based on current evidence.

### Priority / approval card
If an approval is genuinely pending, make it the dominant card:
- `1 thing needs your approval` style headline;
- one-sentence project/action explanation;
- explicit statement that it will not go live until approved when relevant;
- primary `Review`;
- secondary `Later` or safe equivalent.

If no approval is pending, use the same space for the one best safe next action or a calm `Nothing needs you right now` state.

### Summary counters
- Approvals
- Active projects
- Needs attention

Counts come from canonical Pandora records, never mock analytics.

### Top projects
Show up to **three** projects selected from current priority/pinned configuration. Each row includes:
- project icon/name;
- plain-language phase/state;
- proof-backed completion percentage only when calculable;
- progress bar only when percentage is backed by the same canonical calculation;
- tap to project detail.

### Recent activity
Show only meaningful verified activity, such as:
- safety checks passed;
- roadmap/evidence saved;
- deployment verified;
- approval decision;
- blocker opened/resolved.

Never label a provider response or build as “done” unless the task-specific proof gate passed.

## 7. ActionsPage

This is the operating inbox, not a raw task dump.

Sections:
- **Ask Pandora** — natural-language command bar: `What do you want Pandora to do?`
- **Next safe action** — one recommended action with `Why this?`.
- **In progress** — bounded current work.
- **Waiting / blocked** — only genuine dependencies.
- **Projects** — search/view all canonical projects.

Example owner language:
- “Continue Porknyeta.”
- “What is blocking FXPass?”
- “Show what needs my approval.”
- “Which project should we work on next?”
- “Do the next safe thing.”

Safe reversible no-cost work may execute automatically when policy allows. Meaningful writes must display/record the governed action and approval state.

## 8. Projects and ProjectDetail

Projects list is searchable and filterable: All, Active, Needs approval, Blocked, Deployed not verified, Production verified.

Each project displays friendly name, purpose, current phase, truthful five-stage ladder, proof-backed completion percentage if available, blocker, and next autonomous action.

### Project detail — simple default
- What this project is
- Where we are now
- What is done
- What is being worked on
- What is blocked
- What I need from you
- What Pandora will do next

### Five-stage proof ladder
1. Documented
2. Implemented
3. Tested
4. Deployed
5. Production verified

### Evidence drawer
Expandable exact evidence:
- canonical repository/branch/commit;
- source snapshot/hash;
- tests and independent review;
- database/auth checks;
- deployment ID/URL;
- live production verification;
- rollback target;
- audit IDs.

Primary actions: Continue safely, Ask about this project, Show roadmap, Show evidence, Request review, Prepare release.

## 9. ApprovalsPage

Only genuine approval-requiring actions appear here.

Each card explains in simple language:
- What will happen
- Why it is needed
- What could go wrong
- Rollback/recovery
- Project/environment
- Exact artifact

Actions: Approve, Reject, Ask a question.

Protected approval displays **“Extra identity check required for this action.”** and routes through existing MFA/TOTP AAL2 verification. No secrets or tokens are exposed.

## 10. ActivityPage

Human-readable chronological evidence stream with filters by project, verification type, approval, deployment, blocker, and safety event. Advanced details reveal hashes/provider IDs without cluttering default view.

## 11. SafetyPage

A plain-language trust center:
- system connection health;
- current unresolved security/privacy blockers;
- latest safety checks;
- rollback readiness;
- protected actions/MFA status;
- connector health summaries;
- `Why this is safe` / `What is not verified yet` explanations.

This page must never imply safety from absence of alerts alone.

## 12. Supporting surfaces

### Ask Pandora
Chat-style command experience for short owner messages. Every reality-changing result ends with an expandable capsule: What changed · Evidence · Current phase · Done · In progress · Blocked · Risks · Next autonomous action.

### Memory
Search canonical Pandora Memory, decisions, open loops, and evidence timeline. Read-first; edits only through governed actions.

### Connections
GitHub, Vercel, Supabase, PostHog, Gmail, Google Drive, Resend, Outlook, FlutterFlow, and future adapters. States: Connected, Degraded, Disconnected, Needs permission. Never claim connected without current health/read proof.

### Settings
Light/Dark/System; Simple/Advanced; pinned/top projects; home-module order; notifications; Security/MFA.

## 13. Reusable FlutterFlow components

- `AppShell`
- `PandoraHeader`
- `SystemHealthPill`
- `PriorityApprovalCard`
- `SummaryMetricCard`
- `TopProjectRow`
- `PandoraCommandBar`
- `ProjectCard`
- `StatusLadder`
- `ApprovalCard`
- `EvidenceDrawer`
- `ConnectionCard`
- `AuditEventRow`
- `SafetyCheckRow`
- `EmptyState`
- `ErrorState`
- `OfflineBanner`

Pages/surfaces:
- `HomePage`
- `ActionsPage`
- `ProjectsPage`
- `ProjectDetailPage`
- `PandoraChatPage`
- `ApprovalsPage`
- `ActivityPage`
- `SafetyPage`
- `RoadmapPage`
- `EvidencePage`
- `MemoryPage`
- `ConnectionsPage`
- `SettingsPage`
- `SignInPage`
- `MfaChallengePage`

## 14. Data and API boundaries

FlutterFlow is a presentation/control surface, not the provider-secret holder and not the authority engine.

Use MCPMaster/ProjectOS owner-safe APIs for governed reads/intents/approvals. Provider actions execute server-side. Requirements:
- authenticated owner session;
- Supabase-backed identity where applicable;
- AAL2/TOTP for protected approvals;
- no service-role/provider secret in FlutterFlow;
- tenant/project authorization server-side;
- no private Memory bodies exposed unless explicitly owner-authorized;
- logs redact tokens, credentials, private documents, and sensitive message bodies.

## 15. Offline/degraded behavior

When backend/Pandora is unavailable:
- show cached non-sensitive summaries only with visible freshness;
- disable meaningful writes;
- display `Last verified <time>`;
- never guess completion or production state;
- never silently queue destructive/production actions.

## 16. FlutterFlow execution sequence

1. Authenticate to FlutterFlow through a supported secure bearer-token/connector path; never place the token in chat, source, logs, or Memory.
2. Call `listProjects` and resolve the existing **Pandoras Box** project. Record exact project ID, owner/team metadata, current version/schema fingerprint.
3. List partitioned YAML files and read the current project schema before designing changes.
4. Create a rollback/version-history point before meaningful mutation when supported.
5. Repair the three currently evidenced project issues: two invalid navigation targets and the property-override return-type mismatch, after confirming exact current YAML paths.
6. Apply the approved visual source of truth: dark institutional/red hierarchy, dominant priority/approval card, three top-project rows, recent activity, and approved bottom navigation.
7. Wire clearly labeled mock projections only where live owner-safe APIs do not yet exist; mocks must never resemble verified live data.
8. Wire read-only canonical project/status projections first.
9. Wire Ask Pandora intents, approvals/AAL2, Memory, Connections, Evidence, Activity, and Safety.
10. For every YAML file: **read → modify locally → validateProjectYaml → updateProjectByYaml only after validation and required approval**.
11. Re-read modified YAML and verify expected provider state after mutation.
12. Test Android first, then iPhone/tablet/web responsive layouts, loading/empty/error/offline states, navigation, and accessibility.
13. Preserve project ID, schema fingerprint/version, exact changed files, validation results, screenshots, test evidence, export/source hash where available, and rollback point in Pandora.
14. Production release remains a separate owner-authorized gate.

## 17. Definition of done for v1

V1 is complete only when:
- existing FlutterFlow Pandora project is authenticated and exact project ID recorded;
- current FlutterFlow issues are repaired and rechecked;
- approved dark visual reference is faithfully implemented, with Light/System themes also working;
- Home renders real top-three projects/percentages only from canonical proof calculations;
- owner can navigate comfortably on a normal Android phone;
- canonical project state is read from governed backend;
- five-stage proof ladder is truthful;
- Ask Pandora submits owner intent;
- approvals work with AAL2 for protected actions;
- degraded/offline states fail closed;
- security/privacy checks pass;
- responsive/mobile verification is recorded;
- FlutterFlow version-history/rollback evidence is recorded;
- source/export snapshot/hash is preserved where supported;
- production is not claimed until live workflow verification passes.

## 18. Current blockers

1. The ChatGPT `Pandoras-box` MCP facade remains behind Vercel SSO/Deployment Protection before application authentication. The authoritative Pandora backing database is reachable and was reconciled directly through governed Supabase access, but the normal MCP facade is not production-verified.
2. FlutterFlow provider actions are registered in Pandora but remain `planned`/disabled.
3. No usable FlutterFlow Project API bearer token is available in Pandora, MCPMaster Meta staging, or this ChatGPT execution session. The token must never be pasted into chat or committed to source.
4. Existing FlutterFlow project presence is visually evidenced, but exact `projectId` must be obtained from authenticated `listProjects` before mutation.
