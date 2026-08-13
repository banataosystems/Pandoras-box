-- GOVERNED MIGRATION-HISTORY RECOVERY.
-- This filename preserves a production ledger version for clean replay.
-- Production history is never rewritten; live hashes remain in the recovery manifest.
-- SEMANTIC REDACTION: production organization and token-verifier seed omitted.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.runtime_security_configs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  admin_token_hash text not null check (admin_token_hash ~ '^[0-9a-f]{64}$'),
  approval_token_hash text not null check (approval_token_hash ~ '^[0-9a-f]{64}$'),
  allowed_origins text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table private.runtime_security_configs enable row level security;
revoke all on table private.runtime_security_configs from public, anon, authenticated;

-- Production organization/token-verifier seed intentionally replaced.
-- Fresh replays receive database-generated verifier material that never enters Git.
-- Preserve any pre-existing configuration instead of overwriting live credentials.
insert into private.runtime_security_configs (
  organization_id,
  admin_token_hash,
  approval_token_hash,
  allowed_origins,
  updated_at
)
select
  organization.id,
  encode(extensions.gen_random_bytes(32), 'hex'),
  encode(extensions.gen_random_bytes(32), 'hex'),
  '{}'::text[],
  now()
from public.organizations organization
on conflict (organization_id) do nothing;

create or replace function public.get_runtime_security_config(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_config jsonb;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'adminTokenHash', config.admin_token_hash,
    'approvalTokenHash', config.approval_token_hash,
    'allowedOrigins', to_jsonb(config.allowed_origins),
    'updatedAt', config.updated_at
  )
  into resolved_config
  from private.runtime_security_configs config
  where config.organization_id = p_organization_id;

  if resolved_config is null then
    raise exception 'runtime security configuration unavailable' using errcode = 'P0002';
  end if;

  return resolved_config;
end;
$$;

revoke all on function public.get_runtime_security_config(uuid) from public, anon, authenticated;
grant execute on function public.get_runtime_security_config(uuid) to service_role;
