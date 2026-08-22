-- 20260822100500_add_execution_dispatch_outbox.sql

create table if not exists private.execution_dispatch_outbox (
  id uuid primary key default extensions.uuid_generate_v4(),
  plan_id uuid not null references private.execution_plans(id) on delete restrict,
  status text not null check (status in ('queued', 'claimed', 'provider_submitted', 'verification_pending', 'completed', 'ambiguous', 'failed')),
  worker_identity text,
  provider_operation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists execution_dispatch_outbox_plan_id_idx on private.execution_dispatch_outbox(plan_id);

create or replace function public.enqueue_execution_dispatch(
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch private.execution_dispatch_outbox%rowtype;
  plan private.execution_plans%rowtype;
begin
  perform private.assert_control_service_role();

  select * into plan from private.execution_plans where id = p_plan_id;
  if plan.id is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  insert into private.execution_dispatch_outbox (plan_id, status)
  values (p_plan_id, 'queued')
  returning * into dispatch;

  return jsonb_build_object(
    'id', dispatch.id,
    'planId', dispatch.plan_id,
    'status', dispatch.status
  );
end;
$$;

create or replace function public.claim_execution_dispatch(
  p_worker_identity text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch private.execution_dispatch_outbox%rowtype;
begin
  perform private.assert_control_service_role();

  if p_worker_identity is null or length(p_worker_identity) = 0 then
    raise exception 'worker identity required' using errcode = '22023';
  end if;

  update private.execution_dispatch_outbox
  set status = 'claimed',
      worker_identity = p_worker_identity,
      updated_at = now()
  where id = (
    select id from private.execution_dispatch_outbox
    where status = 'queued'
    order by created_at asc
    for update skip locked
    limit 1
  )
  returning * into dispatch;

  if dispatch.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', dispatch.id,
    'planId', dispatch.plan_id,
    'status', dispatch.status,
    'workerIdentity', dispatch.worker_identity
  );
end;
$$;

create or replace function public.record_provider_submission(
  p_dispatch_id uuid,
  p_provider_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch private.execution_dispatch_outbox%rowtype;
begin
  perform private.assert_control_service_role();

  update private.execution_dispatch_outbox
  set status = 'provider_submitted',
      provider_operation_id = p_provider_operation_id,
      updated_at = now()
  where id = p_dispatch_id and status = 'claimed'
  returning * into dispatch;

  if dispatch.id is null then
    raise exception 'dispatch not found or not claimed' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', dispatch.id,
    'status', dispatch.status
  );
end;
$$;

create or replace function public.record_execution_verification(
  p_dispatch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch private.execution_dispatch_outbox%rowtype;
begin
  perform private.assert_control_service_role();

  update private.execution_dispatch_outbox
  set status = 'verification_pending',
      updated_at = now()
  where id = p_dispatch_id and status in ('claimed', 'provider_submitted')
  returning * into dispatch;

  if dispatch.id is null then
    raise exception 'dispatch not found or invalid status' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', dispatch.id,
    'status', dispatch.status
  );
end;
$$;

create or replace function public.complete_execution_dispatch(
  p_dispatch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch private.execution_dispatch_outbox%rowtype;
begin
  perform private.assert_control_service_role();

  update private.execution_dispatch_outbox
  set status = 'completed',
      updated_at = now()
  where id = p_dispatch_id
  returning * into dispatch;

  if dispatch.id is null then
    raise exception 'dispatch not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', dispatch.id,
    'status', dispatch.status
  );
end;
$$;

create or replace function public.mark_execution_ambiguous(
  p_dispatch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch private.execution_dispatch_outbox%rowtype;
begin
  perform private.assert_control_service_role();

  update private.execution_dispatch_outbox
  set status = 'ambiguous',
      updated_at = now()
  where id = p_dispatch_id
  returning * into dispatch;

  if dispatch.id is null then
    raise exception 'dispatch not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', dispatch.id,
    'status', dispatch.status
  );
end;
$$;

create or replace function public.mark_execution_failed(
  p_dispatch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch private.execution_dispatch_outbox%rowtype;
begin
  perform private.assert_control_service_role();

  update private.execution_dispatch_outbox
  set status = 'failed',
      updated_at = now()
  where id = p_dispatch_id
  returning * into dispatch;

  if dispatch.id is null then
    raise exception 'dispatch not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', dispatch.id,
    'status', dispatch.status
  );
end;
$$;

revoke all on function public.enqueue_execution_dispatch(uuid) from public, anon, authenticated;
revoke all on function public.claim_execution_dispatch(text) from public, anon, authenticated;
revoke all on function public.record_provider_submission(uuid, text) from public, anon, authenticated;
revoke all on function public.record_execution_verification(uuid) from public, anon, authenticated;
revoke all on function public.complete_execution_dispatch(uuid) from public, anon, authenticated;
revoke all on function public.mark_execution_ambiguous(uuid) from public, anon, authenticated;
revoke all on function public.mark_execution_failed(uuid) from public, anon, authenticated;

grant execute on function public.enqueue_execution_dispatch(uuid) to service_role;
grant execute on function public.claim_execution_dispatch(text) to service_role;
grant execute on function public.record_provider_submission(uuid, text) to service_role;
grant execute on function public.record_execution_verification(uuid) to service_role;
grant execute on function public.complete_execution_dispatch(uuid) to service_role;
grant execute on function public.mark_execution_ambiguous(uuid) to service_role;
grant execute on function public.mark_execution_failed(uuid) to service_role;
