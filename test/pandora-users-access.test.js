import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260820000500_pandora_member_access_control.sql', import.meta.url), 'utf8');
const approvalCompat = fs.readFileSync(new URL('../supabase/migrations/20260820000600_pandora_approval_permission_compat.sql', import.meta.url), 'utf8');
const ownerApi = fs.readFileSync(new URL('../supabase/functions/pandora-owner-api/index.ts', import.meta.url), 'utf8');
const accessApi = fs.readFileSync(new URL('../supabase/functions/pandora-user-access-api/index.ts', import.meta.url), 'utf8');
const mobileConfig = fs.readFileSync(new URL('../apps/pandora-mobile/lib/pandora_config.dart', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../apps/pandora-mobile/lib/features/settings/settings_screen.dart', import.meta.url), 'utf8');

test('fine-grained access schema is fail-closed and preserves history', () => {
  for (const table of ['membership_access_profiles','membership_permissions','membership_project_access','membership_access_audit']) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /memberships_preserve_history[\s\S]*restrictive for delete/i);
  assert.match(migration, /LAST_OWNER_REQUIRED/i);
  assert.match(migration, /access_version[\s\S]*\+ 1/i);
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)[^;]*membership_permissions[^;]*authenticated/i);
});

test('explicit permissions govern high-risk surfaces', () => {
  for (const permission of ['approvals.decide','connections.manage','users.manage','release.production']) {
    assert.match(migration, new RegExp(permission.replace('.', '\\.'), 'i'));
  }
  assert.match(approvalCompat, /pandora_member_has_permission[\s\S]*approvals\.decide/i);
  assert.doesNotMatch(approvalCompat, /auth\.sessions|auth\.aal_level|current_session_id/i);
  assert.match(migration, /projectos_accept_intake[\s\S]*connections\.manage/i);
  assert.match(migration, /projectos_accept_intake[\s\S]*autopilot\.run/i);
});

test('owner API no longer throws a coarse owner-admin gate', () => {
  assert.doesNotMatch(ownerApi, /throw\s+new\s+Error\(["']OWNER_ROLE_REQUIRED["']\)/);
  assert.match(ownerApi, /pandora_authorize_surface/);
  assert.match(ownerApi, /projects\.view/);
  assert.match(ownerApi, /approvals\.decide/);
  assert.match(ownerApi, /connections\.manage/);
  assert.match(ownerApi, /autopilot\.run/);
  assert.match(ownerApi, /requestType[\s\S]*control_change/i);
});

test('user management API stages invites suspended before granting authority', () => {
  assert.match(accessApi, /status:\s*["']suspended["']/i);
  assert.match(accessApi, /pandora_configure_membership_access/);
  assert.match(accessApi, /pandora_revoke_membership_access/);
  assert.match(accessApi, /USER_MANAGEMENT_FORBIDDEN/);
  assert.match(accessApi, /ROOT_PERMISSION_REQUIRES_OWNER/);
  assert.match(accessApi, /\/me/);
});

test('mobile contains no server credential and places Users & access before Account', () => {
  assert.doesNotMatch(
    mobileConfig,
    /String\.fromEnvironment\(\s*["'][^"']*(?:SERVICE[_-]?ROLE|SUPABASE_SERVICE_ROLE_KEY)/i,
  );
  assert.doesNotMatch(mobileConfig, /static const\s+\w*service\w*role\w*\s*=/i);
  assert.match(mobileConfig, /supabasePublishableKey[\s\S]*sb_publishable_/i);
  const users = settings.indexOf("title: 'Users & access'");
  const account = settings.indexOf("title: 'Account'");
  assert.ok(users >= 0, 'Users & access section is missing');
  assert.ok(account > users, 'Users & access must appear above Account');
});
