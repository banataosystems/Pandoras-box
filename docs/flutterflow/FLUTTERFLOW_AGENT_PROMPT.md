# FlutterFlow Agent Prompt — Pandora Mobile v1

Create a new FlutterFlow app named **Pandora** for the owner of Banatao Systems.

The app is the phone-first control surface for Pandora's-Box / MCPMaster / ProjectOS. It should make a powerful multi-project automation system feel simple to a non-technical owner.

Before changing anything, inspect the active FlutterFlow workspace/project context and use the current typed FlutterFlow project schema. Plan the change, validate it, then apply it with an explicit commit message. Do not guess identifiers that the project can provide.

## Product behavior

Default to plain language. The owner should not need to understand GitHub, Vercel, Supabase, deployments, pull requests, hashes, MCP, or AAL2 to operate the app. Technical evidence must still be available behind expandable detail.

Always preserve the truthful status ladder:

**Documented → Implemented → Tested → Deployed → Production verified**

Never reduce those to one generic `Done` state.

The app must adapt to the owner. It must be flexible, configurable, and optimized for a smartphone. Do not build a dense developer dashboard.

## Visual direction

Make it institutional, premium, calm, and minimal.

- Black and white dominate.
- Support Light, Dark, and System themes.
- Use the Red Apple / Banatao ownership mark sparingly.
- Use only small semantic accents: red critical, yellow attention, green verified, blue information.
- Do not make blue the dominant UI color.
- Use generous spacing, strong typography, restrained rounded cards, large touch targets, and subtle depth.
- No excessive gradients, glass effects, or visual clutter.
- Maintain strong contrast and accessibility.

## Navigation

Use five bottom-navigation destinations:

1. Home
2. Projects
3. Ask Pandora
4. Approvals
5. More

Make **Ask Pandora** prominent.

## Pages to build

### HomePage
Include:
- Pandora/Red Apple header and connection state.
- Large command input: **“What do you want Pandora to do?”**
- One highest-value safe next-action card.
- Cards for `Needs your approval`, `Problems to fix`, `In progress`, and `Recently verified`.
- Configurable pinned-project cards.

### ProjectsPage
Searchable project list with filters for All, Active, Needs approval, Blocked, Deployed not verified, and Production verified.

Each project card shows purpose, current phase, truthful status ladder, proof-backed completion percentage when available, blocker, and next action.

### ProjectDetailPage
Default simple sections:
- What this project is
- Where we are now
- What is done
- What is being worked on
- What is blocked
- What I need from you
- What Pandora will do next

Add the five-stage status ladder and an expandable proof drawer for repo/commit/hash/tests/deployment/production verification/rollback/audit IDs.

Primary actions:
- Continue safely
- Ask about this project
- Show roadmap
- Show evidence
- Request review
- Prepare release

### PandoraChatPage
Chat-like owner command surface for short natural-language messages. Support simple examples such as:
- “Continue Porknyeta.”
- “What is blocking FXPass?”
- “Show me what needs my approval.”
- “Which project should we work on next?”

Messages that change reality should display an expandable result capsule containing What changed, Evidence, Current phase, Done, In progress, Blocked, Risks, and Next autonomous action.

### ApprovalsPage
Only show actions that truly need owner/admin approval. Each card must explain in plain language:
- What will happen
- Why it is needed
- What could go wrong
- Rollback/recovery
- Project/environment
- Exact artifact

Buttons: Approve, Reject, Ask a question.

For high-assurance actions, display **“Extra identity check required for this action.”** and route to MfaChallengePage.

### More area
Create:
- MemoryPage
- ConnectionsPage
- AuditPage
- SettingsPage

ConnectionsPage includes cards for GitHub, Vercel, Supabase, PostHog, Gmail, Google Drive, Resend, Outlook, FlutterFlow, and future adapters. States are Connected, Degraded, Disconnected, Needs permission.

SettingsPage includes Light/Dark/System, Simple/Advanced mode, pinned projects, home-card order, notifications, and Security/MFA.

### Auth pages
Create SignInPage and MfaChallengePage. Do not store service-role keys, provider tokens, or secrets in FlutterFlow client code.

## Reusable components

Build reusable components named:
- AppShell
- TopStatusBar
- PandoraCommandBar
- ProjectCard
- StatusLadder
- PriorityActionCard
- ApprovalCard
- EvidenceDrawer
- ConnectionCard
- AuditEventRow
- EmptyState
- ErrorState
- OfflineBanner

## Data model / placeholders

Until live APIs are bound, use clearly labeled mock data only. Mock data must never be visually presented as live or verified.

Create view models/data structures for:
- ProjectSummary
- ProjectStatusStage
- ProjectEvidence
- PriorityAction
- ApprovalRequest
- ProviderConnection
- AuditEvent
- PandoraMessage

Design them so they can later bind to MCPMaster/ProjectOS owner-safe APIs without redesigning the UI.

## Security and degraded behavior

- The FlutterFlow app is only a client/control surface; provider actions happen server-side.
- Never embed provider secrets or service-role credentials.
- Protected writes must be server-authorized.
- When backend or Pandora Memory is unavailable, show `Degraded` or `Offline`, keep freshness visible, disable meaningful writes, and never guess current state.
- No production, destructive, spending, legal/public, regulated, or sensitive action should occur without its required approval boundary.

## Responsive requirements

Design first for a normal Android phone, then verify iPhone, tablet, and responsive web widths. Keep key actions reachable with one hand and avoid horizontal scrolling.

## Completion for this build pass

For the first build pass, complete the design system, navigation, reusable components, all listed pages, responsive states, loading/empty/error/offline states, and clearly labeled mock-data wiring. Do **not** claim live backend integration until it is separately connected and verified.

After applying the build, report the FlutterFlow project ID, current branch/version, validation result, created pages/components, any warnings, and the version-history point that can be used for rollback.
