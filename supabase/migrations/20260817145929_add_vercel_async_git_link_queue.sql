-- Async Vercel Git link transport for provider operations that outlive the
-- synchronous postgres-http client timeout. The Vault credential remains
-- internal; callers receive only a pg_net request id and sanitized pre-state.

create or replace function public.queue_vercel_git_link_change(
  p_organization_id uuid,
  p_installation_id uuid,
  p_project_id text,
  p_repo text,
  p_connect boolean
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
  v_project_url varchar;
  v_link_url text;
  v_before extensions.http_response;
  v_before_payload jsonb;
  v_before_type text;
  v_before_org text;
  v_before_repo text;
  v_request_id bigint;
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

  if v_allowed_repo is null or v_allowed_repo <> p_repo then
    raise exception 'Vercel project/repository pair is not allowlisted' using errcode = '42501';
  end if;

  v_project_url := ('https://api.vercel.com/v9/projects/' || p_project_id || '?teamId=' || v_team_id)::varchar;
  v_link_url := 'https://api.vercel.com/v9/projects/' || p_project_id || '/link?teamId=' || v_team_id;

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
    return jsonb_build_object('ok',false,'queued',false,'provider','vercel','projectId',p_project_id,'status',v_before.status,'error','pre_queue_readback_failed');
  end if;

  v_before_payload := v_before.content::jsonb;
  v_before_type := v_before_payload #>> '{link,type}';
  v_before_org := v_before_payload #>> '{link,org}';
  v_before_repo := v_before_payload #>> '{link,repo}';

  if p_connect then
    if v_before_type = 'github'
       and coalesce(v_before_org,'') || '/' || coalesce(v_before_repo,'') = p_repo then
      return jsonb_build_object('ok',true,'queued',false,'alreadyVerified',true,'provider','vercel','projectId',p_project_id,'repository',p_repo);
    end if;

    if v_before_type is not null and v_before_type <> '' then
      return jsonb_build_object('ok',false,'queued',false,'provider','vercel','projectId',p_project_id,'error','project_not_unlinked','currentLink',jsonb_build_object('type',v_before_type,'org',v_before_org,'repo',v_before_repo));
    end if;

    v_request_id := net.http_post(
      url := v_link_url,
      body := jsonb_build_object('type','github','repo',p_repo),
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Accept','application/json',
        'Authorization','Bearer ' || v_token,
        'Content-Type','application/json',
        'User-Agent','MCPMaster-Control-Plane'
      ),
      timeout_milliseconds := 120000
    );
  else
    if v_before_type is null or v_before_type = '' then
      return jsonb_build_object('ok',true,'queued',false,'alreadyVerified',true,'provider','vercel','projectId',p_project_id,'unlinkedVerified',true);
    end if;

    if v_before_type <> 'github'
       or coalesce(v_before_org,'') || '/' || coalesce(v_before_repo,'') <> p_repo then
      return jsonb_build_object('ok',false,'queued',false,'provider','vercel','projectId',p_project_id,'error','unexpected_current_link','currentLink',jsonb_build_object('type',v_before_type,'org',v_before_org,'repo',v_before_repo));
    end if;

    v_request_id := net.http_delete(
      url := v_link_url,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Accept','application/json',
        'Authorization','Bearer ' || v_token,
        'Content-Type','application/json',
        'User-Agent','MCPMaster-Control-Plane'
      ),
      timeout_milliseconds := 120000,
      body := null
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'queued',true,
    'provider','vercel',
    'projectId',p_project_id,
    'repository',p_repo,
    'operation',case when p_connect then 'connect' else 'disconnect' end,
    'requestId',v_request_id,
    'preState',case when v_before_type is null or v_before_type = '' then null else jsonb_build_object('type',v_before_type,'org',v_before_org,'repo',v_before_repo) end
  );
end;
$$;

revoke all on function public.queue_vercel_git_link_change(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.queue_vercel_git_link_change(uuid, uuid, text, text, boolean) to service_role;
