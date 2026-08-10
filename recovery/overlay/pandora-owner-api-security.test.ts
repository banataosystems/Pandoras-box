import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
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

test("approval decisions require a permanent current AAL2 session in the database", () => {
  const migration = source(
    "../../supabase/migrations/20260810083500_enforce_aal2_approval_boundary.sql",
  );

  assertOrdered(
    migration,
    "if current_user_id is null then",
    "auth.jwt() ->> 'is_anonymous'",
    "auth.jwt() ->> 'aal'",
    "from auth.sessions s",
    "select *\n    into approval_row",
    "private.has_org_role(",
    "high-risk requests require a different approver",
    "update public.approvals",
  );
  assert.match(migration, /s\.user_id\s*=\s*current_user_id/);
  assert.match(migration, /s\.aal\s*=\s*'aal2'::auth\.aal_level/);
  assert.match(
    migration,
    /s\.not_after is null or s\.not_after > now\(\)/,
  );
});

test("anonymous sessions cannot enter ProjectOS intake", () => {
  const migration = source(
    "../../supabase/migrations/20260810084000_reject_anonymous_projectos_intake.sql",
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
  const migration = source(
    "../../supabase/migrations/20260810112000_reject_anonymous_org_membership_helpers.sql",
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
  const migration = source(
    "../../supabase/migrations/20260810110000_reject_anonymous_organization_creation.sql",
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
