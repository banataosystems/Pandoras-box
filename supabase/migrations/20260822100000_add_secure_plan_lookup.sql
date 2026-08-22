-- SECURITY DEFINER RPC to resolve execution plan privately for the memory broker.
-- This does NOT accept an organization ID. It returns the organization ID directly
-- from the authoritative private.execution_plans record, allowing the broker
-- to securely enforce membership.

create or replace function public.resolve_execution_plan_securely(
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_rec record;
begin
  perform private.assert_control_service_role();

  select
    organization_id,
    request_id,
    intake_id,
    tool,
    risk,
    args,
    payload_hash,
    status,
    expires_at
  into plan_rec
  from private.execution_plans
  where id = p_plan_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'organization_id', plan_rec.organization_id,
    'request_id', plan_rec.request_id,
    'intake_id', plan_rec.intake_id,
    'tool', plan_rec.tool,
    'risk', plan_rec.risk,
    'args', coalesce(plan_rec.args, '{}'::jsonb),
    'payload_hash', plan_rec.payload_hash,
    'status', plan_rec.status,
    'expires_at', plan_rec.expires_at
  );
end;
$$;

revoke all on function public.resolve_execution_plan_securely(uuid) from public, anon, authenticated;
grant execute on function public.resolve_execution_plan_securely(uuid) to service_role;
