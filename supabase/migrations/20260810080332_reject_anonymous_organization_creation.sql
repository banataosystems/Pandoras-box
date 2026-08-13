-- GOVERNED MIGRATION-HISTORY RECOVERY.
-- This filename preserves a production ledger version for clean replay.
-- Production history is never rewritten; live hashes remain in the recovery manifest.
-- Semantic recovery of the provider-recorded SQL payload; comments and terminal newline may differ.

create or replace function public.create_organization(
  organization_name text,
  organization_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  current_claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  new_organization_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if coalesce((current_claims ->> 'is_anonymous')::boolean, false) then
    raise exception 'anonymous users cannot create organizations' using errcode = '42501';
  end if;

  if nullif(btrim(organization_name), '') is null
     or nullif(btrim(organization_slug), '') is null then
    raise exception 'organization name and slug are required';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (btrim(organization_name), lower(btrim(organization_slug)), current_user_id)
  returning id into new_organization_id;

  insert into public.memberships (
    organization_id, user_id, role, status, invited_by, joined_at
  )
  values (
    new_organization_id, current_user_id, 'owner'::public.member_role,
    'active'::public.membership_status, current_user_id, timezone('utc', now())
  );

  perform private.append_audit_event(
    new_organization_id, null, null, 'human'::public.audit_actor_type,
    current_user_id, 'organization.created',
    jsonb_build_object('slug', lower(btrim(organization_slug)))
  );

  return new_organization_id;
end;
$function$;
