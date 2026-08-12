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
      select jsonb_build_object(
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
        'durationMs', plan.duration_ms
      ) as plan_row
      from private.execution_plans plan
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
