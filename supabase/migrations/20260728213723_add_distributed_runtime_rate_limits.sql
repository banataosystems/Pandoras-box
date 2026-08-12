-- GOVERNED MIGRATION-HISTORY RECOVERY.
-- This filename preserves a production ledger version for clean replay.
-- Production history is never rewritten; live hashes remain in the recovery manifest.
-- Semantic recovery of the provider-recorded SQL payload; comments and terminal newline may differ.

create table if not exists public.runtime_rate_limit_buckets (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, key_hash, window_started_at)
);

comment on table public.runtime_rate_limit_buckets is
  'Privacy-preserving distributed runtime request counters keyed by SHA-256 digest and fixed time window.';

alter table public.runtime_rate_limit_buckets enable row level security;

revoke all on table public.runtime_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.runtime_rate_limit_buckets to service_role;

create or replace function public.consume_runtime_rate_limit(
  p_organization_id uuid,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  observed_at timestamptz := clock_timestamp();
  bucket_started_at timestamptz;
  next_count integer;
  reset_at timestamptz;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rate limit key hash' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid rate limit window' using errcode = '22023';
  end if;

  bucket_started_at := to_timestamp(
    floor(extract(epoch from observed_at) / p_window_seconds) * p_window_seconds
  );
  reset_at := bucket_started_at + make_interval(secs => p_window_seconds);

  insert into public.runtime_rate_limit_buckets (
    organization_id,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_organization_id,
    p_key_hash,
    bucket_started_at,
    1,
    observed_at
  )
  on conflict (organization_id, key_hash, window_started_at)
  do update set
    request_count = public.runtime_rate_limit_buckets.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into next_count;

  delete from public.runtime_rate_limit_buckets
  where organization_id = p_organization_id
    and window_started_at < observed_at - interval '1 day';

  return jsonb_build_object(
    'allowed', next_count <= p_limit,
    'limit', p_limit,
    'remaining', greatest(p_limit - next_count, 0),
    'count', next_count,
    'resetAt', reset_at,
    'windowSeconds', p_window_seconds
  );
end;
$$;

revoke all on function public.consume_runtime_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_runtime_rate_limit(uuid, text, integer, integer)
  to service_role;
