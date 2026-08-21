# Independent Review Report: PR #90 (Phase 0 owner intake repair)

## Metadata

- **Target:** `banataosystems/Pandoras-box#90`
- **Branch:** `fix/phase0-owner-intake-source-20260821`
- **Reviewed Head:** `b7ff881143a61fc0cf6a5bfc74494e558d4b1060`
- **Reviewed Tree:** `d14aac95b37b14dafe003adbe8d63fc035892600`
- **Parent/Base:** `6274bab09b9452c69d6b3d1ffdaebed4b80fd142`
- **Builder Vendor:** OpenAI
- **Reviewer Vendor:** Google
- **Reviewer:** Google Jules / Gemini
- **Review Time:** `2026-08-21T00:25:00Z`

---

## Executive Summary

PR #90 addresses a physical failure observed during an Android Owner Test over mobile data accessing hosted `pandora-owner-api@4`. While authentication, membership checks, rate limiting, and activity reads succeeded, invoking `POST /ask` failed because the Edge Function called stored procedure `public.projectos_accept_intake` passing `p_source: "flutterflow_owner_app"`. The underlying PostgreSQL table `public.projectos_intake_requests` enforces constraint `projectos_intake_requests_source_check`, which allows only: `'operator'`, `'chatgpt'`, `'github'`, `'slack'`, `'email'`, `'api'`, `'system'`.

PR #90 fixes this defect by updating `supabase/functions/pandora-owner-api/index.ts` to pass `p_source: "api"` and adding a unit test in `test/pandora-owner-api-intake-source.test.js` to enforce that `pandora-owner-api` uses the canonical source `"api"` and does not reintroduce `"flutterflow_owner_app"`.

The exact source SHA-256 hashes for the target commit `b7ff881143a61fc0cf6a5bfc74494e558d4b1060` are:
- `supabase/functions/pandora-owner-api/index.ts`: `9ef31eb978fc957740937e77172bfa06ad103fe8d8da976f27d24758e253fa9b`
- `test/pandora-owner-api-intake-source.test.js`: `1ab2159d3a5900f93b11328221ef6365cbe469e5e323f72d16d3c95205960035`

---

## Evidence Checked

1. **Git Commit & Tree Integrity:** Verified commit `b7ff881143a61fc0cf6a5bfc74494e558d4b1060` and tree `d14aac95b37b14dafe003adbe8d63fc035892600` against base `6274bab09b9452c69d6b3d1ffdaebed4b80fd142`.
2. **Diff Inspection:** Confirmed exactly two files differ between base and head.
3. **Database Schema & Constraints:** Verified `public.projectos_intake_requests` table definition in `supabase/migrations/20260731092908_projectos_operating_kernel.sql` line 125:
   `source text not null default 'operator' check (source in ('operator','chatgpt','github','slack','email','api','system'))`.
4. **RPC Contract Verification:** Verified `public.projectos_accept_intake` procedure definition in `supabase/migrations/20260731093257_projectos_operating_functions.sql` and `20260810083717_reject_anonymous_projectos_intake.sql`.
5. **Local Test Execution:** Executed `node --test test/pandora-owner-api-intake-source.test.js` and confirmed test passes 100%.

---

## Analysis of Review Questions

1. **Semantic and Security Correctness of `api` Source:**
   - **Result:** Correct. `pandora-owner-api` is the Edge Function layer serving HTTP API requests for the owner mobile app. Mapping its intake calls to the existing canonical ProjectOS source `"api"` accurately reflects the entry transport without expanding the database constraint surface.

2. **Preservation of Fail-Closed Boundary:**
   - **Result:** Correct. Leaving `projectos_intake_requests_source_check` unchanged preserves the existing database-enforced whitelist check constraint (`SQLSTATE 23514`). Unrecognized sources continue to fail closed at the database boundary.

3. **Impact on Security & System Guarantees:**
   - **Tenant/Org Authorization:** Unchanged. `authenticate()` inside `pandora-owner-api` validates JWT bearer tokens, active organization membership, and owner/admin role. `projectos_accept_intake` checks org membership (`private.is_org_member(p_organization_id)`).
   - **Requester Identity:** Unchanged. `p_requester_id` continues to be passed as `context.userId` (enforced to match `auth.uid()`).
   - **Idempotency:** Unchanged. Derived via `sha256Hex(organizationId:userId:actionKey)` and enforced by database unique constraint `unique (organization_id, idempotency_key)`.
   - **Rate Limits & Approval Separation:** Unchanged.
   - **Audit Attribution:** Preserved. `p_source: "api"` accurately attributes intake requests to the API surface.

4. **Source-Dependent Downstream Policy:**
   - **Result:** No regression. Codebase inspection confirmed that no downstream triggers, policies, or functions branch specifically on `p_source = 'flutterflow_owner_app'`.

5. **Test Sufficiency:**
   - **Result:** Sufficient. `test/pandora-owner-api-intake-source.test.js` regex-asserts that `index.ts` uses `"api"`, matches allowed intake sources, and explicitly rejects `"flutterflow_owner_app"`.

6. **Blocker Analysis:**
   - **Result:** No blockers found across security, privacy, correctness, compatibility, migration, or rollback.

7. **Rollback Operational Safety:**
   - **Result:** Operational safety assured. Reverting to hosted `pandora-owner-api@4` requires no database rollback because database migrations were untouched.

---

## Findings by Severity

- **Critical:** None
- **High:** None
- **Medium:** None
- **Low / Non-blocking:** None

---

## Limitations

- Live Supabase deployment was not triggered as part of this code review in accordance with strict review instructions (no modification of production state, database constraints, or secrets).

---

## Rollback Assessment

If deployment of `pandora-owner-api` with `p_source: "api"` fails acceptance, rolling back to head `6274bab09b9452c69d6b3d1ffdaebed4b80fd142` or `pandora-owner-api@4` is safe and instant. Because no schema or database migrations were introduced or modified in PR #90, no database migration rollback is needed.

---

## Verdict Rationale

PR #90 solves the intake rejection error (`SQLSTATE 23514`) cleanly and safely by aligning the Edge Function `pandora-owner-api` with the established ProjectOS intake contract source (`"api"`). The fix is minimal, elegant, covered by a regression test, and free of security or operational side-effects.

projectos-verdict: pass
