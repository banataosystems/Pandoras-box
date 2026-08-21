
# BOK × Pandora Pilot — Master Roadmap v1.0

**Status:** planning complete; execution not complete.  
**Focused-entry objective:** prove that a non-technical restaurant owner can operate and improve real businesses through Pandora from a phone, while BOK retains an owned customer relationship and measurable unit economics.

## Verified baseline — 2026-08-21

- BOK application data plane: Supabase `zztqshkhoxqbnzmdhlts`, provider name `bok`, `ACTIVE_HEALTHY`, PostgreSQL 17, `ap-northeast-1`.
- Reused the existing Porknyeta project rather than creating duplicate paid infrastructure because it is empty of real users/data and already contains the intended multi-restaurant foundation.
- 15 application tables; all discovered application tables have RLS enabled.
- 11 public application functions; 15 migration-ledger entries; 0 auth users; approximately 0 application rows.
- Existing hierarchy: restaurant group → restaurant → branch.
- Recovery inputs: `bok-porknyeta-v4-ready.zip` SHA-256 `02688871ac4c6ccf96169b073f100631ea7f0d4071689c03199cccc2b973086f`; `bok_os.zip` SHA-256 `65b32a7173a0400bc97bf4d1551977aae574ed0481342bf704882cfc16ec7508`.
- The Flutter archive is a useful UI prototype but contains demonstration data and is not production evidence.

## Product thesis

BOK should not merely receive another restaurant app. BOK should become a design-partner proof that Pandora can turn owner intent into verified business outcomes. Direct ordering is one lever. The deeper value is first-party customer understanding, repeat purchase, operational control, measured contribution economics and the ability to change the system without depending on developers.

Aggregators such as Grab remain valid acquisition/distribution channels. The pilot must measure direct versus aggregator-originated contribution rather than assume either channel is economically superior.

## Program phases

### 0 — Truth, identity and recovery
Reconcile `banataosystems/bok`, Flutter/FlutterFlow source, Vercel, exact BOK Supabase migrations/functions/policies, owner-confirmed business truth and rollback anchors. Exit only with a source/runtime/business-truth graph.

### 1 — Platform foundation hardening
Preserve the existing multi-restaurant schema. Put every migration in canonical source. Prove RLS/tenant isolation, idempotent ordering, server-authoritative pricing, audit lineage, environment separation, replay and rollback.

### 2 — Synthetic preview data
Create deterministic fixtures that are visibly `TEST/PREVIEW`. Tag data provenance as `synthetic`, `owner_confirmed` or `provider_verified`. Demo values can never silently become business truth.

### 3 — Pandora BOK customer workspace
Build one owner-first workspace: Today, Customers, Orders, Menu, Promotions, Insights, Changes, Approvals and Connections. The default view shows outcomes and next actions, not hashes/providers. Technical proof remains in Professional Mode.

### 4 — BOK preview persona
Use a synthetic `BOK Pilot Owner` persona for design. It cannot call operational APIs or mutate live data. The acceptance journey is preview → BOK workspace → ask intent → see proposed action → simulate reversible result → inspect proof → reset.

### 5 — Direct customer experience
Mobile-first menu/PWA; branch selection; owner-confirmed products/modifiers; server-authoritative prices; availability; cart; checkout; pickup and later verified delivery; order tracking; receipt; consent; accessibility and low-bandwidth behavior.

### 6 — Kitchen, staff and branch operations
Branch-scoped roles/devices, activation, kitchen queue, accepted/preparing/ready/completed/cancelled state machine, sold-out controls, delay alerts, safe retries and manager exceptions.

### 7 — Delivery and payment orchestration
Keep BOK as the order/customer system of record while Lalamove/manual/other verified providers remain replaceable fulfillment adapters. Add quote, dispatch, status, delivery proof, payment/reference, refund and reconciliation contracts. Secrets stay in Vault.

### 8 — First-party customer graph, consent and loyalty
Consent-aware identity/contact, transaction history, preferences derived from commerce rather than sensitive profiling, loyalty/rewards ledger, coupons, feedback, export/delete and retention.

### 9 — Customer intelligence and campaigns
New/repeat/lapsed cohorts, consent suppression, audience selection, offer economics, attribution, holdouts where practical and incremental profit. Recommendations must reconcile to underlying data.

### 10 — Pandora owner Command Core
Classify owner intents as Q=query, R=reversible low-risk, B=business-impacting or P=privileged. Examples: change availability, schedule promo, pause ordering, add a branch draft, explain a sales drop, identify delays, summarize today, compare direct vs aggregator economics. Record actor, scope, before/after, plan, confirmation, execution, verification and rollback.

### 11 — Channel economics
Track gross order value, food cost, merchant-funded discounts, packaging, delivery cost/subsidy, platform/service fees, payment fees, refunds, acquisition cost when known, contribution margin and 30/60/90-day repeat. Primary decision metric: 90-day contribution profit per customer/order cohort.

### 12 — Analytics and Pandora recommendations
Direct-order share, AOV, repeat rate, D30/D90 customer retention, contribution/order/customer, campaign incremental profit, prep time, cancellation/refund, stockouts, delivery reliability, owner-command success and time to verified outcome. Recommendations include evidence, confidence and uncertainty.

### 13 — Controlled Pasig pilot
Use one owner-confirmed branch/menu, selected staff/devices, a bounded direct-order window, monitoring, fallback and rollback. Do not call the pilot successful until the real journey and exact release are observed.

### 14 — Quezon City and San Juan expansion
Add one branch/restaurant at a time. Reuse the same platform/tenant model. Generalize only from repeated evidence. Reject custom-code duplication and tenant leakage.

### 15 — Design-partner distribution proof
Measure repeated voluntary Pandora use, requests to add restaurants, referrals and permissioned case-study behavior. Product value—not a favor from a friend—must create distribution.

## Global proof ladder

Every material task follows: **documented → implemented → tested → deployed → production-verified**. A build, migration or READY deployment alone is not completion.

## Program success

The pilot succeeds when BOK can manage and improve restaurant operations from a phone through Pandora; first-party customer value and channel contribution are measurable; normal actions do not require hidden developer rescue; and expansion/referral is caused by experienced business value.
