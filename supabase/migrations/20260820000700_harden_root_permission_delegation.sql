-- Pandora Users & access — harden delegation of root authority.
--
-- The base access migration makes membership mutation service-role-only and
-- checks users.manage, but a non-owner user manager could otherwise assign a
-- role-template admin and thereby grant users.manage indirectly without
-- placing that permission in p_permissions. Preserve the original audited
-- mutation implementation as a private core and put an explicit privilege-
-- increase gate in front of every public service-role mutation call.

alter function public.pandora_configure_membership_access(
  uuid, uuid, uuid, text, text, text, text, text[], uuid[]
) rename to pandora_configure_membership_access_core;

alter function public.pandora_configure_membership_access_core(
  uuid, uuid, uuid, text, text, text, text, text[], uuid[]
) set schema private;

revoke all on function private.pandora_configure_membership_access_core(
  uuid, uuid, uuid, text, text, text, text, text[], uuid[]
) from public, anon, authenticated, service_role;

create or replace function public.pandora_configure_membership_access(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_role text,
  p_status text,
  p_access_mode text,
  p_project_scope text,
  p_permissions text[] default '{}'::text[],
  p_project_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.member_role;
  v_target_had_user_manage boolean := false;
  v_target_had_release boolean := false;
  v_target_will_user_manage boolean := false;
  v_target_will_release boolean := false;
begin
  select m.role
    into v_actor_role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = p_actor_user_id
    and m.status = 'active'::public.membership_status;

  if v_actor_role is null
     or not private.pandora_member_permission_base_for_user(
       p_organization_id,
       p_actor_user_id,
       'users.manage'
     ) then
    raise exception 'USER_MANAGEMENT_FORBIDDEN' using errcode = '42501';
  end if;

  -- Current authority is evaluated from the active target identity. Suspended
  -- or revoked identities therefore cannot have root authority silently
  -- reactivated by a non-owner.
  v_target_had_user_manage := private.pandora_member_permission_base_for_user(
    p_organization_id,
    p_target_user_id,
    'users.manage'
  );
  v_target_had_release := private.pandora_member_permission_base_for_user(
    p_organization_id,
    p_target_user_id,
    'release.production'
  );

  if p_role = 'owner' then
    v_target_will_user_manage := true;
    v_target_will_release := true;
  elsif p_access_mode = 'custom' then
    v_target_will_user_manage :=
      'users.manage' = any(coalesce(p_permissions, '{}'::text[]));
    v_target_will_release :=
      'release.production' = any(coalesce(p_permissions, '{}'::text[]));
  elsif p_access_mode = 'role'
        and p_role in ('admin', 'operator', 'member', 'viewer') then
    v_target_will_user_manage := private.pandora_role_permission_default(
      p_role::public.member_role,
      'users.manage'
    );
    v_target_will_release := private.pandora_role_permission_default(
      p_role::public.member_role,
      'release.production'
    );
  end if;

  -- Non-owners may administer ordinary access, but they may not create a new
  -- user-management or production-release authority path. Existing active root
  -- authority can be preserved while editing unrelated settings; increasing
  -- root authority requires an owner.
  if v_actor_role <> 'owner'::public.member_role and (
    (v_target_will_user_manage and not v_target_had_user_manage)
    or (v_target_will_release and not v_target_had_release)
  ) then
    raise exception 'ROOT_PERMISSION_REQUIRES_OWNER' using errcode = '42501';
  end if;

  return private.pandora_configure_membership_access_core(
    p_organization_id,
    p_target_user_id,
    p_actor_user_id,
    p_role,
    p_status,
    p_access_mode,
    p_project_scope,
    p_permissions,
    p_project_ids
  );
end;
$$;

comment on function public.pandora_configure_membership_access(
  uuid, uuid, uuid, text, text, text, text, text[], uuid[]
) is 'Audited membership-access mutation. A users.manage actor may administer ordinary access, but only an owner may create new users.manage or release.production authority, including authority inherited through a role template.';

revoke all on function public.pandora_configure_membership_access(
  uuid, uuid, uuid, text, text, text, text, text[], uuid[]
) from public, anon, authenticated;
grant execute on function public.pandora_configure_membership_access(
  uuid, uuid, uuid, text, text, text, text, text[], uuid[]
) to service_role;
