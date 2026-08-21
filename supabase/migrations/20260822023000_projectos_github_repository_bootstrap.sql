-- Pandora Project Bootstrap: register a newly created GitHub repository only
-- after the provider confirms creation. This migration is source-only until a
-- separately authorized production application.

create or replace function public.register_github_repository_bootstrap(
  p_organization_id uuid,
  p_account_id text,
  p_stage text,
  p_owner text,
  p_repo text,
  p_repository_id text,
  p_repository_url text,
  p_project_key text,
  p_project_name text,
  p_intent text default null,
  p_builder_issue_number integer default null,
  p_builder_issue_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_installation public.connector_installations%rowtype;
  v_active_count integer;
  v_allowed jsonb;
  v_full_name text := trim(p_owner) || '/' || trim(p_repo);
  v_project_id uuid;
  v_phase_id uuid;
  v_task_id uuid;
  v_intake jsonb;
  v_task_status text;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_stage not in ('created', 'builder_dispatched') then
    raise exception 'invalid bootstrap stage' using errcode = '22023';
  end if;
  if p_account_id !~ '^[a-z][a-z0-9_-]{1,63}$'
     or p_owner !~ '^[A-Za-z0-9_.-]+$'
     or p_repo !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
     or p_repository_id !~ '^\d+$'
     or p_project_key !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     or char_length(trim(p_project_name)) not between 1 and 160
     or p_repository_url <> ('https://github.com/' || v_full_name)
     or char_length(coalesce(p_intent, '')) > 20000 then
    raise exception 'invalid repository bootstrap input' using errcode = '22023';
  end if;
  if p_stage = 'builder_dispatched'
     and (p_builder_issue_number is null
       or p_builder_issue_number <= 0
       or p_builder_issue_url <> ('https://github.com/' || v_full_name || '/issues/' || p_builder_issue_number::text)) then
    raise exception 'invalid builder dispatch input' using errcode = '22023';
  end if;

  select count(*) into v_active_count
  from public.connector_installations installation
  where installation.organization_id = p_organization_id
    and installation.provider = 'github'
    and installation.status = 'active'::public.connector_status;
  if v_active_count <> 1 then
    raise exception 'exactly one active GitHub connector account is required' using errcode = '55000';
  end if;

  select * into strict v_installation
  from public.connector_installations installation
  where installation.organization_id = p_organization_id
    and installation.provider = 'github'
    and installation.status = 'active'::public.connector_status
    and coalesce(nullif(installation.configuration ->> 'account_id', ''), installation.id::text) = p_account_id;

  if lower(coalesce(v_installation.configuration ->> 'login', '')) <> lower(trim(p_owner)) then
    raise exception 'repository owner does not match configured GitHub login' using errcode = '42501';
  end if;

  v_allowed := coalesce(v_installation.configuration -> 'allowed_repositories', '[]'::jsonb);
  if jsonb_typeof(v_allowed) <> 'array' then
    raise exception 'GitHub allowed repository configuration is invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements_text(v_allowed) item(value)
    where lower(item.value) = lower(v_full_name)
  ) then
    update public.connector_installations
    set configuration = jsonb_set(
          configuration,
          '{allowed_repositories}',
          v_allowed || jsonb_build_array(v_full_name),
          true
        ),
        updated_at = timezone('utc', now())
    where id = v_installation.id
      and organization_id = p_organization_id;
  end if;

  perform public.projectos_register_project(
    p_organization_id,
    p_project_key,
    trim(p_project_name),
    v_full_name,
    'Owner-created project bootstrapped by Pandora.',
    null
  );

  select project.id into strict v_project_id
  from public.projectos_projects project
  where project.organization_id = p_organization_id
    and project.project_key = p_project_key;

  if nullif(trim(coalesce(p_intent, '')), '') is not null then
    select public.projectos_accept_intake(
      p_organization_id,
      null,
      trim(p_intent),
      p_project_key,
      trim(p_project_name),
      v_full_name,
      'work',
      'api',
      'bootstrap:' || p_repository_id
    ) into v_intake;
  end if;

  insert into public.projectos_project_resources (
    organization_id, project_id, provider, resource_type, external_id,
    external_name, canonical_url, binding_state, configuration, verified_at
  ) values (
    p_organization_id, v_project_id, 'github', 'repository', p_repository_id,
    v_full_name, p_repository_url, 'verified',
    jsonb_build_object(
      'access', 'read_write',
      'bootstrappedBy', 'pandora',
      'projectKey', p_project_key
    ),
    timezone('utc', now())
  )
  on conflict (project_id, provider, resource_type, external_id) do update set
    external_name = excluded.external_name,
    canonical_url = excluded.canonical_url,
    binding_state = 'verified',
    configuration = public.projectos_project_resources.configuration || excluded.configuration,
    verified_at = excluded.verified_at,
    updated_at = timezone('utc', now());

  insert into private.project_resource_bindings (
    repo_full_name, github_access, supabase_project_ref, supabase_project_name,
    database_binding_state, vercel_team_id, vercel_project_id, vercel_project_name,
    vercel_binding_state, canonical_domain, notes, verified_at, updated_at, source_status
  ) values (
    v_full_name, 'read_write', null, null,
    'not_identified', null, null, null,
    'not_identified', null,
    'Pandora-created repository. Database and deployment providers are not identified and must not be guessed.',
    timezone('utc', now()), timezone('utc', now()), 'active'
  )
  on conflict (repo_full_name) do update set
    github_access = 'read_write',
    database_binding_state = case
      when private.project_resource_bindings.supabase_project_ref is null then 'not_identified'
      else private.project_resource_bindings.database_binding_state
    end,
    vercel_binding_state = case
      when private.project_resource_bindings.vercel_project_id is null then 'not_identified'
      else private.project_resource_bindings.vercel_binding_state
    end,
    notes = excluded.notes,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at,
    source_status = 'active';

  insert into public.projectos_phases (
    organization_id, project_id, phase_key, name, sequence, status,
    exit_criteria, started_at
  ) values (
    p_organization_id, v_project_id, 'build', 'Build', 0, 'active',
    jsonb_build_array(
      'Owner intent is implemented on a non-production branch.',
      'Tests pass on the exact candidate.',
      'A reviewable pull request exists before merge or release.'
    ),
    timezone('utc', now())
  )
  on conflict (project_id, phase_key) do update set
    status = case when public.projectos_phases.status = 'complete' then 'complete' else 'active' end,
    exit_criteria = excluded.exit_criteria,
    started_at = coalesce(public.projectos_phases.started_at, excluded.started_at),
    updated_at = timezone('utc', now())
  returning id into v_phase_id;

  insert into public.projectos_tasks (
    organization_id, project_id, phase_id, task_key, title, description,
    sequence, priority, status, continuation_role, blocks_phase_exit,
    risk_class, completion_criteria
  ) values (
    p_organization_id, v_project_id, v_phase_id, 'initial-build',
    'Build the owner-requested first working version',
    'Implement the sanitized owner brief incrementally and produce a tested, reviewable candidate.',
    0, 100, 'ready', 'primary', true, 'R2',
    jsonb_build_array(
      'Implementation exists on a branch.',
      'Relevant automated tests pass.',
      'A candidate pull request is opened without merging or production deployment.'
    )
  )
  on conflict (project_id, task_key) do update set
    phase_id = excluded.phase_id,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = case
      when public.projectos_tasks.status in ('in_progress','waiting_review','waiting_approval','complete','cancelled')
        then public.projectos_tasks.status
      else 'ready'
    end,
    completion_criteria = excluded.completion_criteria,
    updated_at = timezone('utc', now())
  returning id, status into v_task_id, v_task_status;

  if p_stage = 'builder_dispatched' then
    update public.projectos_tasks
    set status = case when status in ('complete','cancelled') then status else 'in_progress' end,
        builder_agent = 'Google Jules',
        builder_vendor = 'Google',
        started_at = coalesce(started_at, timezone('utc', now())),
        result_summary = result_summary || jsonb_build_object(
          'builderIssueNumber', p_builder_issue_number,
          'builderIssueUrl', p_builder_issue_url,
          'dispatchStatus', 'dispatched'
        ),
        updated_at = timezone('utc', now())
    where id = v_task_id
    returning status into v_task_status;
  end if;

  update public.projectos_projects
  set repository = v_full_name,
      current_phase_key = 'build',
      current_task_key = 'initial-build',
      status = case when status = 'archived' then status else 'active' end,
      last_reconciled_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_project_id;

  return jsonb_build_object(
    'projectId', v_project_id,
    'projectKey', p_project_key,
    'repository', v_full_name,
    'repositoryId', p_repository_id,
    'stage', p_stage,
    'taskId', v_task_id,
    'taskStatus', v_task_status,
    'builderIssueNumber', p_builder_issue_number,
    'builderIssueUrl', p_builder_issue_url,
    'intakeId', v_intake #>> '{intake,id}',
    'registered', true
  );
end;
$$;

revoke all on function public.register_github_repository_bootstrap(
  uuid,text,text,text,text,text,text,text,text,text,integer,text
) from public, anon, authenticated;
grant execute on function public.register_github_repository_bootstrap(
  uuid,text,text,text,text,text,text,text,text,text,integer,text
) to service_role;

comment on function public.register_github_repository_bootstrap(
  uuid,text,text,text,text,text,text,text,text,text,integer,text
) is 'Service-role-only ProjectOS registration for an already-created GitHub repository. It never creates Supabase/Vercel resources and never authorizes merge or production release.';
