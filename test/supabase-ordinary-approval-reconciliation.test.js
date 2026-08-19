const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const ownerApi = readFileSync(
  join(root, "supabase/functions/pandora-owner-api/index.ts"),
  "utf8",
);
const historicalApprovalMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260812034825_remove_projectos_approval_aal2.sql",
  ),
  "utf8",
);
const accessMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260820000500_pandora_member_access_control.sql",
  ),
  "utf8",
);
const approvalCompat = readFileSync(
  join(
    root,
    "supabase/migrations/20260820000600_pandora_approval_permission_compat.sql",
  ),
  "utf8",
);

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("owner API ordinary approval has no AAL2 step-up and reports it accurately", () => {
  const decide = between(ownerApi, "async function decide(", "\nDeno.serve(");
  assert.doesNotMatch(decide, /context\.aal|aal2|AAL2_REQUIRED/i);
  assert.match(decide, /context\.isAnonymous/);
  assert.match(decide, /rpc\("decide_approval"/);
  assert.match(ownerApi, /mfaRequiredForApproval:\s*false/);
  assert.doesNotMatch(ownerApi, /currentAssuranceLevel/);
  const approvalSummary = between(
    ownerApi,
    "function approvalSummary(",
    "\nasync function home(",
  );
  assert.match(approvalSummary, /extraIdentityCheckRequired:\s*false/);
});

test("owner API keeps authenticated active-organization membership and explicit surface authorization", () => {
  const authenticate = between(
    ownerApi,
    "async function authenticate(",
    "\nasync function enforceRateLimit(",
  );
  assert.match(authenticate, /Bearer\\s\+\\S\+/);
  assert.match(authenticate, /client\.auth\.getUser\(\)/);
  assert.match(authenticate, /\.from\("memberships"\)/);
  assert.match(authenticate, /\.eq\("status",\s*"active"\)/);
  assert.doesNotMatch(authenticate, /new Set\(\["owner",\s*"admin"\]\)/);

  const authorization = between(
    ownerApi,
    "async function hasSurfacePermission(",
    "\nfunction projectSummary(",
  );
  assert.match(authorization, /rpc\("pandora_authorize_surface"/);
  assert.match(authorization, /PERMISSION_REQUIRED/);
  assert.match(ownerApi, /requireSurfacePermission\(context, "approvals\.decide"\)/);
  assert.match(ownerApi, /requireSurfacePermission\(context, "connections\.manage"\)/);
  assert.match(ownerApi, /requireSurfacePermission\(context, "autopilot\.run"\)/);
});

test("owner API retains independent AAL2 gates for connection and destructive actions", () => {
  const connectionAction = between(
    ownerApi,
    "async function connectionAction(",
    "\nasync function approvals(",
  );
  assert.match(
    connectionAction,
    /action !== "test" && context\.aal !== "aal2"/,
  );
  assert.match(
    ownerApi,
    /action\.risk === "CRITICAL"[\s\S]*context\.aal !== "aal2"/,
  );
});

test("historical AAL1 migration preserved owner-admin approval before fine-grained authorization", () => {
  assert.doesNotMatch(historicalApprovalMigration, /auth\.jwt\(\)\s*->>\s*'aal'/);
  assert.doesNotMatch(historicalApprovalMigration, /auth\.sessions|auth\.aal_level|aal2 required/i);
  assert.match(historicalApprovalMigration, /current_user_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(historicalApprovalMigration, /is_anonymous/);
  assert.match(
    historicalApprovalMigration,
    /array\['owner', 'admin'\]::public\.member_role\[\]/,
  );
  assert.doesNotMatch(historicalApprovalMigration, /array\[[^\]]*'operator'/);
});

test("final database approval authorization is explicit permission based and retains durable guards", () => {
  assert.doesNotMatch(approvalCompat, /auth\.sessions|auth\.aal_level|aal2 required/i);
  assert.match(approvalCompat, /current_user_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(approvalCompat, /is_anonymous/);
  assert.match(
    approvalCompat,
    /private\.pandora_member_has_permission\([\s\S]*'approvals\.decide'/,
  );
  assert.doesNotMatch(
    approvalCompat,
    /array\['owner',\s*'admin'\]::public\.member_role\[\]/,
  );
  assert.match(accessMigration, /when p_role = 'owner'::public\.member_role then true/);
  assert.match(
    accessMigration,
    /when p_role = 'admin'::public\.member_role then p_permission_key in \([\s\S]*'approvals\.decide'/,
  );
  assert.match(approvalCompat, /for update/);
  assert.match(approvalCompat, /decision <> 'pending'/);
  assert.match(approvalCompat, /expires_at <= timezone\('utc', now\(\)\)/);
  assert.match(approvalCompat, /assigned_to <> current_user_id/);
  assert.match(approvalCompat, /step_risk in \('R3'.*'R4'/s);
  assert.match(approvalCompat, /requested_by = current_user_id/);
  assert.match(approvalCompat, /decision_by = current_user_id/);
  assert.match(approvalCompat, /private\.append_audit_event/);
  assert.match(approvalCompat, /'action_hash', approval_row\.action_hash/);
});

test("final database approval function remains unavailable to public and anonymous roles", () => {
  assert.match(
    approvalCompat,
    /revoke execute on function public\.decide_approval\([\s\S]*\) from public, anon;/,
  );
  assert.match(
    approvalCompat,
    /grant execute on function public\.decide_approval\([\s\S]*\) to authenticated, service_role;/,
  );
});
