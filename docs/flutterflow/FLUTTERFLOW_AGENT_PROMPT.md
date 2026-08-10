# FlutterFlow Agent Prompt — Pandora Mobile v1

Work on the **existing Pandora / Pandoras Box FlutterFlow project** for Banatao Systems. Do **not** create a duplicate unless an authenticated `listProjects` call proves no matching existing project is accessible.

The app is the smartphone-first owner control surface for Pandora's-Box / MCPMaster / ProjectOS. It must make a complex multi-project automation system feel obvious, calm, and flexible to a non-technical owner.

Before changing anything:
1. authenticate through the supported FlutterFlow API/agent credential path;
2. call `listProjects` and resolve the existing Pandora project by provider metadata, never by guessed ID;
3. record exact project ID, owner/team metadata, current schema fingerprint/version;
4. list partitioned YAML files and read the current project schema;
5. identify a rollback/version-history point;
6. plan changes against the current typed schema;
7. validate every changed YAML file before update.

Never paste, print, log, store in project YAML, commit, or return the FlutterFlow bearer token.

## Existing project evidence to respect

Prior mobile evidence shows an existing **Pandoras Box** FlutterFlow project connected to **MCPMaster Meta** through Supabase. The visible Issues panel shows three defects to inspect and repair against current project YAML:
- two navigation actions targeting pages that do not exist;
- one property-override return-type mismatch.

Confirm the exact current targets/types before repairing them. Do not guess page IDs or schema keys.

## Product behavior

Default to plain language. The owner should not need to understand GitHub, Vercel, Supabase, deployments, pull requests, hashes, MCP, or AAL2.

Always preserve the truthful proof ladder:

**Documented → Implemented → Tested → Deployed → Production verified**

Never reduce those to one generic `Done` state.

Any completion percentage shown in the app must be supplied by Pandora's canonical weighted roadmap/task/proof calculation. Never hardcode or infer percentages from visual progress. Numbers in visual references are layout examples, not live truth.

The app must adapt to the owner: pinned projects, configurable home modules, Simple/Advanced mode, minimal typing, one-hand phone use, and one obvious next action.

## Visual source of truth

Follow the approved Pandora dark dashboard reference closely.

- Near-black institutional background.
- Graphite/black layered cards with thin restrained borders and subtle depth.
- Bright white primary text and soft gray supporting copy.
- Pandora red is the dominant accent for primary actions, selected navigation, progress, and urgent approvals.
- Green is only for verified/safe system status; amber only for attention; other colors remain sparse and semantic.
- Prominent red geometric Pandora mark at top left.
- Strong large typography, generous spacing, minimum 44px touch targets.
- No blue-dominant UI, noisy gradients, excessive glassmorphism, or clutter.
- Support Light, Dark, and System themes; dark reference defines hierarchy and spacing.
- Maintain accessibility and never communicate status by color alone.

## Bottom navigation

Use exactly five primary destinations:
1. Home
2. Actions
3. Approvals
4. Activity
5. Safety

Projects, Ask Pandora, Memory, Connections, Audit, and Settings remain first-class supporting surfaces reachable from Home, Actions, project context, or overflow/settings—not additional bottom-nav items.

## HomePage — exact hierarchy

Build the home hierarchy in this order:

### 1. Pandora header
- Pandora mark
- `Pandoras-Box`
- subtitle such as `Everything in one place`
- truthful system-health pill: `All systems protected`, `Needs attention`, `Degraded`, or `Offline`

### 2. Dominant priority/approval card
If an approval is pending, make it the dominant card with a headline such as `1 thing needs your approval`, a short explanation, and clear `Review` + safe secondary action.

If nothing needs owner approval, use the same space for the one best safe next action or a calm `Nothing needs you right now` state.

### 3. Three compact counters
- Approvals
- Active projects
- Needs attention

### 4. Top projects
Title: `Top projects`
Subtitle: `A quick look at progress`
Show **at most three** rows, selected from canonical priority/pinned configuration. Each row shows:
- project icon/name;
- plain-language phase/state;
- proof-backed percentage only when supplied by canonical backend;
- matching progress bar only when percentage is valid.

Include `View all`.

### 5. Recent activity
Show newest meaningful verified events only. Include `View all`.

Home should be understandable in seconds.

## ActionsPage

This is the operating inbox and natural-language command area.

Include:
- prominent **Ask Pandora** input: `What do you want Pandora to do?`
- one best safe next action with `Why this?`
- In progress
- Waiting / blocked
- Search/view all Projects

Example owner messages:
- “Continue Porknyeta.”
- “What is blocking FXPass?”
- “Show me what needs my approval.”
- “Which project should we work on next?”
- “Do the next safe thing.”

Safe reversible no-cost work can execute when policy allows. Meaningful writes remain governed and auditable.

## Projects and ProjectDetail

Projects list: searchable with filters All, Active, Needs approval, Blocked, Deployed not verified, Production verified.

Each project shows friendly name, purpose, current phase, five-stage proof ladder, proof-backed completion percentage if available, blocker, and next action.

Project detail default simple sections:
- What this project is
- Where we are now
- What is done
- What is being worked on
- What is blocked
- What I need from you
- What Pandora will do next

Add expandable evidence for canonical repo/branch/commit, source hash, tests, independent review, database/auth checks, deployment ID, live production proof, rollback target, and audit IDs.

Actions: Continue safely, Ask about this project, Show roadmap, Show evidence, Request review, Prepare release.

## ApprovalsPage

Only genuine owner/admin approvals appear.

Each approval card explains:
- What will happen
- Why it is needed
- What could go wrong
- Rollback/recovery
- Project/environment
- Exact artifact

Buttons: Approve, Reject, Ask a question.

For protected actions display **“Extra identity check required for this action.”** and route to the existing MFA/TOTP AAL2 flow. Never expose secrets or tokens.

## ActivityPage

Human-readable verified activity timeline. Support project/event filters. Advanced details reveal hashes/provider IDs only on demand.

## SafetyPage

Plain-language trust center with:
- connection health;
- unresolved security/privacy blockers;
- latest safety checks;
- rollback readiness;
- MFA/protected-action state;
- connector health;
- `Why this is safe` and `What is not verified yet` explanations.

Never imply safety merely because there are no alerts.

## Supporting surfaces

### Ask Pandora
Chat-like owner command surface. Reality-changing results end with an expandable capsule: What changed · Evidence · Current phase · Done · In progress · Blocked · Risks · Next autonomous action.

### Memory
Search canonical Pandora decisions, open loops, and evidence. Read-first; edits through governed actions only.

### Connections
Cards for GitHub, Vercel, Supabase, PostHog, Gmail, Google Drive, Resend, Outlook, FlutterFlow, and future adapters. States: Connected, Degraded, Disconnected, Needs permission. Do not call a provider connected without current health/read proof.

### Settings
Light/Dark/System, Simple/Advanced, pinned/top projects, home-module order, notifications, Security/MFA.

## Reusable components

Create/reuse components named:
- AppShell
- PandoraHeader
- SystemHealthPill
- PriorityApprovalCard
- SummaryMetricCard
- TopProjectRow
- PandoraCommandBar
- ProjectCard
- StatusLadder
- ApprovalCard
- EvidenceDrawer
- ConnectionCard
- AuditEventRow
- SafetyCheckRow
- EmptyState
- ErrorState
- OfflineBanner

Pages/surfaces:
- HomePage
- ActionsPage
- ProjectsPage
- ProjectDetailPage
- PandoraChatPage
- ApprovalsPage
- ActivityPage
- SafetyPage
- RoadmapPage
- EvidencePage
- MemoryPage
- ConnectionsPage
- SettingsPage
- SignInPage
- MfaChallengePage

## Data and security boundaries

FlutterFlow is a client/control surface. Provider actions and secrets stay server-side in MCPMaster/ProjectOS.

- Never embed provider/service-role credentials.
- Protected writes require server authorization.
- Use owner-safe projections from MCPMaster/ProjectOS.
- Require AAL2/TOTP where policy says so.
- Do not expose private Memory content unless owner-authorized.
- Redact tokens, credentials, private documents, and sensitive message bodies from logs.
- When backend/Memory is unavailable, show freshness/degraded state, disable meaningful writes, and never guess current status.

## Mutation protocol

For each FlutterFlow Project API change:
1. read current YAML;
2. modify the smallest necessary file(s);
3. call `validateProjectYaml` for every changed file;
4. if any validation fails, make **no update** and repair locally;
5. require the appropriate Pandora approval before write actions;
6. call `updateProjectByYaml` only after validation/approval passes;
7. re-read the changed YAML and verify provider state;
8. record exact project ID, schema fingerprint/version, changed file keys, validation results, provider result, screenshots/tests, and rollback point in Pandora.

## First live execution pass

When authenticated FlutterFlow Project API access is available:
1. resolve and bind the existing Pandoras Box project;
2. snapshot/read current schema;
3. repair the two broken navigation targets and property-override mismatch after exact inspection;
4. implement the approved dark/red Home hierarchy and five-item navigation;
5. preserve clearly labeled mock placeholders only where live owner-safe APIs do not exist;
6. wire read-only canonical data first;
7. wire Ask Pandora, approvals/MFA, Activity, Safety, Memory, Connections, and Evidence;
8. verify Android first, then iPhone/tablet/web responsive states;
9. report project ID, version/schema fingerprint, changed pages/components, validations, remaining warnings, test evidence, and rollback point.

Do **not** claim the FlutterFlow app is implemented, tested, deployed, or production-verified until the corresponding provider/runtime evidence exists.
