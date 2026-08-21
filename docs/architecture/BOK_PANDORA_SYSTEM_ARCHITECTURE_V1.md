
# BOK × Pandora — System Architecture & Engineering Blueprint v1.0

## 1. Architectural boundary

Pandora and BOK are deliberately separate systems with a governed bridge.

```text
Owner / BOK Pilot Owner
        │
        ▼
Pandora Mobile — Simple Mode
        │ intent / approval / verified result
        ▼
Pandora / ProjectOS CONTROL PLANE
- identity and project registry
- intent classification and durable plans
- provider/agent routing
- policy, approvals and audit
- exact source/deployment evidence
- rollback and verification
- privacy-safe outcome Memory
        │ governed BOK adapter / least privilege
        ▼
BOK APPLICATION DATA PLANE
Supabase zztqshkhoxqbnzmdhlts
restaurant group → restaurant → branch
        │
        ├─ menu / availability
        ├─ customers / consent / loyalty
        ├─ orders / status / staff
        ├─ promotions / campaign attribution
        ├─ delivery / payment reconciliation
        └─ operational and contribution ledgers
```

Pandora must not become the warehouse for raw BOK customer PII, orders or payment records. It retains project identity, provider references, proof, approved aggregate outcomes and the minimum information necessary to execute a governed task.

## 2. Current BOK data-plane foundation

Verified existing tables: `restaurant_groups`, `restaurant_group_memberships`, `restaurants`, `branches`, `categories`, `products`, `customers`, `orders`, `order_items`, `order_status_events`, `staff_profiles`, `staff_devices`, `staff_device_activations`, `owner_commands`, `audit_events`.

Existing migration history already includes multi-restaurant foundation, restaurant-scoped pickup orders, operational hardening and staff-device activation. This foundation should be evolved, not replaced.

## 3. Required domain model

### Tenant hierarchy
Every operational object that can vary by business must resolve through:
`restaurant_group_id → restaurant_id → branch_id`.

Group-wide entities: memberships, portfolio policies, shared customer identity only if rights/consent justify cross-restaurant use, provider connections and group reporting.

Restaurant entities: brand/menu/categories/products/campaigns and restaurant-level economics.

Branch entities: availability, staff, devices, kitchen queue, inventory signals, delivery origin and local operating hours.

### Customer/consent
Customer PII remains private by default. Add explicit channel permissions, source/provenance, consent timestamps/version, deletion/export status and retention state. No campaign audience may be materialized without consent/suppression checks.

### Commerce
Price and availability are server-authoritative. An order snapshot freezes item name, unit price, modifiers, discounts, tax/fee treatment and fulfillment choice. Material state changes append to an event ledger. Idempotency keys prevent duplicate orders/status/payment/loyalty side effects.

### Loyalty/promotions
Use append-only points/reward ledger entries rather than mutable balances as the only truth. Promotion definitions need scope, validity, audience rule, funding source, usage limit, margin guardrail, attribution and rollback/disable state.

### Delivery/payment
Integrations are adapters, never hard dependencies. BOK order identity remains stable while delivery/payment providers have external references and state machines. Reconciliation records expected vs observed amounts/status and exceptions.

## 4. Authorization model

Roles should be explicit and scoped: group owner/admin, restaurant manager, branch manager, kitchen/staff, analyst/read-only, customer. No role should acquire cross-tenant access merely because the client knows an ID.

Enforcement layers:
1. Supabase Auth identity where authentication is required.
2. RLS on exposed tables.
3. Server-side/RPC authorization for complex writes.
4. ProjectOS authorization before Pandora causes consequential changes.
5. Audit evidence for material writes.

`SECURITY DEFINER` functions must use fixed safe `search_path`, minimum grants, explicit authorization and tests proving unauthorized/cross-tenant callers fail.

## 5. Pandora-to-BOK adapter contract

Pandora should never receive a BOK service-role credential in the mobile client. Secrets remain server-side/Vault. The governed adapter exposes bounded operations such as:

- `bok.health`
- `bok.portfolio.summary`
- `bok.restaurant.summary`
- `bok.orders.list`
- `bok.customers.segment_summary`
- `bok.menu.set_availability`
- `bok.promotion.propose`
- `bok.promotion.activate` (business-impacting gate)
- `bok.channel_economics.summary`

Every mutation accepts project/tenant scope, actor, idempotency key, intended before-state and proof contract. A successful provider response is followed by readback verification.

## 6. Owner command lifecycle

```text
Intent
→ project/context recovery
→ task/risk classification Q/R/B/P
→ retrieve exact BOK state
→ proposed owner-readable outcome
→ durable ProjectOS plan
→ approval if required
→ one-time execution
→ exact post-state readback
→ business/proof checks
→ owner-readable result
→ privacy-safe outcome record
→ rollback path retained
```

If execution is ambiguous, assume the side effect may have occurred once, read actual state, and never retry blindly.

## 7. Preview/test architecture

The first `BOK Pilot Owner` experience is a sealed local fixture inside Pandora Mobile. It makes no network calls, carries a persistent TEST/PREVIEW label and cannot mutate BOK. This enables rapid UX work without creating fake production business truth or bypassing auth.

Later, when a connected preview backend is necessary, use a designated non-production surface or resettable synthetic tenant. Credentials never enter source, Memory or chat. Preview records must be tagged and impossible to mix into live contribution reports.

## 8. Environment model

Minimum environments:
- local/unit fixtures;
- sealed Pandora BOK UI preview;
- BOK integration/staging surface when justified;
- production BOK.

Do not add a paid Supabase branch simply to satisfy architecture aesthetics. Use measured need and explicit cost approval. Production promotion requires exact source, migrations, security tests, deployment identity and rollback.

## 9. Event and audit design

Append-only material events should cover order transitions, payment/reconciliation changes, delivery transitions, loyalty/reward entries, campaign activation, owner commands, privileged configuration and destructive/admin actions.

Audit entries include actor, role, tenant scope, request/plan ID, idempotency key, before/after reference, timestamp, source/runtime identity and verification result. Sensitive payloads are referenced/redacted rather than copied into general telemetry.

## 10. Analytics and economics boundary

Operational DB remains authoritative. Derived analytics are rebuildable. Pandora/PostHog may receive allowlisted aggregates and outcome events, never raw customer/contact/payment payloads by default.

Core business calculations must be reproducible from ledgers:
- contribution/order;
- contribution/customer;
- direct vs aggregator-originated cohort contribution;
- repeat rate and D30/D90 retention;
- campaign incremental contribution;
- prep/cancel/refund/stockout/delivery reliability.

## 11. Engineering verification matrix

Database: migration replay, source/runtime parity, RLS cross-tenant denial, authorization, concurrency, idempotency, rollback.

API/contracts: schema validation, unknown-field rejection, stale-state conflict, duplicate replay, auth expiry, provider timeout/502 and redaction.

Customer mobile/web: low bandwidth, accessibility, checkout totals, retry/resume, order status, consent.

Staff: device activation, branch isolation, kitchen transitions, duplicate taps, offline/reconnect and manager exceptions.

Pandora owner: intent classification, preview safety, proposal/approval, verified result, rollback, Professional Mode proof.

Security/privacy: secret scanning, PII allowlist, injection/poisoned evidence, tenant isolation, data export/delete and retention.

## 12. Release gates

No production claim until exact source/head, migration parity, automated tests, real-device/viewport journeys, independent review for sensitive changes, exact deployment identity, rollback exercise and production observation are present.

## 13. Scale path

Start with one controlled Pasig branch. Add Quezon City and San Juan only after the first workflow is reliable. Keep one BOK data plane while isolation/economics support it. Split infrastructure only when measured security, compliance, scale, geography or customer-contract requirements justify the cost/complexity.
