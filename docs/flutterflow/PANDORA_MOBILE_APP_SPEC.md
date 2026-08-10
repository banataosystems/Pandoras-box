# Pandora Mobile — FlutterFlow Product Specification

**Project key:** `mcpmaster-pandoras-box`  
**Target:** FlutterFlow project + Android/iOS/web-responsive owner app  
**Primary device:** smartphone  
**Status:** documented / ready for FlutterFlow generation; not yet implemented in FlutterFlow  
**Canonical source:** `banataosystems/Pandoras-box`  

## 1. Product intent

Pandora Mobile is the owner-facing control surface for Pandora's-Box / MCPMaster / ProjectOS.

The app should feel simple even when the system underneath is complex. The owner should be able to say what they want in normal language, see what is happening, approve important actions, inspect proof, and move between projects without learning developer terminology.

The app must adapt to the owner's workflow. The owner must not be forced to adapt to the software.

## 2. UX principles

1. **Plain language first.** Replace technical terms with normal wording by default. Example: `deployment` → `live version`; `pull request` → `proposed code change`; `AAL2` → `extra identity check required`.
2. **One best next action.** The home screen should show the most useful safe next action instead of flooding the owner with tasks.
3. **Truthful status.** Always distinguish `documented → implemented → tested → deployed → production-verified`.
4. **Evidence on demand.** Show the simple answer first; let the owner expand to evidence, hashes, commits, deployment IDs, tests, audit events, and rollback details.
5. **Phone-first.** Large touch targets, one-hand use, short screens, sticky primary action, minimal typing, fast search, and no desktop-only workflows.
6. **Flexible, not rigid.** Home cards can be reordered or hidden; projects can be pinned; simple/advanced mode can be switched at any time.
7. **Fail closed.** When Pandora cannot prove something, say `Not verified yet` instead of guessing.
8. **No accidental power.** Destructive, production, spending, legal/public, regulated, or security-sensitive actions require the correct approval gate.

## 3. Visual direction

- Institutional, premium, calm, and minimal.
- Black and white should dominate both light and dark themes.
- Use the Banatao Systems / Red Apple mark sparingly as the ownership mark, not as decoration everywhere.
- Small semantic accents only: red for critical/blocked, yellow for attention, green for verified/safe, blue for information.
- Avoid a blue-dominant dashboard.
- Use generous spacing, rounded but restrained surfaces, strong typography, and subtle depth.
- No cluttered glassmorphism or excessive gradients.
- Accessibility: high contrast, scalable text, minimum 44px touch targets, meaningful labels, no color-only status communication.

## 4. Navigation

Bottom navigation, maximum five destinations:

1. **Home**
2. **Projects**
3. **Ask Pandora**
4. **Approvals**
5. **More**

`Ask Pandora` is visually prominent and can also be reached from a persistent command bar on Home.

## 5. Home screen

### Header
- Red Apple / Pandora mark.
- Greeting and compact owner identity.
- Connection-health dot: `Connected`, `Degraded`, or `Offline`.

### Main command bar
Prompt text: **“What do you want Pandora to do?”**

Supports normal language such as:
- “Continue Porknyeta.”
- “What is blocking FXPass?”
- “Deploy Battle after the tests pass.”
- “Show me what needs my approval.”
- “Which project should we work on next?”

### Priority card
One highest-value safe next action with:
- project name;
- one-sentence reason;
- action button;
- `Why this?` expandable explanation.

### Owner summary cards
- **Needs your approval**
- **Problems to fix**
- **In progress**
- **Recently verified**

Each card shows a count and only the top few items. `See all` opens the full list.

### Pinned projects
Compact cards with:
- project name;
- current phase;
- status ladder;
- verified completion percentage only when roadmap/task proof supports one;
- one-line blocker or next action.

## 6. Projects screen

Searchable list of all canonical projects.

Filters:
- All
- Active
- Needs approval
- Blocked
- Deployed but not verified
- Production verified

Each project card shows:
- friendly project name;
- purpose in one sentence;
- current phase;
- truthful status ladder;
- completion percentage only if derived from canonical roadmap/task/proof state;
- next action.

## 7. Project detail screen

### Simple view — default
- **What this project is**
- **Where we are now**
- **What is done**
- **What is being worked on**
- **What is blocked**
- **What I need from you**
- **What Pandora will do next**

### Status ladder
Five explicit stages:
1. Documented
2. Implemented
3. Tested
4. Deployed
5. Production verified

The app must never collapse these into a single ambiguous `Done` state.

### Proof drawer
Expandable section containing:
- canonical repo/branch/commit;
- source hash/snapshot;
- tests and review evidence;
- database/auth checks;
- deployment ID and URL;
- production verification evidence;
- rollback target;
- audit event IDs.

### Actions
- `Continue safely`
- `Ask about this project`
- `Show roadmap`
- `Show evidence`
- `Request review`
- `Prepare release`

Actions that cross a protected boundary must route to the approval flow.

## 8. Ask Pandora screen

A chat-style command interface designed for short owner messages.

Default behavior:
- resolve project names and aliases;
- recover canonical state before status answers;
- respond in plain language;
- show the action Pandora plans before a meaningful write;
- execute safe reversible no-cost work automatically when policy allows;
- surface an approval card only when owner action is genuinely required.

Every response that changes project reality should end with a compact expandable status capsule:
- What changed
- Evidence
- Current phase
- Done
- In progress
- Blocked
- Risks
- Next autonomous action

## 9. Approvals screen

Show only actions that genuinely require owner/admin approval.

Each approval card contains:
- **What will happen**
- **Why it is needed**
- **What could go wrong**
- **Rollback / recovery**
- **Affected project and environment**
- **Exact artifact**

Buttons:
- Approve
- Reject
- Ask a question

For AAL2-required actions, show a simple message: **“Extra identity check required for this action.”** Then invoke the existing MFA/TOTP assurance flow. Never expose technical secrets or tokens.

## 10. More screen

Sections:

### Memory
- search Pandora Memory;
- recent canonical decisions;
- open loops/blockers;
- evidence timeline;
- read-first UI, with protected edits only through governed actions.

### Connections
Provider cards for GitHub, Vercel, Supabase, PostHog, Gmail, Google Drive, Resend, Outlook, FlutterFlow, and future adapters.

States:
- Connected
- Degraded
- Disconnected
- Needs permission

Do not call a provider connected unless a current health/read proof exists.

### Audit
Human-readable activity timeline with an `Advanced details` view for hashes and provider IDs.

### Settings
- Light / Dark / System
- Simple / Advanced mode
- Pinned projects
- Home-card order
- Notification preferences
- Security / MFA

## 11. FlutterFlow implementation structure

Recommended reusable components:
- `AppShell`
- `TopStatusBar`
- `PandoraCommandBar`
- `ProjectCard`
- `StatusLadder`
- `PriorityActionCard`
- `ApprovalCard`
- `EvidenceDrawer`
- `ConnectionCard`
- `AuditEventRow`
- `EmptyState`
- `ErrorState`
- `OfflineBanner`

Recommended pages:
- `HomePage`
- `ProjectsPage`
- `ProjectDetailPage`
- `PandoraChatPage`
- `ApprovalsPage`
- `RoadmapPage`
- `EvidencePage`
- `MemoryPage`
- `ConnectionsPage`
- `AuditPage`
- `SettingsPage`
- `SignInPage`
- `MfaChallengePage`

## 12. Data and API boundaries

The FlutterFlow client is a presentation/control surface. It must not contain provider secrets or broad provider credentials.

Use MCPMaster/ProjectOS APIs as the governed backend. The client may read owner-appropriate projections and submit owner intents/approvals, while ProjectOS performs provider actions server-side.

Security requirements:
- authenticated owner session;
- existing Supabase-backed identity where applicable;
- AAL2/TOTP for protected approvals;
- no service-role or provider secret in FlutterFlow;
- tenant/project authorization enforced server-side;
- no private Pandora Memory bodies exposed unless owner-authorized and explicitly intended;
- application logs must redact tokens, credentials, private documents, and sensitive message bodies.

## 13. Offline and degraded behavior

When offline or when Pandora Memory is unreachable:
- show cached non-sensitive project summaries only if freshness is visible;
- disable meaningful writes;
- label status `Last verified <time>`;
- never guess current completion or production state;
- queue no destructive/production actions silently.

## 14. Flexibility requirements

- App shell supports adding future provider/sector modules without redesigning navigation.
- Project aliases are resolved server-side.
- Home cards are driven by configuration, not hardcoded project names.
- Simple/advanced presentation is a view preference over the same canonical data.
- Copy uses a centralized plain-language dictionary so technical wording can be progressively simplified without changing backend contracts.
- Feature flags may hide unfinished modules, but must not falsely label them complete.

## 15. FlutterFlow build sequence

1. Create a new FlutterFlow project named `Pandora`.
2. Establish the design system and light/dark themes.
3. Build the reusable component library.
4. Build static phone-first navigation and all empty/loading/error states.
5. Wire read-only canonical project/status projections first.
6. Wire Ask Pandora intent flow.
7. Wire approval list and AAL2/TOTP challenge.
8. Wire Memory, Connections, Evidence, and Audit read surfaces.
9. Add protected write flows only after server authorization is verified.
10. Validate all FlutterFlow changes before applying them.
11. Test responsive behavior on common Android, iPhone, tablet, and web widths.
12. Verify exact API failures, degraded mode, and wrong-identity denial.
13. Record FlutterFlow project ID, branch/version, exported source hash, test evidence, and rollback/version-history point.
14. Production release remains separately owner-authorized.

## 16. Definition of done for v1

V1 is complete only when:
- the real FlutterFlow project exists and its project ID is recorded;
- all required pages/components render in light and dark mode;
- owner can navigate comfortably on a normal Android phone;
- canonical project state is read from the governed backend;
- status ladder is truthful;
- Ask Pandora can submit owner intent;
- approvals work with AAL2 for protected actions;
- disconnected/degraded states fail closed;
- security/privacy checks pass;
- responsive/mobile verification is recorded;
- FlutterFlow version history/rollback point is recorded;
- exported source snapshot/hash is preserved;
- production is not claimed until live workflow verification passes.

## 17. Current blocker

The ChatGPT `Pandoras-box` connector currently receives HTTP 401 from Vercel Deployment Protection before MCP application authentication runs. This blocks live Pandora Memory retrieval and governed FlutterFlow adapter execution from this session.

The correct repair is machine automation access through Vercel Deployment Protection while preserving application-level MCP/OAuth authentication. Do not make the whole application public just to remove the 401.
