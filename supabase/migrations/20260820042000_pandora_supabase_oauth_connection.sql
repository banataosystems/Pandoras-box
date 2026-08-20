-- Pandora Supabase OAuth connection foundation.
-- Secrets remain in Supabase Vault. No OAuth token or PKCE verifier is exposed
-- through owner-facing tables, logs, analytics, or semantic memory.

create table if not exists public.supabase_oauth_sessions (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  verifier_secret_ref text not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint supabase_oauth_sessions_verifier_ref_check
    check (verifier_secret_ref ~ '^vault://[0-9a-fA-F-]{36}$')
);

alter table public.supabase_oauth_sessions enable row level security;
revoke all on table public.supabase_oauth_sessions from public, anon, authenticated;

create index if not exists supabase_oauth_sessions_expiry_idx
  on public.supabase_oauth_sessions (expires_at)
  where consumed_at is null;

create or replace function public.begin_supabase_oauth_session(
  p_organization_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  session_id uuid := extensions.gen_random_uuid();
  raw_state text;
  verifier text;
  challenge text;
  verifier_secret_id uuid;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = p_user_id
      and membership.status::text = 'active'
      and membership.role::text in ('owner', 'admin')
  ) then
    raise exception 'owner or admin membership required' using errcode = '42501';
  end if;

  delete from public.supabase_oauth_sessions
  where expires_at < timezone('utc', now()) - interval '1 day';

  raw_state := rtrim(
    translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'),
    '='
  );
  verifier := rtrim(
    translate(encode(extensions.gen_random_bytes(64), 'base64'), '+/', '-_'),
    '='
  );
  challenge := rtrim(
    translate(
      encode(
        extensions.digest(convert_to(verifier, 'UTF8'), 'sha256'),
        'base64'
      ),
      '+/',
      '-_'
    ),
    '='
  );

  verifier_secret_id := vault.create_secret(
    verifier,
    'pandora_supabase_oauth_pkce_' || session_id::text,
    'One-time PKCE verifier for Pandora Supabase OAuth.',
    null
  );

  insert into public.supabase_oauth_sessions (
    id, organization_id, user_id, state_hash, verifier_secret_ref, expires_at
  ) values (
    session_id,
    p_organization_id,
    p_user_id,
    encode(extensions.digest(convert_to(raw_state, 'UTF8'), 'sha256'), 'hex'),
    'vault://' || verifier_secret_id::text,
    timezone('utc', now()) + interval '10 minutes'
  );

  return jsonb_build_object(
    'sessionId', session_id,
    'state', raw_state,
    'codeChallenge', challenge,
    'expiresAt', timezone('utc', now()) + interval '10 minutes'
  );
end;
$$;

revoke all on function public.begin_supabase_oauth_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_supabase_oauth_session(uuid, uuid)
  to service_role;

create or replace function public.claim_supabase_oauth_session(p_state text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  session_row public.supabase_oauth_sessions%rowtype;
  verifier text;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into session_row
  from public.supabase_oauth_sessions
  where state_hash = encode(
      extensions.digest(convert_to(p_state, 'UTF8'), 'sha256'), 'hex'
    )
    and expires_at > timezone('utc', now())
    and claimed_at is null
    and consumed_at is null
  for update;

  if session_row.id is null then
    raise exception 'oauth session unavailable' using errcode = '22023';
  end if;

  select secret.decrypted_secret into verifier
  from vault.decrypted_secrets secret
  where secret.id = replace(session_row.verifier_secret_ref, 'vault://', '')::uuid;

  if verifier is null then
    raise exception 'oauth verifier unavailable' using errcode = '22023';
  end if;

  update public.supabase_oauth_sessions
  set claimed_at = timezone('utc', now())
  where id = session_row.id;

  return jsonb_build_object(
    'sessionId', session_row.id,
    'organizationId', session_row.organization_id,
    'userId', session_row.user_id,
    'codeVerifier', verifier
  );
end;
$$;

revoke all on function public.claim_supabase_oauth_session(text)
  from public, anon, authenticated;
grant execute on function public.claim_supabase_oauth_session(text)
  to service_role;

create or replace function public.get_supabase_oauth_client_secret()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  resolved_secret text;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select secret.decrypted_secret into resolved_secret
  from vault.decrypted_secrets secret
  where secret.name = 'pandora_supabase_oauth_client_secret'
  order by secret.updated_at desc
  limit 1;

  if resolved_secret is null or length(resolved_secret) < 16 then
    raise exception 'oauth client secret unavailable' using errcode = '22023';
  end if;
  return resolved_secret;
end;
$$;

revoke all on function public.get_supabase_oauth_client_secret()
  from public, anon, authenticated;
grant execute on function public.get_supabase_oauth_client_secret()
  to service_role;

create or replace function public.complete_supabase_oauth_installation(
  p_session_id uuid,
  p_external_account_id text,
  p_display_name text,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer,
  p_organization_slugs text[],
  p_project_refs text[],
  p_discovered_projects jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  session_row public.supabase_oauth_sessions%rowtype;
  installation_id uuid;
  existing_access_ref text;
  existing_refresh_ref text;
  access_secret_id uuid;
  refresh_secret_id uuid;
  account_id text;
  expires_at_value timestamptz;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if coalesce(length(trim(p_external_account_id)), 0) < 1
     or coalesce(length(trim(p_access_token)), 0) < 16
     or coalesce(length(trim(p_refresh_token)), 0) < 16 then
    raise exception 'oauth completion payload invalid' using errcode = '22023';
  end if;

  select * into session_row
  from public.supabase_oauth_sessions
  where id = p_session_id
    and expires_at > timezone('utc', now())
    and claimed_at is not null
    and consumed_at is null
  for update;

  if session_row.id is null then
    raise exception 'oauth session unavailable' using errcode = '22023';
  end if;

  account_id := 'supabase-oauth-' || substr(
    encode(
      extensions.digest(convert_to(p_external_account_id, 'UTF8'), 'sha256'),
      'hex'
    ), 1, 16
  );
  expires_at_value := timezone('utc', now()) +
    make_interval(secs => greatest(coalesce(p_expires_in, 3600), 60));

  select installation.id, credential.secret_ref,
         installation.configuration ->> 'oauth_refresh_secret_ref'
  into installation_id, existing_access_ref, existing_refresh_ref
  from public.connector_installations installation
  left join public.credential_refs credential
    on credential.installation_id = installation.id
   and credential.organization_id = installation.organization_id
  where installation.organization_id = session_row.organization_id
    and installation.provider = 'supabase'
    and installation.external_account_id = p_external_account_id
  limit 1;

  if installation_id is null then
    access_secret_id := vault.create_secret(
      p_access_token,
      'pandora_supabase_oauth_access_' || session_row.organization_id::text,
      'Pandora Supabase OAuth access token.', null
    );
    refresh_secret_id := vault.create_secret(
      p_refresh_token,
      'pandora_supabase_oauth_refresh_' || session_row.organization_id::text,
      'Pandora Supabase OAuth refresh token.', null
    );

    insert into public.connector_installations (
      organization_id, provider, external_account_id, display_name, status,
      scopes, configuration, installed_by, last_health_check_at
    ) values (
      session_row.organization_id,
      'supabase',
      p_external_account_id,
      nullif(trim(p_display_name), ''),
      'active'::public.connector_status,
      array['organizations:read', 'projects:read']::text[],
      jsonb_build_object(
        'auth_mode', 'oauth',
        'account_id', account_id,
        'allow_mutations', false,
        'organization_slugs', to_jsonb(coalesce(p_organization_slugs, array[]::text[])),
        'allowed_project_refs', to_jsonb(coalesce(p_project_refs, array[]::text[])),
        'discovered_projects', coalesce(p_discovered_projects, '[]'::jsonb),
        'oauth_client_id', 'd836261c-ffa5-409b-b614-927a40e30fad',
        'oauth_refresh_secret_ref', 'vault://' || refresh_secret_id::text,
        'oauth_token_expires_at', expires_at_value,
        'connection_priority', 'primary'
      ),
      session_row.user_id,
      timezone('utc', now())
    ) returning id into installation_id;

    insert into public.credential_refs (
      organization_id, installation_id, secret_ref, key_version, expires_at,
      rotation_state
    ) values (
      session_row.organization_id,
      installation_id,
      'vault://' || access_secret_id::text,
      1,
      expires_at_value,
      'current'::public.rotation_status
    );
  else
    if existing_access_ref ~ '^vault://[0-9a-fA-F-]{36}$' then
      access_secret_id := replace(existing_access_ref, 'vault://', '')::uuid;
      perform vault.update_secret(access_secret_id, p_access_token, null, null, null);
    else
      access_secret_id := vault.create_secret(
        p_access_token,
        'pandora_supabase_oauth_access_' || session_row.organization_id::text,
        'Pandora Supabase OAuth access token.', null
      );
    end if;

    if existing_refresh_ref ~ '^vault://[0-9a-fA-F-]{36}$' then
      refresh_secret_id := replace(existing_refresh_ref, 'vault://', '')::uuid;
      perform vault.update_secret(refresh_secret_id, p_refresh_token, null, null, null);
    else
      refresh_secret_id := vault.create_secret(
        p_refresh_token,
        'pandora_supabase_oauth_refresh_' || session_row.organization_id::text,
        'Pandora Supabase OAuth refresh token.', null
      );
    end if;

    update public.connector_installations
    set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
        status = 'active'::public.connector_status,
        scopes = array['organizations:read', 'projects:read']::text[],
        configuration = coalesce(configuration, '{}'::jsonb) || jsonb_build_object(
          'auth_mode', 'oauth',
          'account_id', account_id,
          'allow_mutations', false,
          'organization_slugs', to_jsonb(coalesce(p_organization_slugs, array[]::text[])),
          'allowed_project_refs', to_jsonb(coalesce(p_project_refs, array[]::text[])),
          'discovered_projects', coalesce(p_discovered_projects, '[]'::jsonb),
          'oauth_client_id', 'd836261c-ffa5-409b-b614-927a40e30fad',
          'oauth_refresh_secret_ref', 'vault://' || refresh_secret_id::text,
          'oauth_token_expires_at', expires_at_value,
          'connection_priority', 'primary'
        ),
        last_health_check_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = installation_id;

    insert into public.credential_refs (
      organization_id, installation_id, secret_ref, key_version, expires_at,
      rotation_state
    ) values (
      session_row.organization_id,
      installation_id,
      'vault://' || access_secret_id::text,
      1,
      expires_at_value,
      'current'::public.rotation_status
    ) on conflict (installation_id) do update
      set secret_ref = excluded.secret_ref,
          key_version = credential_refs.key_version + 1,
          expires_at = excluded.expires_at,
          rotation_state = 'current'::public.rotation_status,
          updated_at = timezone('utc', now());
  end if;

  update public.supabase_oauth_sessions
  set consumed_at = timezone('utc', now())
  where id = session_row.id;

  delete from vault.secrets
  where id = replace(session_row.verifier_secret_ref, 'vault://', '')::uuid;

  return jsonb_build_object(
    'installationId', installation_id,
    'accountId', account_id,
    'expiresAt', expires_at_value
  );
end;
$$;

revoke all on function public.complete_supabase_oauth_installation(
  uuid, text, text, text, text, integer, text[], text[], jsonb
) from public, anon, authenticated;
grant execute on function public.complete_supabase_oauth_installation(
  uuid, text, text, text, text, integer, text[], text[], jsonb
) to service_role;

create or replace function public.get_supabase_oauth_refresh_accounts(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  resolved jsonb;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'installationId', installation.id,
      'clientId', installation.configuration ->> 'oauth_client_id',
      'clientSecret', oauth_client.decrypted_secret,
      'refreshToken', refresh_secret.decrypted_secret,
      'expiresAt', credential.expires_at
    ) order by installation.id), '[]'::jsonb)
  into resolved
  from public.connector_installations installation
  join public.credential_refs credential
    on credential.installation_id = installation.id
   and credential.organization_id = installation.organization_id
  join vault.decrypted_secrets refresh_secret
    on installation.configuration ->> 'oauth_refresh_secret_ref'
       ~ '^vault://[0-9a-fA-F-]{36}$'
   and refresh_secret.id = replace(
     installation.configuration ->> 'oauth_refresh_secret_ref',
     'vault://', ''
   )::uuid
  cross join lateral (
    select secret.decrypted_secret
    from vault.decrypted_secrets secret
    where secret.name = 'pandora_supabase_oauth_client_secret'
    order by secret.updated_at desc
    limit 1
  ) oauth_client
  where installation.organization_id = p_organization_id
    and installation.provider = 'supabase'
    and installation.status = 'active'::public.connector_status
    and installation.configuration ->> 'auth_mode' = 'oauth'
    and credential.rotation_state = 'current'::public.rotation_status
    and (
      credential.expires_at is null
      or credential.expires_at <= timezone('utc', now()) + interval '5 minutes'
    );
  return resolved;
end;
$$;

revoke all on function public.get_supabase_oauth_refresh_accounts(uuid)
  from public, anon, authenticated;
grant execute on function public.get_supabase_oauth_refresh_accounts(uuid)
  to service_role;

create or replace function public.rotate_supabase_oauth_tokens(
  p_installation_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  installation_row public.connector_installations%rowtype;
  credential_row public.credential_refs%rowtype;
  refresh_ref text;
  expires_at_value timestamptz;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into installation_row
  from public.connector_installations
  where id = p_installation_id
    and provider = 'supabase'
    and configuration ->> 'auth_mode' = 'oauth'
  for update;
  if installation_row.id is null then
    raise exception 'oauth installation unavailable' using errcode = '22023';
  end if;

  select * into credential_row
  from public.credential_refs
  where installation_id = installation_row.id
  for update;
  if credential_row.id is null
     or credential_row.secret_ref !~ '^vault://[0-9a-fA-F-]{36}$' then
    raise exception 'oauth access credential unavailable' using errcode = '22023';
  end if;

  refresh_ref := installation_row.configuration ->> 'oauth_refresh_secret_ref';
  if refresh_ref !~ '^vault://[0-9a-fA-F-]{36}$' then
    raise exception 'oauth refresh credential unavailable' using errcode = '22023';
  end if;

  perform vault.update_secret(
    replace(credential_row.secret_ref, 'vault://', '')::uuid,
    p_access_token, null, null, null
  );
  perform vault.update_secret(
    replace(refresh_ref, 'vault://', '')::uuid,
    p_refresh_token, null, null, null
  );

  expires_at_value := timezone('utc', now()) +
    make_interval(secs => greatest(coalesce(p_expires_in, 3600), 60));

  update public.credential_refs
  set key_version = key_version + 1,
      expires_at = expires_at_value,
      rotation_state = 'current'::public.rotation_status,
      updated_at = timezone('utc', now())
  where id = credential_row.id;

  update public.connector_installations
  set configuration = configuration ||
        jsonb_build_object('oauth_token_expires_at', expires_at_value),
      last_health_check_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = installation_row.id;

  return jsonb_build_object(
    'installationId', installation_row.id,
    'expiresAt', expires_at_value
  );
end;
$$;

revoke all on function public.rotate_supabase_oauth_tokens(
  uuid, text, text, integer
) from public, anon, authenticated;
grant execute on function public.rotate_supabase_oauth_tokens(
  uuid, text, text, integer
) to service_role;
