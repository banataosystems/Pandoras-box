create or replace function public.probe_github_connector(
  p_organization_id uuid,
  p_installation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  github_token text;
  user_response extensions.http_response;
  repos_response extensions.http_response;
  user_payload jsonb;
  repos_payload jsonb;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select secret.decrypted_secret
    into github_token
  from public.connector_installations installation
  join public.credential_refs credential
    on credential.installation_id = installation.id
   and credential.organization_id = installation.organization_id
  join vault.decrypted_secrets secret
    on credential.secret_ref ~ '^vault://[0-9a-fA-F-]{36}$'
   and secret.id = replace(credential.secret_ref, 'vault://', '')::uuid
  where installation.organization_id = p_organization_id
    and installation.id = p_installation_id
    and installation.provider = 'github'
    and installation.status in ('pending'::public.connector_status, 'active'::public.connector_status)
    and credential.rotation_state = 'current'::public.rotation_status;

  if github_token is null then
    raise exception 'GitHub credential unavailable' using errcode = 'P0002';
  end if;

  select * into user_response
  from extensions.http((
    'GET'::extensions.http_method,
    'https://api.github.com/user'::varchar,
    array[
      ('Accept', 'application/vnd.github+json')::extensions.http_header,
      ('Authorization', 'Bearer ' || github_token)::extensions.http_header,
      ('X-GitHub-Api-Version', '2026-03-10')::extensions.http_header,
      ('User-Agent', 'MCPMaster-Control-Plane')::extensions.http_header
    ]::extensions.http_header[],
    'application/json'::varchar,
    null::varchar
  )::extensions.http_request);

  if user_response.status <> 200 then
    return jsonb_build_object(
      'ok', false,
      'provider', 'github',
      'status', user_response.status,
      'error', 'identity_probe_failed'
    );
  end if;

  user_payload := user_response.content::jsonb;

  select * into repos_response
  from extensions.http((
    'GET'::extensions.http_method,
    'https://api.github.com/user/repos?affiliation=owner%2Ccollaborator%2Corganization_member&visibility=all&sort=updated&direction=desc&per_page=100'::varchar,
    array[
      ('Accept', 'application/vnd.github+json')::extensions.http_header,
      ('Authorization', 'Bearer ' || github_token)::extensions.http_header,
      ('X-GitHub-Api-Version', '2026-03-10')::extensions.http_header,
      ('User-Agent', 'MCPMaster-Control-Plane')::extensions.http_header
    ]::extensions.http_header[],
    'application/json'::varchar,
    null::varchar
  )::extensions.http_request);

  if repos_response.status <> 200 then
    return jsonb_build_object(
      'ok', false,
      'provider', 'github',
      'status', repos_response.status,
      'error', 'repository_probe_failed',
      'identity', jsonb_build_object(
        'id', user_payload -> 'id',
        'login', user_payload -> 'login',
        'name', user_payload -> 'name',
        'type', user_payload -> 'type'
      )
    );
  end if;

  repos_payload := repos_response.content::jsonb;

  return jsonb_build_object(
    'ok', true,
    'provider', 'github',
    'identity', jsonb_build_object(
      'id', user_payload -> 'id',
      'login', user_payload -> 'login',
      'name', user_payload -> 'name',
      'type', user_payload -> 'type',
      'publicRepos', user_payload -> 'public_repos',
      'totalPrivateRepos', user_payload -> 'total_private_repos',
      'twoFactorAuthentication', user_payload -> 'two_factor_authentication'
    ),
    'repositories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', repository -> 'id',
          'fullName', repository -> 'full_name',
          'private', repository -> 'private',
          'archived', repository -> 'archived',
          'disabled', repository -> 'disabled',
          'defaultBranch', repository -> 'default_branch',
          'permissions', repository -> 'permissions'
        )
        order by repository ->> 'full_name'
      )
      from jsonb_array_elements(repos_payload) repository
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.probe_github_connector(uuid, uuid) from public, anon, authenticated;
grant execute on function public.probe_github_connector(uuid, uuid) to service_role;
