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

insert into private.runtime_security_configs (
  organization_id,
  admin_token_hash,
  approval_token_hash,
  allowed_origins,
  updated_at
)
values (
  '2270b266-59da-4c39-bfd9-9f8d08352af0'::uuid,
  '13a768e6331f487cc647ff3d4ed5d291ee902f82332d5f40bf338787b86d2a8b',
  '01a76422b913c911995aeba13118026e748744073fcd0e2f9f40706fe846f26c',
  array['https://mcpmaster.vercel.app']::text[],
  now()
)
on conflict (organization_id) do update
set admin_token_hash = excluded.admin_token_hash,
    approval_token_hash = excluded.approval_token_hash,
    allowed_origins = excluded.allowed_origins,
    updated_at = now();

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
