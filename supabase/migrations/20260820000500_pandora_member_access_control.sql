-- Pandora Mobile — first-class Users & access authorization.
--
-- Roles remain the coarse organization identity boundary. This layer adds
-- explicit role/custom permissions, selected-project scope, restrictive RLS,
-- anti-lockout owner protection, audited access mutations, and permission-aware
-- ProjectOS intake/approval RPCs. Operational removal is revocation so history
-- remains durable. This intentionally does not reintroduce AAL2/TOTP/MFA.

create schema if not exists private;

create table public.membership_access_profiles (
  organization_id uuid not null,
  user_id uuid not null,
  access_mode text not null default 'role'
    check (access_mode in ('role', 'custom')),
  project_scope text not null default 'all'
    check (project_scope in ('all', 'selected', 'none')),
  access_version bigint not null default 1 check (access_version > 0),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.memberships(organization_id, user_id)
    on delete cascade
);

create table public.membership_permissions (
  organization_id uuid not null,
  user_id uuid not null,
  permission_key text not null check (permission_key in (
    'projects.view',
    'projects.edit',
    'approvals.view',
    'approvals.decide',
    'activity.view',
    'intelligence.view',
    'autopilot.view',
    'autopilot.run',
    'release_center.view',
    'release.production',
    'connections.view',
    'connections.manage',
    'safety.view',
    'memory.view',
    'diagnostics.view',
    'users.manage'
  )),
  allowed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id, permission_key),
  foreign key (organization_id, user_id)
    references public.memberships(organization_id, user_id)
    on delete cascade
);

create table public.membership_project_access (
  organization_id uuid not null,
  user_id uuid not null,
  project_id uuid not null references public.projectos_projects(id) on delete cascade,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id, project_id),
  foreign key (organization_id, user_id)
    references public.memberships(organization_id, user_id)
    on delete cascade
);

create table public.membership_access_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_user_id uuid not null references auth.users(id),
  actor_user_id uuid references auth.users(id),
  event_type text not null check (
    event_type in ('configured', 'suspended', 'reactivated', 'revoked')
  ),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index membership_access_profiles_org_mode_idx
  on public.membership_access_profiles(organization_id, access_mode, project_scope);
create index membership_permissions_lookup_idx
  on public.membership_permissions(organization_id, user_id, permission_key, allowed);
create index membership_project_access_lookup_idx
  on public.membership_project_access(
    organization_id, user_id, project_id, can_view, can_edit
  );
create index membership_access_audit_target_idx
  on public.membership_access_audit(
    organization_id, target_user_id, created_at desc
  );

alter table public.membership_access_profiles enable row level security;
alter table public.membership_permissions enable row level security;
alter table public.membership_project_access enable row level security;
alter table public.membership_access_audit enable row level security;

create or replace function private.pandora_role_permission_default(
  p_role public.member_role,
  p_permission_key text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'owner'::public.member_role then true
    when p_role = 'admin'::public.member_role then p_permission_key in (
      'projects.view', 'projects.edit',
      'approvals.view', 'approvals.decide',
      'activity.view', 'intelligence.view',
      'autopilot.view', 'autopilot.run',
      'release_center.view',
      'connections.view', 'connections.manage',
      'safety.view', 'memory.view', 'diagnostics.view', 'users.manage'
    )
    when p_role = 'operator'::public.member_role then p_permission_key in (
      'projects.view', 'projects.edit',
      'approvals.view', 'activity.view', 'intelligence.view',
      'autopilot.view', 'autopilot.run', 'release_center.view',
      'connections.view', 'safety.view', 'memory.view'
    )
    when p_role = 'member'::public.member_role then p_permission_key in (
      'projects.view', 'projects.edit', 'activity.view',
      'intelligence.view', 'memory.view'
    )
    when p_role = 'viewer'::public.member_role then p_permission_key in (
      'projects.view', 'activity.view', 'intelligence.view'
    )
    else false
  end;
$$;

create or replace function private.pandora_member_permission_base_for_user(
  p_organization_id uuid,
  p_user_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_access_mode text;
  v_allowed boolean;
begin
  if p_organization_id is null or p_user_id is null or p_permission_key is null then
    return false;
  end if;

  select m.role, coalesce(ap.access_mode, 'role')
    into v_role, v_access_mode
  from public.memberships m
  left join public.membership_access_profiles ap
    on ap.organization_id = m.organization_id
   and ap.user_id = m.user_id
  where m.organization_id = p_organization_id
    and m.user_id = p_user_id
    and m.status = 'active'::public.membership_status
  limit 1;

  if not found then
    return false;
  end if;

  -- Owner is the anti-lockout root authority. Lower roles may be narrowed by
  -- Custom access, but the organization cannot be stranded without a root.
  if v_role = 'owner'::public.member_role then
    return true;
  end if;

  if v_access_mode = 'custom' then
    select coalesce(mp.allowed, false)
      into v_allowed
    from public.membership_permissions mp
    where mp.organization_id = p_organization_id
      and mp.user_id = p_user_id
      and mp.permission_key = p_permission_key;
    return coalesce(v_allowed, false);
  end if;

  return private.pandora_role_permission_default(v_role, p_permission_key);
end;
$$;

create or replace function private.pandora_member_permission_base(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pandora_member_permission_base_for_user(
    p_organization_id,
    (select auth.uid()),
    p_permission_key
  );
$$;

create or replace function private.pandora_member_has_permission_for_user(
  p_organization_id uuid,
  p_user_id uuid,
  p_permission_key text,
  p_project_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text;
  v_project_sensitive boolean;
begin
  if not private.pandora_member_permission_base_for_user(
    p_organization_id,
    p_user_id,
    p_permission_key
  ) then
    return false;
  end if;

  select coalesce(ap.project_scope, 'all')
    into v_scope
  from public.memberships m
  left join public.membership_access_profiles ap
    on ap.organization_id = m.organization_id
   and ap.user_id = m.user_id
  where m.organization_id = p_organization_id
    and m.user_id = p_user_id
    and m.status = 'active'::public.membership_status
  limit 1;

  if not found then
    return false;
  end if;

  v_project_sensitive := p_permission_key in (
    'projects.view', 'projects.edit',
    'approvals.view', 'approvals.decide',
    'activity.view', 'intelligence.view',
    'autopilot.view', 'autopilot.run',
    'release_center.view', 'memory.view'
  );

  if not v_project_sensitive then
    return true;
  end if;
  if v_scope = 'none' then
    return false;
  end if;
  if v_scope = 'all' then
    return true;
  end if;

  -- Selected-only access never falls back to organization-wide rows whose
  -- project cannot be attributed safely.
  if p_project_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.membership_project_access pa
    where pa.organization_id = p_organization_id
      and pa.user_id = p_user_id
      and pa.project_id = p_project_id
      and pa.can_view
      and (p_permission_key <> 'projects.edit' or pa.can_edit)
  );
end;
$$;

create or replace function private.pandora_member_has_permission(
  p_organization_id uuid,
  p_permission_key text,
  p_project_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pandora_member_has_permission_for_user(
    p_organization_id,
    (select auth.uid()),
    p_permission_key,
    p_project_id
  );
$$;

-- SECURITY INVOKER wrappers expose booleans only. Explicit-other-user helpers
-- remain private/service-role-only.
create or replace function public.pandora_authorize_surface(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.pandora_member_permission_base(
      p_organization_id,
      p_permission_key
    );
$$;

create or replace function public.pandora_authorize(
  p_organization_id uuid,
  p_permission_key text,
  p_project_id uuid default null
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.pandora_member_has_permission(
      p_organization_id,
      p_permission_key,
      p_project_id
    );
$$;

create or replace function private.pandora_protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removes_owner boolean;
begin
  if tg_op = 'DELETE' then
    v_removes_owner := old.role = 'owner'::public.member_role
      and old.status = 'active'::public.membership_status;
  else
    v_removes_owner := old.role = 'owner'::public.member_role
      and old.status = 'active'::public.membership_status
      and (
        new.role <> 'owner'::public.member_role
        or new.status <> 'active'::public.membership_status
      );
  end if;

  if v_removes_owner and not exists (
    select 1
    from public.memberships m
    where m.organization_id = old.organization_id
      and m.user_id <> old.user_id
      and m.role = 'owner'::public.member_role
      and m.status = 'active'::public.membership_status
  ) then
    raise exception 'LAST_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_protect_last_owner_update on public.memberships;
create trigger memberships_protect_last_owner_update
before update of role, status on public.memberships
for each row execute function private.pandora_protect_last_owner();

drop trigger if exists memberships_protect_last_owner_delete on public.memberships;
create trigger memberships_protect_last_owner_delete
before delete on public.memberships
for each row execute function private.pandora_protect_last_owner();

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
  v_target public.memberships%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_can_edit boolean;
  v_event text := 'configured';
  v_key text;
begin
  if p_role not in ('owner', 'admin', 'operator', 'member', 'viewer') then
    raise exception 'INVALID_MEMBER_ROLE' using errcode = '22023';
  end if;
  if p_status not in ('invited', 'active', 'suspended', 'revoked') then
    raise exception 'INVALID_MEMBERSHIP_STATUS' using errcode = '22023';
  end if;
  if p_access_mode not in ('role', 'custom') then
    raise exception 'INVALID_ACCESS_MODE' using errcode = '22023';
  end if;
  if p_project_scope not in ('all', 'selected', 'none') then
    raise exception 'INVALID_PROJECT_SCOPE' using errcode = '22023';
  end if;

  select m.role
    into v_actor_role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = p_actor_user_id
    and m.status = 'active'::public.membership_status;

  if v_actor_role is null or not private.pandora_member_permission_base_for_user(
    p_organization_id,
    p_actor_user_id,
    'users.manage'
  ) then
    raise exception 'USER_MANAGEMENT_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_target
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.user_id = p_target_user_id
  for update;

  if not found then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
  end if;

  if (
    v_target.role = 'owner'::public.member_role
    or p_role = 'owner'
  ) and v_actor_role <> 'owner'::public.member_role then
    raise exception 'OWNER_CHANGE_REQUIRES_OWNER' using errcode = '42501';
  end if;

  -- Only an owner may delegate root user-management or production-release
  -- authority, even to an admin with users.manage.
  if v_actor_role <> 'owner'::public.member_role and (
    'users.manage' = any(coalesce(p_permissions, '{}'::text[]))
    or 'release.production' = any(coalesce(p_permissions, '{}'::text[]))
  ) then
    raise exception 'ROOT_PERMISSION_REQUIRES_OWNER' using errcode = '42501';
  end if;

  foreach v_key in array coalesce(p_permissions, '{}'::text[]) loop
    if v_key not in (
      'projects.view', 'projects.edit',
      'approvals.view', 'approvals.decide',
      'activity.view', 'intelligence.view',
      'autopilot.view', 'autopilot.run',
      'release_center.view', 'release.production',
      'connections.view', 'connections.manage',
      'safety.view', 'memory.view', 'diagnostics.view', 'users.manage'
    ) then
      raise exception 'INVALID_PERMISSION_KEY' using errcode = '22023';
    end if;
  end loop;

  if p_project_scope = 'selected' and exists (
    select 1
    from unnest(coalesce(p_project_ids, '{}'::uuid[])) requested(project_id)
    left join public.projectos_projects p
      on p.id = requested.project_id
     and p.organization_id = p_organization_id
    where p.id is null
  ) then
    raise exception 'PROJECT_SCOPE_INVALID' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'role', v_target.role,
    'status', v_target.status,
    'profile', coalesce((
      select to_jsonb(ap) - 'updated_by'
      from public.membership_access_profiles ap
      where ap.organization_id = p_organization_id
        and ap.user_id = p_target_user_id
    ), '{}'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(mp.permission_key order by mp.permission_key)
      from public.membership_permissions mp
      where mp.organization_id = p_organization_id
        and mp.user_id = p_target_user_id
        and mp.allowed
    ), '[]'::jsonb),
    'projectIds', coalesce((
      select jsonb_agg(pa.project_id order by pa.project_id)
      from public.membership_project_access pa
      where pa.organization_id = p_organization_id
        and pa.user_id = p_target_user_id
        and pa.can_view
    ), '[]'::jsonb)
  );

  update public.memberships
  set role = p_role::public.member_role,
      status = p_status::public.membership_status,
      joined_at = case
        when p_status = 'active'
          then coalesce(joined_at, timezone('utc', now()))
        else joined_at
      end,
      updated_at = timezone('utc', now())
  where organization_id = p_organization_id
    and user_id = p_target_user_id;

  insert into public.membership_access_profiles (
    organization_id,
    user_id,
    access_mode,
    project_scope,
    access_version,
    updated_by,
    updated_at
  ) values (
    p_organization_id,
    p_target_user_id,
    p_access_mode,
    p_project_scope,
    1,
    p_actor_user_id,
    timezone('utc', now())
  )
  on conflict (organization_id, user_id) do update
  set access_mode = excluded.access_mode,
      project_scope = excluded.project_scope,
      access_version = public.membership_access_profiles.access_version + 1,
      updated_by = excluded.updated_by,
      updated_at = timezone('utc', now());

  delete from public.membership_permissions
  where organization_id = p_organization_id
    and user_id = p_target_user_id;

  if p_access_mode = 'custom' then
    insert into public.membership_permissions (
      organization_id,
      user_id,
      permission_key,
      allowed
    )
    select p_organization_id,
           p_target_user_id,
           permission_key,
           true
    from unnest(coalesce(p_permissions, '{}'::text[])) permission_key;
  end if;

  delete from public.membership_project_access
  where organization_id = p_organization_id
    and user_id = p_target_user_id;

  if p_project_scope = 'selected' then
    v_can_edit := case
      when p_role = 'owner' then true
      when p_access_mode = 'custom' then
        'projects.edit' = any(coalesce(p_permissions, '{}'::text[]))
      else private.pandora_role_permission_default(
        p_role::public.member_role,
        'projects.edit'
      )
    end;

    insert into public.membership_project_access (
      organization_id,
      user_id,
      project_id,
      can_view,
      can_edit
    )
    select distinct p_organization_id,
           p_target_user_id,
           project_id,
           true,
           v_can_edit
    from unnest(coalesce(p_project_ids, '{}'::uuid[])) project_id;
  end if;

  select jsonb_build_object(
    'role', m.role,
    'status', m.status,
    'accessMode', ap.access_mode,
    'projectScope', ap.project_scope,
    'accessVersion', ap.access_version,
    'permissions', coalesce((
      select jsonb_agg(mp.permission_key order by mp.permission_key)
      from public.membership_permissions mp
      where mp.organization_id = p_organization_id
        and mp.user_id = p_target_user_id
        and mp.allowed
    ), '[]'::jsonb),
    'projectIds', coalesce((
      select jsonb_agg(pa.project_id order by pa.project_id)
      from public.membership_project_access pa
      where pa.organization_id = p_organization_id
        and pa.user_id = p_target_user_id
        and pa.can_view
    ), '[]'::jsonb)
  )
    into v_after
  from public.memberships m
  join public.membership_access_profiles ap
    on ap.organization_id = m.organization_id
   and ap.user_id = m.user_id
  where m.organization_id = p_organization_id
    and m.user_id = p_target_user_id;

  if p_status = 'revoked' then
    v_event := 'revoked';
  elsif p_status = 'suspended' then
    v_event := 'suspended';
  elsif v_target.status <> 'active'::public.membership_status
        and p_status = 'active' then
    v_event := 'reactivated';
  end if;

  insert into public.membership_access_audit (
    organization_id,
    target_user_id,
    actor_user_id,
    event_type,
    before_state,
    after_state
  ) values (
    p_organization_id,
    p_target_user_id,
    p_actor_user_id,
    v_event,
    v_before,
    v_after
  );

  return v_after;
end;
$$;

create or replace function public.pandora_revoke_membership_access(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_profile public.membership_access_profiles%rowtype;
  v_permissions text[];
  v_projects uuid[];
begin
  select role
    into v_role
  from public.memberships
  where organization_id = p_organization_id
    and user_id = p_target_user_id;

  if v_role is null then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_profile
  from public.membership_access_profiles
  where organization_id = p_organization_id
    and user_id = p_target_user_id;

  select coalesce(
      array_agg(permission_key order by permission_key),
      '{}'::text[]
    )
    into v_permissions
  from public.membership_permissions
  where organization_id = p_organization_id
    and user_id = p_target_user_id
    and allowed;

  select coalesce(
      array_agg(project_id order by project_id),
      '{}'::uuid[]
    )
    into v_projects
  from public.membership_project_access
  where organization_id = p_organization_id
    and user_id = p_target_user_id
    and can_view;

  return public.pandora_configure_membership_access(
    p_organization_id,
    p_target_user_id,
    p_actor_user_id,
    v_role::text,
    'revoked',
    coalesce(v_profile.access_mode, 'role'),
    coalesce(v_profile.project_scope, 'all'),
    coalesce(v_permissions, '{}'::text[]),
    coalesce(v_projects, '{}'::uuid[])
  );
end;
$$;

-- Access-table visibility. Clients may inspect their own effective source rows;
-- user managers may inspect their organization's rows. No client writes these
-- tables directly; writes go through the audited service-role RPC above.
create policy membership_access_profiles_self_read
  on public.membership_access_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy membership_access_profiles_manager_read
  on public.membership_access_profiles for select to authenticated
  using (private.pandora_member_permission_base(
    organization_id,
    'users.manage'
  ));
create policy membership_permissions_self_read
  on public.membership_permissions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy membership_permissions_manager_read
  on public.membership_permissions for select to authenticated
  using (private.pandora_member_permission_base(
    organization_id,
    'users.manage'
  ));
create policy membership_project_access_self_read
  on public.membership_project_access for select to authenticated
  using ((select auth.uid()) = user_id);
create policy membership_project_access_manager_read
  on public.membership_project_access for select to authenticated
  using (private.pandora_member_permission_base(
    organization_id,
    'users.manage'
  ));
create policy membership_access_audit_manager_read
  on public.membership_access_audit for select to authenticated
  using (private.pandora_member_permission_base(
    organization_id,
    'users.manage'
  ));

-- Authenticated Data API clients cannot physically erase membership evidence.
create policy memberships_preserve_history
  on public.memberships as restrictive for delete to authenticated
  using (false);

-- Existing permissive org-member policies stay in place. RESTRICTIVE policies
-- are ANDed with them and therefore narrow current data surfaces.
create policy pandora_projects_read_access
  on public.projectos_projects as restrictive for select to authenticated
  using (
    private.pandora_member_has_permission(
      organization_id,
      'projects.view',
      id
    )
    or private.pandora_member_has_permission(
      organization_id,
      'intelligence.view',
      id
    )
  );
create policy pandora_projects_insert_access
  on public.projectos_projects as restrictive for insert to authenticated
  with check (private.pandora_member_has_permission(
    organization_id,
    'projects.edit',
    id
  ));
create policy pandora_projects_update_access
  on public.projectos_projects as restrictive for update to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'projects.edit',
    id
  ))
  with check (private.pandora_member_has_permission(
    organization_id,
    'projects.edit',
    id
  ));
create policy pandora_projects_delete_access
  on public.projectos_projects as restrictive for delete to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'projects.edit',
    id
  ));

-- Project-scoped read surfaces used by Projects, Intelligence, Memory and
-- Release Center. Each row must resolve to an allowed project.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projectos_project_resources',
    'projectos_phases',
    'projectos_tasks',
    'projectos_task_dependencies',
    'projectos_evidence',
    'projectos_reconciliation_runs',
    'projectos_decisions',
    'projectos_task_outcomes',
    'projectos_agent_observations',
    'projectos_workspace_documents',
    'projectos_projections',
    'projectos_learning_runs'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (' ||
      'private.pandora_member_has_permission(organization_id, ''projects.view'', project_id) ' ||
      'or private.pandora_member_has_permission(organization_id, ''memory.view'', project_id) ' ||
      'or private.pandora_member_has_permission(organization_id, ''intelligence.view'', project_id) ' ||
      'or private.pandora_member_has_permission(organization_id, ''release_center.view'', project_id))',
      'pandora_' || t || '_read_access',
      t
    );
  end loop;
end $$;

-- Current operator-write tables are additionally narrowed by projects.edit.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projectos_project_resources',
    'projectos_phases',
    'projectos_tasks',
    'projectos_task_dependencies'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (' ||
      'private.pandora_member_has_permission(organization_id, ''projects.edit'', project_id))',
      'pandora_' || t || '_insert_access',
      t
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (' ||
      'private.pandora_member_has_permission(organization_id, ''projects.edit'', project_id)) with check (' ||
      'private.pandora_member_has_permission(organization_id, ''projects.edit'', project_id))',
      'pandora_' || t || '_update_access',
      t
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (' ||
      'private.pandora_member_has_permission(organization_id, ''projects.edit'', project_id))',
      'pandora_' || t || '_delete_access',
      t
    );
  end loop;
end $$;

create policy pandora_lessons_read_access
  on public.projectos_lessons as restrictive for select to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'memory.view',
    project_id
  ));

create policy pandora_intake_read_access
  on public.projectos_intake_requests as restrictive for select to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'autopilot.view',
    project_id
  ));
create policy pandora_intake_insert_access
  on public.projectos_intake_requests as restrictive for insert to authenticated
  with check (private.pandora_member_has_permission(
    organization_id,
    'autopilot.run',
    project_id
  ));
create policy pandora_intake_update_access
  on public.projectos_intake_requests as restrictive for update to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'autopilot.run',
    project_id
  ))
  with check (private.pandora_member_has_permission(
    organization_id,
    'autopilot.run',
    project_id
  ));

-- Approval project scope is taken only from a UUID projectId/project_id in the
-- redacted preview. Historical rows without attributable project identity fail
-- closed for selected-project users rather than leaking another project.
create policy pandora_approvals_read_access
  on public.approvals as restrictive for select to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'approvals.view',
    case
      when coalesce(
        preview_redacted ->> 'projectId',
        preview_redacted ->> 'project_id',
        ''
      ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then coalesce(
        preview_redacted ->> 'projectId',
        preview_redacted ->> 'project_id'
      )::uuid
      else null
    end
  ));
create policy pandora_approvals_update_access
  on public.approvals as restrictive for update to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'approvals.decide',
    case
      when coalesce(
        preview_redacted ->> 'projectId',
        preview_redacted ->> 'project_id',
        ''
      ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then coalesce(
        preview_redacted ->> 'projectId',
        preview_redacted ->> 'project_id'
      )::uuid
      else null
    end
  ))
  with check (private.pandora_member_has_permission(
    organization_id,
    'approvals.decide',
    case
      when coalesce(
        preview_redacted ->> 'projectId',
        preview_redacted ->> 'project_id',
        ''
      ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then coalesce(
        preview_redacted ->> 'projectId',
        preview_redacted ->> 'project_id'
      )::uuid
      else null
    end
  ));

-- workflow_steps and audit_events do not currently carry a trustworthy
-- project_id. Selected-project users therefore receive no direct rows from
-- these organization-wide tables until attribution is added.
create policy pandora_workflow_steps_read_access
  on public.workflow_steps as restrictive for select to authenticated
  using (
    private.pandora_member_has_permission(
      organization_id,
      'approvals.view',
      null
    )
    or private.pandora_member_has_permission(
      organization_id,
      'autopilot.view',
      null
    )
  );
create policy pandora_activity_read_access
  on public.audit_events as restrictive for select to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'activity.view',
    null
  ));

create policy pandora_connections_read_access
  on public.connector_installations as restrictive for select to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'connections.view',
    null
  ));
create policy pandora_connections_update_access
  on public.connector_installations as restrictive for update to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'connections.manage',
    null
  ))
  with check (private.pandora_member_has_permission(
    organization_id,
    'connections.manage',
    null
  ));

create policy pandora_integration_health_read_access
  on public.projectos_integration_health as restrictive for select to authenticated
  using (
    private.pandora_member_has_permission(
      organization_id,
      'connections.view',
      project_id
    )
    or private.pandora_member_has_permission(
      organization_id,
      'safety.view',
      project_id
    )
  );
create policy pandora_policies_read_access
  on public.projectos_policies as restrictive for select to authenticated
  using (private.pandora_member_has_permission(
    organization_id,
    'safety.view',
    null
  ));

-- Permission-aware intake. Connection changes remain plan-first and require
-- connections.manage. All other Pandora Mobile intake requires autopilot.run.
-- Selected-project users cannot implicitly create or target projects outside
-- their explicit scope.
create or replace function public.projectos_accept_intake(
  p_organization_id uuid,
  p_requester_id uuid,
  p_request_text text,
  p_project_key text default null,
  p_project_name text default null,
  p_repository text default null,
  p_request_type text default 'work',
  p_source text default 'operator',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'private', 'auth', 'extensions', 'pg_temp'
as $$
declare
  v_project public.projectos_projects%rowtype;
  v_intake public.projectos_intake_requests%rowtype;
  v_key text;
  v_policy public.projectos_policies%rowtype;
  v_permission text;
begin
  if auth.role() <> 'service_role'
     and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'projectos_permanent_account_required' using errcode = '42501';
  end if;

  if auth.role() <> 'service_role'
     and not private.is_org_member(p_organization_id) then
    raise exception 'projectos_forbidden' using errcode = '42501';
  end if;

  if p_requester_id is not null
     and auth.role() <> 'service_role'
     and p_requester_id <> auth.uid() then
    raise exception 'projectos_requester_mismatch' using errcode = '42501';
  end if;

  v_permission := case
    when p_request_type = 'control_change' then 'connections.manage'
    else 'autopilot.run'
  end;

  select *
    into v_policy
  from public.projectos_policies
  where organization_id = p_organization_id;
  if found and v_policy.allow_untracked_work then
    raise exception 'invalid_projectos_policy';
  end if;

  if p_project_key is not null and trim(p_project_key) <> '' then
    v_key := lower(trim(p_project_key));
  elsif p_repository is not null and trim(p_repository) <> '' then
    v_key := lower(regexp_replace(
      split_part(p_repository, '/', 2),
      '[^a-zA-Z0-9._-]+',
      '-',
      'g'
    ));
  elsif p_project_name is not null and trim(p_project_name) <> '' then
    v_key := lower(regexp_replace(
      trim(p_project_name),
      '[^a-zA-Z0-9._-]+',
      '-',
      'g'
    ));
  else
    v_key := 'projectos-inbox';
  end if;

  select *
    into v_project
  from public.projectos_projects
  where organization_id = p_organization_id
    and (
      project_key = v_key
      or (p_repository is not null and repository = p_repository)
    )
  order by case when project_key = v_key then 0 else 1 end
  limit 1;

  if auth.role() <> 'service_role' then
    if found then
      if not private.pandora_member_has_permission(
        p_organization_id,
        v_permission,
        case when v_permission = 'autopilot.run' then v_project.id else null end
      ) then
        raise exception 'projectos_permission_denied' using errcode = '42501';
      end if;
    else
      -- New-project intake is permitted only when the permission also permits
      -- an organization-wide (all-project) target. Selected/none fail closed.
      if not private.pandora_member_has_permission(
        p_organization_id,
        v_permission,
        null
      ) then
        raise exception 'projectos_permission_denied' using errcode = '42501';
      end if;
    end if;
  end if;

  if not found then
    perform public.projectos_register_project(
      p_organization_id,
      v_key,
      coalesce(
        nullif(trim(p_project_name), ''),
        initcap(replace(v_key, '-', ' '))
      ),
      p_repository,
      'Automatically created by mandatory ProjectOS intake.',
      p_requester_id
    );
    select *
      into v_project
    from public.projectos_projects
    where organization_id = p_organization_id
      and project_key = v_key;
  end if;

  insert into public.projectos_intake_requests (
    organization_id,
    project_id,
    requester_id,
    source,
    request_type,
    request_text,
    project_hint,
    repository_hint,
    idempotency_key,
    status,
    analysis
  ) values (
    p_organization_id,
    v_project.id,
    p_requester_id,
    p_source,
    p_request_type,
    p_request_text,
    v_key,
    p_repository,
    coalesce(
      nullif(p_idempotency_key, ''),
      encode(
        digest(
          p_organization_id::text || ':' || p_request_text,
          'sha256'
        ),
        'hex'
      )
    ),
    'accepted',
    jsonb_build_object(
      'workspacePath', v_project.workspace_path,
      'mandatoryControlLayer', true,
      'nextAction', 'analyze_current_state'
    )
  )
  on conflict (organization_id, idempotency_key) do update
  set project_id = excluded.project_id
  returning * into v_intake;

  return jsonb_build_object(
    'intake', to_jsonb(v_intake),
    'project', to_jsonb(v_project)
  );
end;
$$;

comment on function public.projectos_accept_intake(
  uuid, uuid, text, text, text, text, text, text, text
) is 'Accepts governed ProjectOS intake for permanent members with the required Pandora permission; connection changes require connections.manage and other work requires autopilot.run. Selected-project scope is enforced.';

-- Permission-aware approval decision. This preserves the existing owner decision
-- that ordinary approvals do not require AAL2/TOTP while retaining permanent
-- account, assignment, expiry, separation-of-duty and audit controls.
create or replace function public.decide_approval(
  approval_id uuid,
  requested_decision public.approval_decision,
  reason text default null::text
)
returns public.approvals
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  approval_row public.approvals%rowtype;
  step_risk public.risk_class := 'R1'::public.risk_class;
  v_project_id uuid;
  v_project_text text;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'permanent account required' using errcode = '42501';
  end if;

  if requested_decision not in (
    'approved'::public.approval_decision,
    'denied'::public.approval_decision
  ) then
    raise exception 'decision must be approved or denied';
  end if;

  select *
    into approval_row
  from public.approvals
  where id = approval_id
  for update;

  if not found then
    raise exception 'approval not found';
  end if;

  if approval_row.step_id is not null then
    select risk
      into step_risk
    from public.workflow_steps
    where id = approval_row.step_id;
  end if;

  if approval_row.decision <> 'pending'::public.approval_decision then
    raise exception 'approval is no longer pending';
  end if;

  if approval_row.expires_at <= timezone('utc', now()) then
    raise exception 'approval has expired';
  end if;

  if approval_row.assigned_to is not null
     and approval_row.assigned_to <> current_user_id then
    raise exception 'approval is assigned to another staff member';
  end if;

  v_project_text := coalesce(
    approval_row.preview_redacted ->> 'projectId',
    approval_row.preview_redacted ->> 'project_id'
  );
  if coalesce(v_project_text, '')
     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_project_id := v_project_text::uuid;
  end if;

  if not private.pandora_member_has_permission(
    approval_row.organization_id,
    'approvals.decide',
    v_project_id
  ) then
    raise exception 'insufficient approval permission' using errcode = '42501';
  end if;

  if step_risk in ('R3'::public.risk_class, 'R4'::public.risk_class)
     and approval_row.requested_by = current_user_id then
    raise exception 'high-risk requests require a different approver';
  end if;

  update public.approvals
  set decision = requested_decision,
      decision_by = current_user_id,
      decision_reason = reason,
      decided_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = approval_id
  returning * into approval_row;

  perform private.append_audit_event(
    approval_row.organization_id,
    approval_row.run_id,
    approval_row.step_id,
    'human'::public.audit_actor_type,
    current_user_id,
    'approval.' || requested_decision::text,
    jsonb_build_object(
      'approval_id', approval_row.id,
      'action_hash', approval_row.action_hash
    )
  );

  return approval_row;
end;
$function$;

comment on function public.decide_approval(
  uuid,
  public.approval_decision,
  text
) is 'Decides an eligible pending approval for a permanent member with approvals.decide; selected-project scope, separation of duty, expiry, assignment, and audit controls remain enforced; AAL2 is not required.';

revoke all on public.membership_access_profiles from anon;
revoke all on public.membership_permissions from anon;
revoke all on public.membership_project_access from anon;
revoke all on public.membership_access_audit from anon;
revoke insert, update, delete on public.membership_access_profiles from authenticated;
revoke insert, update, delete on public.membership_permissions from authenticated;
revoke insert, update, delete on public.membership_project_access from authenticated;
revoke insert, update, delete on public.membership_access_audit from authenticated;
grant select on public.membership_access_profiles to authenticated;
grant select on public.membership_permissions to authenticated;
grant select on public.membership_project_access to authenticated;
grant select on public.membership_access_audit to authenticated;
grant all on public.membership_access_profiles to service_role;
grant all on public.membership_permissions to service_role;
grant all on public.membership_project_access to service_role;
grant all on public.membership_access_audit to service_role;

revoke all on function public.pandora_authorize_surface(uuid, text)
  from public, anon;
grant execute on function public.pandora_authorize_surface(uuid, text)
  to authenticated, service_role;
revoke all on function public.pandora_authorize(uuid, text, uuid)
  from public, anon;
grant execute on function public.pandora_authorize(uuid, text, uuid)
  to authenticated, service_role;

revoke all on function public.pandora_configure_membership_access(
  uuid, uuid, uuid, text, text, text, text, text[], uuid[]
) from public, anon, authenticated;
grant execute on function public.pandora_configure_membership_access(
  uuid, uuid, uuid, text, text, text, text, text[], uuid[]
) to service_role;
revoke all on function public.pandora_revoke_membership_access(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.pandora_revoke_membership_access(uuid, uuid, uuid)
  to service_role;

-- Auth-bound helpers may be called by RLS. Explicit-other-user helpers remain
-- service-role-only to avoid turning them into an authorization oracle.
grant execute on function private.pandora_member_permission_base(uuid, text)
  to authenticated, service_role;
grant execute on function private.pandora_member_has_permission(uuid, text, uuid)
  to authenticated, service_role;
revoke all on function private.pandora_member_permission_base_for_user(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function private.pandora_member_permission_base_for_user(
  uuid, uuid, text
) to service_role;
revoke all on function private.pandora_member_has_permission_for_user(
  uuid, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function private.pandora_member_has_permission_for_user(
  uuid, uuid, text, uuid
) to service_role;

revoke execute on function public.decide_approval(
  uuid,
  public.approval_decision,
  text
) from public, anon;
grant execute on function public.decide_approval(
  uuid,
  public.approval_decision,
  text
) to authenticated, service_role;
