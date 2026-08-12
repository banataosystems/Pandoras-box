create or replace function public.create_organization(
  organization_name text,
  organization_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_organization_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true'
     or exists (
       select 1
       from auth.users account
       where account.id = current_user_id
         and account.is_anonymous
     ) then
    raise exception 'anonymous users cannot create organizations'
      using errcode = '42501';
  end if;

  if nullif(btrim(organization_name), '') is null
     or nullif(btrim(organization_slug), '') is null then
    raise exception 'organization name and slug are required';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (
    btrim(organization_name),
    lower(btrim(organization_slug)),
    current_user_id
  )
  returning id into new_organization_id;

  insert into public.memberships (
    organization_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  values (
    new_organization_id,
    current_user_id,
    'owner'::public.member_role,
    'active'::public.membership_status,
    current_user_id,
    timezone('utc', now())
  );

  perform private.append_audit_event(
    new_organization_id,
    null,
    null,
    'human'::public.audit_actor_type,
    current_user_id,
    'organization.created',
    jsonb_build_object('slug', lower(btrim(organization_slug)))
  );

  return new_organization_id;
end;
$$;

-- Organization creation is intentionally RPC-only. Anonymous users receive
-- the authenticated Postgres role, so a role grant alone is not an identity
-- boundary; the function checks both the signed claim and the auth.users row.
alter table public.organizations enable row level security;
revoke insert on table public.organizations from public, anon, authenticated;

revoke all on function public.create_organization(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_organization(text, text)
  to authenticated, service_role;

comment on function public.create_organization(text, text)
is 'Creates an organization and owner membership only for a permanent authenticated account; anonymous sessions are rejected in the database.';
