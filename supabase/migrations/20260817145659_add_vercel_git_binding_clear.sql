-- Compensating rollback operation for governed Vercel Git binding changes.
-- It will only disconnect the exact allowlisted GitHub repository and verifies
-- the provider returns to an unlinked state; unexpected links fail closed.

create or replace function public.clear_vercel_git_binding(
  p_organization_id uuid,
  p_installation_id uuid,
  p_project_id text,
  p_expected_repo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_team_id text;
  v_allowed_repo text;
  v_link_url varchar;
  v_project_url varchar;
  v_before extensions.http_response;
  v_disconnect extensions.http_response;
  v_after extensions.http_response;
  v_rollback extensions.http_response;
  v_rollback_readback extensions.http_response;
  v_before_payload jsonb;
  v_after_payload jsonb;
  v_rollback_payload jsonb;
  v_before_type text;
  v_before_org text;
  v_before_repo text;
  v_rollback_verified boolean := false;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select secret.decrypted_secret,
         installation.configuration ->> 'team_id',
         installation.configuration -> 'project_repo_allowlist' ->> p_project_id
    into v_token, v_team_id, v_allowed_repo
  from public.connector_installations installation
  join public.credential_refs credential
    on credential.installation_id = installation.id
   and credential.organization_id = installation.organization_id
  join vault.decrypted_secrets secret
    on credential.secret_ref ~ '^vault://[0-9a-fA-F-]{36}$'
   and secret.id = replace(credential.secret_ref, 'vault://', '')::uuid
  where installation.organization_id = p_organization_id
    and installation.id = p_installation_id
    and installation.provider = 'vercel'
    and installation.status in ('pending'::public.connector_status, 'active'::public.connector_status)
    and installation.configuration ->> 'allow_mutations' = 'true'
    and credential.rotation_state = 'current'::public.rotation_status;

  if v_token is null or v_team_id is null then
    raise exception 'Vercel credential unavailable' using errcode = 'P0002';
  end if;

  if v_allowed_repo is null or v_allowed_repo <> p_expected_repo then
    raise exception 'Vercel project/repository pair is not allowlisted' using errcode = '42501';
  end if;

  v_link_url := ('https://api.vercel.com/v9/projects/' || p_project_id || '/link?teamId=' || v_team_id)::varchar;
  v_project_url := ('https://api.vercel.com/v9/projects/' || p_project_id || '?teamId=' || v_team_id)::varchar;

  select * into v_before
  from extensions.http((
    'GET'::extensions.http_method,
    v_project_url,
    array[
      ('Accept', 'application/json')::extensions.http_header,
      ('Authorization', 'Bearer ' || v_token)::extensions.http_header,
      ('Content-Type', 'application/json')::extensions.http_header,
      ('User-Agent', 'MCPMaster-Control-Plane')::extensions.http_header
    ]::extensions.http_header[],
    'application/json'::varchar,
    null::varchar
  )::extensions.http_request);

  if v_before.status <> 200 then
    return jsonb_build_object('ok',false,'changed',false,'provider','vercel','projectId',p_project_id,'status',v_before.status,'error','pre_rollback_readback_failed');
  end if;

  v_before_payload := v_before.content::jsonb;
  v_before_type := v_before_payload #>> '{link,type}';
  v_before_org := v_before_payload #>> '{link,org}';
  v_before_repo := v_before_payload #>> '{link,repo}';

  if v_before_type is null or v_before_type = '' then
    return jsonb_build_object('ok',true,'changed',false,'provider','vercel','projectId',p_project_id,'unlinkedVerified',true);
  end if;

  if v_before_type <> 'github'
     or coalesce(v_before_org,'') || '/' || coalesce(v_before_repo,'') <> p_expected_repo then
    return jsonb_build_object(
      'ok',false,'changed',false,'provider','vercel','projectId',p_project_id,
      'error','unexpected_current_link','currentLink',jsonb_build_object('type',v_before_type,'org',v_before_org,'repo',v_before_repo)
    );
  end if;

  select * into v_disconnect
  from extensions.http((
    'DELETE'::extensions.http_method,
    v_link_url,
    array[
      ('Accept', 'application/json')::extensions.http_header,
      ('Authorization', 'Bearer ' || v_token)::extensions.http_header,
      ('Content-Type', 'application/json')::extensions.http_header,
      ('User-Agent', 'MCPMaster-Control-Plane')::extensions.http_header
    ]::extensions.http_header[],
    'application/json'::varchar,
    null::varchar
  )::extensions.http_request);

  if v_disconnect.status < 200 or v_disconnect.status >= 300 then
    return jsonb_build_object('ok',false,'changed',false,'provider','vercel','projectId',p_project_id,'status',v_disconnect.status,'error','disconnect_failed');
  end if;

  select * into v_after
  from extensions.http((
    'GET'::extensions.http_method,
    v_project_url,
    array[
      ('Accept', 'application/json')::extensions.http_header,
      ('Authorization', 'Bearer ' || v_token)::extensions.http_header,
      ('Content-Type', 'application/json')::extensions.http_header,
      ('User-Agent', 'MCPMaster-Control-Plane')::extensions.http_header
    ]::extensions.http_header[],
    'application/json'::varchar,
    null::varchar
  )::extensions.http_request);

  if v_after.status = 200 then
    v_after_payload := v_after.content::jsonb;
  end if;

  if v_after.status = 200
     and (v_after_payload -> 'link' is null or v_after_payload -> 'link' = 'null'::jsonb) then
    return jsonb_build_object('ok',true,'changed',true,'provider','vercel','projectId',p_project_id,'unlinkedVerified',true,'previousLink',jsonb_build_object('type',v_before_type,'org',v_before_org,'repo',v_before_repo));
  end if;

  select * into v_rollback
  from extensions.http((
    'POST'::extensions.http_method,
    v_link_url,
    array[
      ('Accept', 'application/json')::extensions.http_header,
      ('Authorization', 'Bearer ' || v_token)::extensions.http_header,
      ('Content-Type', 'application/json')::extensions.http_header,
      ('User-Agent', 'MCPMaster-Control-Plane')::extensions.http_header
    ]::extensions.http_header[],
    'application/json'::varchar,
    jsonb_build_object('type','github','repo',p_expected_repo)::text::varchar
  )::extensions.http_request);

  select * into v_rollback_readback
  from extensions.http((
    'GET'::extensions.http_method,
    v_project_url,
    array[
      ('Accept', 'application/json')::extensions.http_header,
      ('Authorization', 'Bearer ' || v_token)::extensions.http_header,
      ('Content-Type', 'application/json')::extensions.http_header,
      ('User-Agent', 'MCPMaster-Control-Plane')::extensions.http_header
    ]::extensions.http_header[],
    'application/json'::varchar,
    null::varchar
  )::extensions.http_request);

  if v_rollback_readback.status = 200 then
    v_rollback_payload := v_rollback_readback.content::jsonb;
    v_rollback_verified := (v_rollback_payload #>> '{link,type}') = 'github'
      and coalesce(v_rollback_payload #>> '{link,org}','') || '/' || coalesce(v_rollback_payload #>> '{link,repo}','') = p_expected_repo;
  end if;

  return jsonb_build_object(
    'ok',false,'changed',false,'provider','vercel','projectId',p_project_id,
    'error','unlink_readback_mismatch','rollbackAttempted',true,'rollbackVerified',v_rollback_verified
  );
end;
$$;

revoke all on function public.clear_vercel_git_binding(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.clear_vercel_git_binding(uuid, uuid, text, text) to service_role;
