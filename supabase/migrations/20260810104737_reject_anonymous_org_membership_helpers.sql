-- GOVERNED MIGRATION-HISTORY RECOVERY.
-- This filename preserves a production ledger version for clean replay.
-- Production history is never rewritten; live hashes remain in the recovery manifest.
-- Semantic recovery of the provider-recorded SQL payload; comments and terminal newline may differ.

-- Anonymous Supabase sessions also assume the authenticated Postgres role.
-- Put the permanent-account boundary inside the shared organization helpers
-- so every RLS policy that delegates to them fails closed for anonymous JWTs.
create or replace function private.is_org_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
    and exists (
      select 1
      from public.memberships membership
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'::public.membership_status
    );
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
    and exists (
      select 1
      from public.memberships membership
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'::public.membership_status
        and membership.role = any(allowed_roles)
    );
$$;

comment on function private.is_org_member(uuid)
is 'Returns true only for a permanent authenticated user with an active organization membership.';

comment on function private.has_org_role(uuid, public.member_role[])
is 'Returns true only for a permanent authenticated user with an allowed active organization role.';
