create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.execution_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  tool text not null check (length(tool) between 1 and 200),
  risk text not null check (risk in ('read', 'write', 'destructive')),
  args jsonb not null default '{}'::jsonb check (jsonb_typeof(args) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (
    status in ('pending_approval', 'approved', 'executing', 'completed', 'failed', 'expired')
  ),
  expires_at timestamptz not null,
  approved_at timestamptz,
  approved_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error text,
  result_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_id)
);

create index if not exists execution_plans_org_created_idx
  on private.execution_plans (organization_id, created_at desc);

create index if not exists execution_plans_org_status_idx
  on private.execution_plans (organization_id, status, expires_at);

create table if not exists private.execution_audit_chain_state (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_sequence bigint not null default 0,
  last_hash text not null default repeat('0', 64)
    check (last_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create table if not exists private.execution_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence bigint not null,
  plan_id uuid references private.execution_plans(id) on delete set null,
  request_id uuid,
  event_type text not null,
  status text not null,
  tool text,
  risk text check (risk is null or risk in ('read', 'write', 'destructive')),
  payload_hash text check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$'),
  details jsonb not null default '{}'::jsonb,
  previous_hash text not null check (previous_hash ~ '^[0-9a-f]{64}$'),
  event_hash text not null check (event_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now(),
  unique (organization_id, sequence),
  unique (organization_id, event_hash)
);

create index if not exists execution_audit_org_sequence_idx
  on private.execution_audit_events (organization_id, sequence desc);

alter table private.execution_plans enable row level security;
alter table private.execution_audit_chain_state enable row level security;
alter table private.execution_audit_events enable row level security;

revoke all on table private.execution_plans from public, anon, authenticated;
revoke all on table private.execution_audit_chain_state from public, anon, authenticated;
revoke all on table private.execution_audit_events from public, anon, authenticated;

create or replace function private.assert_control_service_role()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_control_service_role() from public, anon, authenticated;

create or replace function private.append_execution_audit(
  p_organization_id uuid,
  p_plan_id uuid,
  p_request_id uuid,
  p_event_type text,
  p_status text,
  p_tool text,
  p_risk text,
  p_payload_hash text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  chain private.execution_audit_chain_state%rowtype;
  next_sequence bigint;
  normalized_details jsonb := coalesce(p_details, '{}'::jsonb);
  occurred timestamptz := clock_timestamp();
  canonical text;
  next_hash text;
begin
  perform private.assert_control_service_role();

  insert into private.execution_audit_chain_state (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select *
  into chain
  from private.execution_audit_chain_state
  where organization_id = p_organization_id
  for update;

  next_sequence := chain.last_sequence + 1;
  canonical := concat_ws(
    '|',
    p_organization_id::text,
    next_sequence::text,
    coalesce(p_plan_id::text, ''),
    coalesce(p_request_id::text, ''),
    p_event_type,
    p_status,
    coalesce(p_tool, ''),
    coalesce(p_risk, ''),
    coalesce(p_payload_hash, ''),
    normalized_details::text,
    occurred::text,
    chain.last_hash
  );
  next_hash := encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex');

  insert into private.execution_audit_events (
    organization_id,
    sequence,
    plan_id,
    request_id,
    event_type,
    status,
    tool,
    risk,
    payload_hash,
    details,
    previous_hash,
    event_hash,
    occurred_at
  )
  values (
    p_organization_id,
    next_sequence,
    p_plan_id,
    p_request_id,
    p_event_type,
    p_status,
    p_tool,
    p_risk,
    p_payload_hash,
    normalized_details,
    chain.last_hash,
    next_hash,
    occurred
  );

  update private.execution_audit_chain_state
  set last_sequence = next_sequence,
      last_hash = next_hash,
      updated_at = occurred
  where organization_id = p_organization_id;

  return jsonb_build_object(
    'sequence', next_sequence,
    'previousHash', chain.last_hash,
    'eventHash', next_hash,
    'occurredAt', occurred
  );
end;
$$;

revoke all on function private.append_execution_audit(
  uuid, uuid, uuid, text, text, text, text, text, jsonb
) from public, anon, authenticated;

create or replace function public.create_execution_plan(
  p_organization_id uuid,
  p_request_id uuid,
  p_tool text,
  p_risk text,
  p_args jsonb,
  p_payload_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created private.execution_plans%rowtype;
  initial_status text;
begin
  perform private.assert_control_service_role();

  if p_risk not in ('read', 'write', 'destructive') then
    raise exception 'invalid risk' using errcode = '22023';
  end if;
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_args, '{}'::jsonb)) <> 'object' then
    raise exception 'args must be an object' using errcode = '22023';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 minutes' then
    raise exception 'invalid plan expiry' using errcode = '22023';
  end if;

  initial_status := case when p_risk = 'read' then 'approved' else 'pending_approval' end;

  insert into private.execution_plans (
    organization_id,
    request_id,
    tool,
    risk,
    args,
    payload_hash,
    status,
    expires_at,
    approved_at,
    approved_by
  )
  values (
    p_organization_id,
    p_request_id,
    p_tool,
    p_risk,
    coalesce(p_args, '{}'::jsonb),
    p_payload_hash,
    initial_status,
    p_expires_at,
    case when p_risk = 'read' then now() else null end,
    case when p_risk = 'read' then 'system:auto-read' else null end
  )
  returning * into created;

  perform private.append_execution_audit(
    p_organization_id,
    created.id,
    created.request_id,
    'plan_created',
    created.status,
    created.tool,
    created.risk,
    created.payload_hash,
    jsonb_build_object('expiresAt', created.expires_at)
  );

  return jsonb_build_object(
    'planId', created.id,
    'requestId', created.request_id,
    'tool', created.tool,
    'risk', created.risk,
    'payloadHash', created.payload_hash,
    'status', created.status,
    'expiresAt', created.expires_at,
    'createdAt', created.created_at
  );
end;
$$;

create or replace function public.approve_execution_plan(
  p_organization_id uuid,
  p_plan_id uuid,
  p_approved_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan private.execution_plans%rowtype;
begin
  perform private.assert_control_service_role();

  select *
  into plan
  from private.execution_plans
  where id = p_plan_id and organization_id = p_organization_id
  for update;

  if plan.id is null then
    raise exception 'execution plan not found' using errcode = 'P0002';
  end if;

  if plan.expires_at <= now() and plan.status in ('pending_approval', 'approved') then
    update private.execution_plans
    set status = 'expired', updated_at = now()
    where id = plan.id
    returning * into plan;

    perform private.append_execution_audit(
      p_organization_id, plan.id, plan.request_id, 'plan_expired', plan.status,
      plan.tool, plan.risk, plan.payload_hash, '{}'::jsonb
    );
    return jsonb_build_object('planId', plan.id, 'status', plan.status, 'expiresAt', plan.expires_at);
  end if;

  if plan.risk = 'read' or plan.status = 'approved' then
    return jsonb_build_object(
      'planId', plan.id,
      'requestId', plan.request_id,
      'status', plan.status,
      'approvedAt', plan.approved_at,
      'expiresAt', plan.expires_at
    );
  end if;

  if plan.status <> 'pending_approval' then
    raise exception 'execution plan cannot be approved from status %', plan.status using errcode = '55000';
  end if;

  update private.execution_plans
  set status = 'approved',
      approved_at = now(),
      approved_by = left(coalesce(p_approved_by, 'admin'), 200),
      updated_at = now()
  where id = plan.id
  returning * into plan;

  perform private.append_execution_audit(
    p_organization_id, plan.id, plan.request_id, 'plan_approved', plan.status,
    plan.tool, plan.risk, plan.payload_hash,
    jsonb_build_object('approvedBy', plan.approved_by)
  );

  return jsonb_build_object(
    'planId', plan.id,
    'requestId', plan.request_id,
    'status', plan.status,
    'approvedAt', plan.approved_at,
    'expiresAt', plan.expires_at
  );
end;
$$;

create or replace function public.claim_execution_plan(
  p_organization_id uuid,
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan private.execution_plans%rowtype;
begin
  perform private.assert_control_service_role();

  select *
  into plan
  from private.execution_plans
  where id = p_plan_id and organization_id = p_organization_id
  for update;

  if plan.id is null then
    raise exception 'execution plan not found' using errcode = 'P0002';
  end if;

  if plan.expires_at <= now() and plan.status in ('pending_approval', 'approved') then
    update private.execution_plans
    set status = 'expired', updated_at = now()
    where id = plan.id
    returning * into plan;

    perform private.append_execution_audit(
      p_organization_id, plan.id, plan.request_id, 'plan_expired', plan.status,
      plan.tool, plan.risk, plan.payload_hash, '{}'::jsonb
    );
    raise exception 'execution plan expired' using errcode = '55000';
  end if;

  if plan.status <> 'approved' then
    raise exception 'execution plan is not claimable from status %', plan.status using errcode = '55000';
  end if;

  update private.execution_plans
  set status = 'executing', claimed_at = now(), updated_at = now()
  where id = plan.id
  returning * into plan;

  perform private.append_execution_audit(
    p_organization_id, plan.id, plan.request_id, 'plan_claimed', plan.status,
    plan.tool, plan.risk, plan.payload_hash, '{}'::jsonb
  );

  return jsonb_build_object(
    'planId', plan.id,
    'requestId', plan.request_id,
    'tool', plan.tool,
    'risk', plan.risk,
    'args', plan.args,
    'payloadHash', plan.payload_hash,
    'status', plan.status,
    'expiresAt', plan.expires_at,
    'claimedAt', plan.claimed_at
  );
end;
$$;

create or replace function public.finish_execution_plan(
  p_organization_id uuid,
  p_plan_id uuid,
  p_status text,
  p_duration_ms integer,
  p_error text,
  p_result_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan private.execution_plans%rowtype;
  final_status text;
begin
  perform private.assert_control_service_role();

  if p_status not in ('completed', 'failed') then
    raise exception 'invalid final status' using errcode = '22023';
  end if;

  select *
  into plan
  from private.execution_plans
  where id = p_plan_id and organization_id = p_organization_id
  for update;

  if plan.id is null then
    raise exception 'execution plan not found' using errcode = 'P0002';
  end if;
  if plan.status <> 'executing' then
    raise exception 'execution plan cannot finish from status %', plan.status using errcode = '55000';
  end if;

  final_status := p_status;

  update private.execution_plans
  set status = final_status,
      completed_at = now(),
      duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
      error = case when final_status = 'failed' then left(coalesce(p_error, 'execution failed'), 2000) else null end,
      result_summary = case when final_status = 'completed' then coalesce(p_result_summary, '{}'::jsonb) else null end,
      updated_at = now()
  where id = plan.id
  returning * into plan;

  perform private.append_execution_audit(
    p_organization_id, plan.id, plan.request_id, 'plan_finished', plan.status,
    plan.tool, plan.risk, plan.payload_hash,
    jsonb_strip_nulls(jsonb_build_object(
      'durationMs', plan.duration_ms,
      'error', plan.error,
      'resultSummary', plan.result_summary
    ))
  );

  return jsonb_build_object(
    'planId', plan.id,
    'requestId', plan.request_id,
    'status', plan.status,
    'completedAt', plan.completed_at,
    'durationMs', plan.duration_ms
  );
end;
$$;

create or replace function public.list_execution_audit(
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
    select jsonb_agg(event_row order by (event_row ->> 'sequence')::bigint desc)
    from (
      select jsonb_build_object(
        'sequence', event.sequence,
        'planId', event.plan_id,
        'requestId', event.request_id,
        'eventType', event.event_type,
        'status', event.status,
        'tool', event.tool,
        'risk', event.risk,
        'payloadHash', event.payload_hash,
        'details', event.details,
        'previousHash', event.previous_hash,
        'eventHash', event.event_hash,
        'occurredAt', event.occurred_at
      ) as event_row
      from private.execution_audit_events event
      where event.organization_id = p_organization_id
      order by event.sequence desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) listed
  ), '[]'::jsonb);
end;
$$;

create or replace function public.verify_execution_audit_chain(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event private.execution_audit_events%rowtype;
  expected_previous text := repeat('0', 64);
  expected_sequence bigint := 1;
  canonical text;
  expected_hash text;
begin
  perform private.assert_control_service_role();

  for event in
    select *
    from private.execution_audit_events
    where organization_id = p_organization_id
    order by sequence asc
  loop
    if event.sequence <> expected_sequence or event.previous_hash <> expected_previous then
      return jsonb_build_object(
        'valid', false,
        'failedSequence', event.sequence,
        'reason', 'sequence_or_previous_hash_mismatch'
      );
    end if;

    canonical := concat_ws(
      '|',
      event.organization_id::text,
      event.sequence::text,
      coalesce(event.plan_id::text, ''),
      coalesce(event.request_id::text, ''),
      event.event_type,
      event.status,
      coalesce(event.tool, ''),
      coalesce(event.risk, ''),
      coalesce(event.payload_hash, ''),
      event.details::text,
      event.occurred_at::text,
      event.previous_hash
    );
    expected_hash := encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex');

    if expected_hash <> event.event_hash then
      return jsonb_build_object(
        'valid', false,
        'failedSequence', event.sequence,
        'reason', 'event_hash_mismatch'
      );
    end if;

    expected_previous := event.event_hash;
    expected_sequence := expected_sequence + 1;
  end loop;

  return jsonb_build_object(
    'valid', true,
    'eventCount', expected_sequence - 1,
    'lastHash', expected_previous
  );
end;
$$;

revoke all on function public.create_execution_plan(
  uuid, uuid, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.approve_execution_plan(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_execution_plan(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_execution_plan(
  uuid, uuid, text, integer, text, jsonb
) from public, anon, authenticated;
revoke all on function public.list_execution_audit(uuid, integer) from public, anon, authenticated;
revoke all on function public.verify_execution_audit_chain(uuid) from public, anon, authenticated;

grant execute on function public.create_execution_plan(
  uuid, uuid, text, text, jsonb, text, timestamptz
) to service_role;
grant execute on function public.approve_execution_plan(uuid, uuid, text) to service_role;
grant execute on function public.claim_execution_plan(uuid, uuid) to service_role;
grant execute on function public.finish_execution_plan(
  uuid, uuid, text, integer, text, jsonb
) to service_role;
grant execute on function public.list_execution_audit(uuid, integer) to service_role;
grant execute on function public.verify_execution_audit_chain(uuid) to service_role;
