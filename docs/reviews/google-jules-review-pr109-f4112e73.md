# Independent Google Jules External Security & Compliance Review

**Target Pull Request:** banataosystems/Pandoras-box#109
**Target URL:** https://github.com/banataosystems/Pandoras-box/pull/109
**Base Branch:** main
**Base Commit:** 5a630893f2102064dcb2c7c72a3374042e6b4542
**Head Commit:** f4112e737428e7582f11a76d44fea6ea224594ad
**Target Tree SHA:** 53ca80c4547b7705b1ad158d7ff0217fd35cae40
**Head Provenance:** Unsigned (`verification.verified=false`, reason unsigned)
**Reviewer Identity:** Google Jules / google-labs-jules[bot]
**Review Date:** 2026-08-21

---

## Executive Summary

This independent external review report assesses candidate PR **banataosystems/Pandoras-box#109** at head commit `f4112e737428e7582f11a76d44fea6ea224594ad` (3 commits ahead of base `main` at `5a630893f2102064dcb2c7c72a3374042e6b4542`).

This task snapshot is evidence-complete and supersedes issue #108 / PR #112 for release-review evidence.

The candidate PR contains changes across four exact paths:
1. `src/projectos-mcp-handler.js` — blob SHA `a86e91375dac83e29791121fc19f2917622b4907`
2. `test/projectos-mcp-request-accessor.test.js` — blob SHA `959214a394afc5e10c72843411fb009cc01b2816`
3. `test/projectos-legacy-tool-dispatch.test.js` — blob SHA `55a3d5f8b8c94672d13986b3c50ee2deb792724d`
4. `.github/workflows/projectos-security.yml` — blob SHA `e3ef3226a107de8401dadb831d7fb4798cb20a60`

The changes address two core defects in ProjectOS:
- **DEP0169 Request Accessor Enumeration:** Prevents unintended enumeration of Vercel/Express getter-backed request properties during authenticated actor lookup by constructing an explicit `{ headers: { authorization } }` options object for `actorFor()`.
- **MCP Response Envelope Normalization:** Ensures MCP tool result responses enclose non-object array return values in `{ items: value }` envelopes and primitive/null values in `{ value: value ?? null }` envelopes while preserving raw JSON text formatting.

The security workflow is evaluated as fail-closed for code PRs and non-recursive for report PRs under `docs/reviews/*.md`.

---

## 1. Scope & Exact Blob Identity

| File Path | Blob SHA | Assessment Summary |
| :--- | :--- | :--- |
| `src/projectos-mcp-handler.js` | `a86e91375dac83e29791121fc19f2917622b4907` | Fixed `actorFor` call in authenticated handler to pass isolated headers object (`{ headers: { authorization } }`). Implemented `structuredToolContent` wrapper function for structured MCP tool responses. |
| `test/projectos-mcp-request-accessor.test.js` | `959214a394afc5e10c72843411fb009cc01b2816` | Added unit test verifying authenticated MCP handler calls do not enumerate accessor-backed request properties. |
| `test/projectos-legacy-tool-dispatch.test.js` | `55a3d5f8b8c94672d13986b3c50ee2deb792724d` | Added unit test suite verifying structured tool content envelopes array, string, and null tool outputs while maintaining valid JSON string bodies. |
| `.github/workflows/projectos-security.yml` | `e3ef3226a107de8401dadb831d7fb4798cb20a60` | Configured security regression pipeline with job permissions (`contents: read`, `issues: read`, `pull-requests: read`), ephemeral token execution, fail-closed external review gate, and single-file report PR exemption. |

---

## 2. Evaluation of Key Technical Repairs

### 2.1 DEP0169 Request Accessor Protection
- **Problem:** In previous versions, calling `actorFor({ ...request, headers: { ...request.headers, authorization } }, dependencies)` allowed Vercel serverless / Express request getter properties (such as `query` and `url`) to be evaluated/enumerated during request handling, triggering DEP0169 deprecation warnings and potential state leaks.
- **Repair Analysis:** `src/projectos-mcp-handler.js` now calls `actorFor({ headers: { authorization } }, dependencies)`. This restricts `actorFor` strictly to the required `authorization` header without passing the request object or invoking accessor getters.
- **Verification:** `test/projectos-mcp-request-accessor.test.js` traps query and URL getter access on simulated requests and asserts `queryReads: 0` and `urlGetterReads: 0` during authenticated calls.

### 2.2 MCP Structured Content Envelope Normalization
- **Problem:** Provider tools returning top-level arrays (e.g. `github_list_pull_requests`) returned raw lists in `structuredContent`, causing schema validation failures in downstream consumers (e.g. Pydantic validation error `Input should be a valid dictionary, with raw input_value a list`).
- **Repair Analysis:** `structuredToolContent(value)` in `src/projectos-mcp-handler.js` checks:
  - Non-array objects remain unchanged (`value`).
  - Arrays are wrapped in `{ items: value }`.
  - Primitives and `null` are wrapped in `{ value: value ?? null }`.
  - The raw JSON text string in `content[0].text` remains untouched.
- **Verification:** `test/projectos-legacy-tool-dispatch.test.js` tests array, string, and `null` returns, verifying `structuredContent` structure and ensuring `content[0].text` remains verbatim JSON.

### 2.3 CI & External Review Workflow Security
- **Permissions:** The `.github/workflows/projectos-security.yml` workflow explicitly defines minimal job permissions: `contents: read`, `issues: read`, `pull-requests: read`.
- **Token Usage:** The workflow uses only the ephemeral `github.token` (`GH_TOKEN`); no custom long-lived secrets are exposed or required.
- **Fail-Closed Enforcement:** Code PRs fail closed unless a trusted Google Jules report PR exists and passes validation.
- **Report Exemption:** PRs modifying exactly one file matching `docs/reviews/*.md` are exempted from self-referential review loop requirements to prevent recursive dependency deadlocks.

---

## 3. Hosted CI & Environment Evidence

### 3.1 GitHub Actions Run Evidence
- **GitHub Actions Run ID:** `32461241370` (ProjectOS security regression, exact head `f4112e737428e7582f11a76d44fea6ea224594ad`).
- **Node 24 Job (`96708437736`):** **SUCCESS**
  - Checkout confirmed at head `f4112e737428e7582f11a76d44fea6ea224594ad`.
  - Browser tests: 17/17 passed.
  - Mirrors: 29/29 passed.
  - Supabase Edge: 3/3 passed.
  - PGlite replay: 58 migrations executed.
  - Full test suite: 192/192 tests passed across 26 test files.
  - Audit: 0 production vulnerability findings.
- **External-Review Job (`96708437401`):** Expected initial **FAILURE** with `latest trusted Jules report link is missing`. This initial failure is expected prior to the publication and linking of this report PR.

### 3.2 Non-Production Preview Deployment Evidence
- **Vercel Preview Deployment:** `dpl_C6fnTdw89CoLH8aiRasTmPSHA5LG`
- **Deployment State:** `READY`
- **Source Head:** `f4112e737428e7582f11a76d44fea6ea224594ad`
- **Endpoints Verified:**
  - `/api/health`: HTTP 200 OK
  - Protected Resource Metadata: HTTP 200 OK
  - Unauthenticated `/api/mcp`: HTTP 401 Unauthorized with expected WWW-Authenticate challenge.

### 3.3 Production Incident & Paired-Read Evidence
- **Current Production Deployment:** `dpl_PYMqTCGvTTifqwzs8q6PXZTGGwyn` at `main` (`5a630893f2102064dcb2c7c72a3374042e6b4542`).
- **Paired Authenticated Production Read (2026-08-21T08:11Z):**
  - `github_get_repository`: Succeeded (`isError=false`, object `structuredContent`).
  - `github_list_pull_requests`: Failed (`isError=true`) with exact Pydantic error: `structuredContent Input should be a valid dictionary, with raw input_value a list`.
  - *Note:* This paired read isolates the array envelope bug directly on production. Unrelated 500 status codes on production must not be misattributed to this defect.
- **Production Status Context:** 680×200, 76×202, 51×500, 21×401, 9×502, 2×503.
- **DEP0169 Incident Group:** Count 6, last observed 2026-08-21T07:46:07Z.

---

## 4. Residual Release Blockers & Rollback Policy

### 4.1 Residual Release Blocker
- **Authenticated Preview OAuth Grant:** An authenticated preview OAuth grant was unavailable at review time. Therefore, end-to-end authenticated preview smoke proof (object result, array result, and request accessor behavior on the preview deployment) could not be live-executed.
- **Status:** **RELEASE BLOCKER**. This must be disclosed as a release blocker and verified prior to production deployment authorization.

### 4.2 Rollback Plan
- Should any regression occur upon deployment, production must immediately roll back to deployment `dpl_PYMqTCGvTTifqwzs8q6PXZTGGwyn` (or commit `5a630893f2102064dcb2c7c72a3374042e6b4542`).

---

## 5. Review Verdict

All inspected code changes, unit tests, and security workflow definitions on candidate head `f4112e737428e7582f11a76d44fea6ea224594ad` meet safety, correctness, and architectural requirements.

projectos-verdict: pass
