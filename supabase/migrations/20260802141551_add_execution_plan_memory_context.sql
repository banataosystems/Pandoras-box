-- GOVERNED MIGRATION-HISTORY RECOVERY.
-- This filename preserves a production ledger version for clean replay.
-- Production history is never rewritten; live hashes remain in the recovery manifest.
-- Semantic recovery of the provider-recorded SQL payload; comments and terminal newline may differ.

create table if not exists private.execution_plan_contexts (
  plan_id uuid primary key references private.execution_plans(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  context_hash text not null check (context_hash ~ '^[0-9a-f]{64}$'),
  context_status text not null check (context_status in ('available', 'empty', 'unavailable')),
  namespace text not null check (namespace = 'real_life'),
  context_envelope jsonb not null check (
    jsonb_typeof(context_envelope) = 'object'
    and octet_length(context_envelope::text) <= 32768
  ),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_id)
);

create index if not exists execution_plan_contexts_org_recorded_idx
  on private.execution_plan_contexts (organization_id, recorded_at desc);

alter table private.execution_plan_contexts enable row level security;
revoke all on table private.execution_plan_contexts from public, anon, authenticated;

create or replace function public.attach_execution_plan_context(
  p_organization_id uuid,
  p_plan_id uuid,
  p_request_id uuid,
  p_context_hash text,
  p_context_envelope jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan private.execution_plans%rowtype;
  context_row private.execution_plan_contexts%rowtype;
  context_status text;
  context_namespace text;
  context_counts jsonb;
  warning_count integer;
begin
  perform private.assert_control_service_role();

  if p_context_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid context hash' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_context_envelope, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_context_envelope, '{}'::jsonb)::text) > 32768 then
    raise exception 'invalid context envelope' using errcode = '22023';
  end if;
  if p_context_envelope ->> 'schemaVersion' <> '1.0.0'
     or p_context_envelope ->> 'source' <> 'pandora-memory'
     or jsonb_typeof(p_context_envelope -> 'queryBasis') <> 'object'
     or jsonb_typeof(p_context_envelope -> 'counts') <> 'object'
     or jsonb_typeof(p_context_envelope -> 'highlights') <> 'object'
     or jsonb_typeof(p_context_envelope -> 'warnings') <> 'array'
     or nullif(p_context_envelope ->> 'retrievedAt', '') is null then
    raise exception 'invalid context envelope contract' using errcode = '22023';
  end if;
  if jsonb_typeof(p_context_envelope #> '{counts,projectContext}') <> 'number'
     or jsonb_typeof(p_context_envelope #> '{counts,riskWarnings}') <> 'number'
     or jsonb_typeof(p_context_envelope #> '{counts,openLoops}') <> 'number'
     or jsonb_typeof(p_context_envelope #> '{counts,recentEvents}') <> 'number'
     or jsonb_typeof(p_context_envelope #> '{counts,semanticMatches}') <> 'number' then
    raise exception 'invalid context counts' using errcode = '22023';
  end if;

  context_status := p_context_envelope ->> 'status';
  context_namespace := p_context_envelope ->> 'namespace';
  if context_status not in ('available', 'empty', 'unavailable') then
    raise exception 'invalid context status' using errcode = '22023';
  end if;
  if context_namespace <> 'real_life' then
    raise exception 'invalid context namespace' using errcode = '22023';
  end if;
  if coalesce(p_context_envelope ->> 'queryHash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid context query hash' using errcode = '22023';
  end if;

  context_counts := jsonb_build_object(
    'projectContext', (p_context_envelope #>> '{counts,projectContext}')::integer,
    'riskWarnings', (p_context_envelope #>> '{counts,riskWarnings}')::integer,
    'openLoops', (p_context_envelope #>> '{counts,openLoops}')::integer,
    'recentEvents', (p_context_envelope #>> '{counts,recentEvents}')::integer,
    'semanticMatches', (p_context_envelope #>> '{counts,semanticMatches}')::integer
  );
  if exists (
    select 1
    from jsonb_each_text(context_counts) count_value
    where count_value.value::integer < 0 or count_value.value::integer > 50
  ) then
    raise exception 'invalid context counts' using errcode = '22023';
  end if;
  warning_count := jsonb_array_length(p_context_envelope -> 'warnings');
  if warning_count > 10 then
    raise exception 'invalid context warnings' using errcode = '22023';
  end if;

  select * into plan
  from private.execution_plans
  where id = p_plan_id
    and organization_id = p_organization_id
    and request_id = p_request_id
  for update;

  if plan.id is null then
    raise exception 'execution plan not found' using errcode = 'P0002';
  end if;

  select * into context_row
  from private.execution_plan_contexts
  where plan_id = plan.id
  for update;

  if context_row.plan_id is not null and context_row.context_hash = p_context_hash then
    return jsonb_build_object(
      'planId', context_row.plan_id,
      'requestId', context_row.request_id,
      'contextHash', context_row.context_hash,
      'status', context_row.context_status,
      'namespace', context_row.namespace,
      'recordedAt', context_row.recorded_at
    );
  end if;

  insert into private.execution_plan_contexts (
    plan_id,
    organization_id,
    request_id,
    context_hash,
    context_status,
    namespace,
    context_envelope
  ) values (
    plan.id,
    p_organization_id,
    p_request_id,
    p_context_hash,
    context_status,
    context_namespace,
    p_context_envelope
  )
  on conflict (plan_id) do update set
    context_hash = excluded.context_hash,
    context_status = excluded.context_status,
    namespace = excluded.namespace,
    context_envelope = excluded.context_envelope,
    recorded_at = now(),
    updated_at = now()
  returning * into context_row;

  perform private.append_execution_audit(
    p_organization_id,
    plan.id,
    plan.request_id,
    'plan_context_attached',
    plan.status,
    plan.tool,
    plan.risk,
    plan.payload_hash,
    jsonb_build_object(
      'contextHash', context_row.context_hash,
      'contextStatus', context_row.context_status,
      'namespace', context_row.namespace,
      'retrievedAt', p_context_envelope ->> 'retrievedAt',
      'counts', context_counts,
      'warningCount', warning_count
    )
  );

  return jsonb_build_object(
    'planId', context_row.plan_id,
    'requestId', context_row.request_id,
    'contextHash', context_row.context_hash,
    'status', context_row.context_status,
    'namespace', context_row.namespace,
    'recordedAt', context_row.recorded_at
  );
end;
$$;

revoke all on function public.attach_execution_plan_context(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.attach_execution_plan_context(uuid, uuid, uuid, text, jsonb)
  to service_role;

create or replace function public.list_execution_plans(
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_control_service_role();

  return coalesce((
    select jsonb_agg(plan_row order by (plan_row ->> 'createdAt')::timestamptz desc)
    from (
      select jsonb_strip_nulls(jsonb_build_object(
        'planId', plan.id,
        'requestId', plan.request_id,
        'tool', plan.tool,
        'risk', plan.risk,
        'args', plan.args,
        'payloadHash', plan.payload_hash,
        'status', case
          when plan.status in ('pending_approval', 'approved') and plan.expires_at <= now()
            then 'expired'
          else plan.status
        end,
        'expiresAt', plan.expires_at,
        'createdAt', plan.created_at,
        'approvedAt', plan.approved_at,
        'claimedAt', plan.claimed_at,
        'completedAt', plan.completed_at,
        'durationMs', plan.duration_ms,
        'memoryContext', context.context_envelope,
        'memoryContextHash', context.context_hash,
        'memoryContextRecorded', case when context.plan_id is null then null else true end
      )) as plan_row
      from private.execution_plans plan
      left join private.execution_plan_contexts context on context.plan_id = plan.id
      where plan.organization_id = p_organization_id
      order by plan.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_execution_plans(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_execution_plans(uuid, integer)
  to service_role;
