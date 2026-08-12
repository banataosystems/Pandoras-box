create or replace function public.get_supabase_control_accounts(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_accounts jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(nullif(installation.configuration ->> 'account_id', ''), installation.id::text),
        'label', coalesce(installation.display_name, installation.external_account_id),
        'authMode', coalesce(nullif(installation.configuration ->> 'auth_mode', ''), 'pat'),
        'token', secret.decrypted_secret,
        'allowMutations', coalesce((installation.configuration ->> 'allow_mutations')::boolean, false),
        'allowedOrganizationSlugs', coalesce(installation.configuration -> 'organization_slugs', '[]'::jsonb),
        'allowedProjectRefs', coalesce(installation.configuration -> 'allowed_project_refs', '[]'::jsonb)
      )
      order by installation.display_name, installation.id
    ),
    '[]'::jsonb
  )
  into resolved_accounts
  from public.connector_installations as installation
  join public.credential_refs as credential
    on credential.installation_id = installation.id
   and credential.organization_id = installation.organization_id
  join vault.decrypted_secrets as secret
    on credential.secret_ref ~ '^vault://[0-9a-fA-F-]{36}$'
   and secret.id = replace(credential.secret_ref, 'vault://', '')::uuid
  where installation.organization_id = p_organization_id
    and installation.provider = 'supabase'
    and installation.status = 'active'::public.connector_status
    and credential.rotation_state = 'current'::public.rotation_status;

  return resolved_accounts;
end;
$$;

revoke all on function public.get_supabase_control_accounts(uuid) from public, anon, authenticated;
grant execute on function public.get_supabase_control_accounts(uuid) to service_role;
