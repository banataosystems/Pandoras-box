import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function recordedSql(relativePath: string): string {
  return Buffer.from(source(relativePath).replace(/\s/g, ""), "base64").toString(
    "utf8",
  );
}

function assertOrdered(contents: string, ...needles: string[]) {
  let previous = -1;
  for (const needle of needles) {
    const current = contents.indexOf(needle);
    assert.notEqual(current, -1, `missing source fragment: ${needle}`);
    assert.ok(
      current > previous,
      `expected source fragment after prior boundary: ${needle}`,
    );
    previous = current;
  }
}

test("the historical AAL2 approval boundary is explicitly superseded", () => {
  const historicalMigration = recordedSql(
    "../../docs/supabase/recovery/jcyqixttuebxqqfkjonq/recorded-payloads/20260810083416_enforce_aal2_approval_boundary.sql.b64",
  );
  const currentMigration = source(
    "../../supabase/migrations/20260812034825_remove_projectos_approval_aal2.sql",
  );

  assertOrdered(
    historicalMigration,
    "if current_user_id is null then",
    "auth.jwt() ->> 'is_anonymous'",
    "auth.jwt() ->> 'aal'",
    "from auth.sessions s",
    "select *\n    into approval_row",
    "private.has_org_role(",
    "high-risk requests require a different approver",
    "update public.approvals",
  );
  assert.match(historicalMigration, /s\.user_id\s*=\s*current_user_id/);
  assert.match(
    historicalMigration,
    /s\.aal\s*=\s*'aal2'::auth\.aal_level/,
  );
  assert.match(
    historicalMigration,
    /s\.not_after is null or s\.not_after > now\(\)/,
  );

  assert.doesNotMatch(
    currentMigration,
    /auth\.jwt\(\)\s*->>\s*'aal'|auth\.sessions|auth\.aal_level/,
  );
  assertOrdered(
    currentMigration,
    "if current_user_id is null then",
    "auth.jwt() ->> 'is_anonymous'",
    "select *\n    into approval_row",
    "private.has_org_role(",
    "high-risk requests require a different approver",
    "update public.approvals",
    "private.append_audit_event(",
  );
  assert.match(
    currentMigration,
    /array\['owner', 'admin'\]::public\.member_role\[\]/,
  );
});

test("anonymous sessions cannot enter ProjectOS intake", () => {
  const migration = recordedSql(
    "../../docs/supabase/recovery/jcyqixttuebxqqfkjonq/recorded-payloads/20260810083717_reject_anonymous_projectos_intake.sql.b64",
  );

  assertOrdered(
    migration,
    "auth.jwt() ->> 'is_anonymous'",
    "private.is_org_member(p_organization_id)",
    "p_requester_id <> auth.uid()",
    "insert into public.projectos_intake_requests",
  );
  assert.match(
    migration,
    /auth\.role\(\)\s*<>\s*'service_role'[\s\S]*projectos_permanent_account_required/,
  );
});

test("shared organization RLS helpers reject anonymous JWTs", () => {
  const migration = recordedSql(
    "../../docs/supabase/recovery/jcyqixttuebxqqfkjonq/recorded-payloads/20260810104737_reject_anonymous_org_membership_helpers.sql.b64",
  );

  const guards = migration.match(/auth\.jwt\(\) ->> 'is_anonymous'/g) || [];
  assert.equal(guards.length, 2);
  assertOrdered(
    migration,
    "create or replace function private.is_org_member(",
    "auth.jwt() ->> 'is_anonymous'",
    "from public.memberships membership",
    "create or replace function private.has_org_role(",
  );
  const roleHelper = migration.slice(
    migration.indexOf("create or replace function private.has_org_role("),
  );
  assertOrdered(
    roleHelper,
    "auth.jwt() ->> 'is_anonymous'",
    "from public.memberships membership",
    "membership.role = any(allowed_roles)",
  );
});

test("organization creation is RPC-only and rejects anonymous accounts", () => {
  const migration = recordedSql(
    "../../docs/supabase/recovery/jcyqixttuebxqqfkjonq/recorded-payloads/20260810104102_reject_anonymous_organization_creation.sql.b64",
  );

  assertOrdered(
    migration,
    "if current_user_id is null then",
    "auth.jwt() ->> 'is_anonymous'",
    "from auth.users account",
    "insert into public.organizations",
    "insert into public.memberships",
    "private.append_audit_event(",
  );
  assert.match(migration, /account\.is_anonymous/);
  assert.match(
    migration,
    /revoke insert on table public\.organizations from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_organization\(text, text\)[\s\S]*to authenticated, service_role/,
  );
});

test("Owner API preflight bypasses user auth and safety verification uses service role", () => {
  const ownerApi = source(
    "../../supabase/functions/pandora-owner-api/index.ts",
  );

  assertOrdered(
    ownerApi,
    'if (req.method === "OPTIONS") return send(null, 204);',
    "const context = await authenticate(req);",
    "const route = normalizeOwnerRoute(url.pathname);",
  );

  const safetyStart = ownerApi.indexOf("async function safety(");
  const safetyEnd = ownerApi.indexOf("async function acceptIntake(");
  assert.ok(safetyStart >= 0 && safetyEnd > safetyStart);
  const safetySource = ownerApi.slice(safetyStart, safetyEnd);
  assert.match(
    safetySource,
    /const admin = createClient\(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.match(
    safetySource,
    /admin\.rpc\("verify_execution_audit_chain"/,
  );
  assert.doesNotMatch(
    safetySource,
    /context\.client\.rpc\("verify_execution_audit_chain"/,
  );
});

test("Owner API deduplicates retries and sends catalog work through one intake", () => {
  const ownerApi = source(
    "../../supabase/functions/pandora-owner-api/index.ts",
  );
  const intakeStart = ownerApi.indexOf("async function acceptIntake(");
  const intakeEnd = ownerApi.indexOf("async function decide(");
  assert.ok(intakeStart >= 0 && intakeEnd > intakeStart);
  const intakeSource = ownerApi.slice(intakeStart, intakeEnd);
  assertOrdered(
    intakeSource,
    "normalizeIntakeFingerprintPart(operationName)",
    "automaticIntakeWindow(Date.now())",
    'context.client.rpc("projectos_accept_intake"',
  );
  assert.doesNotMatch(intakeSource, /crypto\.randomUUID\(\)/);
  assert.match(ownerApi, /The owner described this outcome:/);
  assert.match(ownerApi, /`action:\$\{actionId\}`/);
});

test("Memory returns bounded summaries without raw record payloads", () => {
  const ownerApi = source(
    "../../supabase/functions/pandora-owner-api/index.ts",
  );
  const memoryStart = ownerApi.indexOf("async function memory(");
  const memoryEnd = ownerApi.indexOf("async function safety(");
  assert.ok(memoryStart >= 0 && memoryEnd > memoryStart);
  const memorySource = ownerApi.slice(memoryStart, memoryEnd);
  assert.match(memorySource, /queryText\.length > 200/);
  assert.match(memorySource, /\.limit\(50\)/);
  assert.match(memorySource, /items: filtered\.slice\(0, limit\)/);
  assert.doesNotMatch(memorySource, /payload_redacted/);
  assert.doesNotMatch(memorySource, /projectos_workspace_documents/);

  const ownerDsl = source(
    "../../automation/flutterflow/dsl/10_owner_api_state_navigation.dart",
  );
  assert.match(ownerDsl, /Endpoint\.post\(\s*'PandoraSearchMemory'/);
  assert.match(ownerDsl, /'\/memory\/search'/);
  assert.doesNotMatch(ownerDsl, /\/memory\?query=<query>/);
});

test("Connection changes remain governed and protected by AAL2", () => {
  const ownerApi = source(
    "../../supabase/functions/pandora-owner-api/index.ts",
  );
  const actionStart = ownerApi.indexOf("async function connectionAction(");
  const actionEnd = ownerApi.indexOf("async function approvals(");
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  const actionSource = ownerApi.slice(actionStart, actionEnd);
  assertOrdered(
    actionSource,
    "connectionActionAllowed(action, item.state)",
    'action !== "test" && context.aal !== "aal2"',
    "return acceptIntake(",
  );
  assert.doesNotMatch(actionSource, /connector_installations"\)\.update/);
  assert.doesNotMatch(actionSource, /connector_installations"\)\.delete/);
});

test("FlutterFlow catalog work submits exactly once from the review screen", () => {
  const selector = source(
    "../../automation/flutterflow/dsl/selector_bindings.dart",
  );
  const builderStart = selector.indexOf("DslWidget _actionBuilderBody(");
  const builderEnd = selector.indexOf("DslWidget _approvalCenterBody(");
  assert.ok(builderStart >= 0 && builderEnd > builderStart);
  const builderSource = selector.slice(builderStart, builderEnd);
  assert.doesNotMatch(builderSource, /ApiCall\(\s*spec\.askEndpoint/);
  assert.match(builderSource, /'requestMessage': State\(spec\.requestMessage\)/);

  const planStart = selector.indexOf("DslWidget _plansExecutionBody(");
  const planEnd = selector.indexOf("DslWidget _activityBody(");
  assert.ok(planStart >= 0 && planEnd > planStart);
  const planSource = selector.slice(planStart, planEnd);
  assert.match(planSource, /ApiCall\(\s*spec\.runEndpoint/);
  assert.match(planSource, /'message': Param\(spec\.planRequestMessage\)/);
  assert.match(planSource, /visible: Not\(State\(spec\.runSubmitting\)\)/);
});

test("FlutterFlow owner controls retain phone-safe wrapping and touch targets", () => {
  const selector = source(
    "../../automation/flutterflow/dsl/selector_bindings.dart",
  );
  assert.match(selector, /Wrap\(\s*name: 'PandoraHomeMetricsWrap'/);
  assert.match(selector, /name: 'ApprovePandoraChangeButton'[\s\S]*height: 48/);
  assert.match(selector, /name: 'RejectPandoraChangeButton'[\s\S]*height: 48/);
  assert.match(selector, /name: 'PandoraMemorySearchButton'[\s\S]*height: 48/);
  assert.match(selector, /name: 'PandoraDisconnectButton'[\s\S]*height: 48/);
});
