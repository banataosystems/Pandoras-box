-- GOVERNED MIGRATION-HISTORY RECOVERY.
-- This filename preserves a production ledger version for clean replay.
-- Production history is never rewritten; live hashes remain in the recovery manifest.
-- Semantic recovery of the provider-recorded SQL payload; comments and terminal newline may differ.

create or replace function public.reconcile_expired_execution_plans(
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  plan private.execution_plans%rowtype;
  reconciled_count integer := 0;
  reconciled_ids uuid[] := '{}';
  bounded_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform private.assert_control_service_role();

  for plan in
    select ep.*
    from private.execution_plans ep
    where ep.organization_id = p_organization_id
      and ep.status in ('pending_approval', 'approved')
      and ep.expires_at <= now()
    order by ep.expires_at asc, ep.id asc
    for update skip locked
    limit bounded_limit
  loop
    update private.execution_plans
    set status = 'expired',
        updated_at = now()
    where id = plan.id
      and organization_id = p_organization_id
      and status in ('pending_approval', 'approved')
      and expires_at <= now();

    if found then
      perform private.append_execution_audit(
        p_organization_id,
        plan.id,
        plan.request_id,
        'plan_expired',
        'expired',
        plan.tool,
        plan.risk,
        plan.payload_hash,
        jsonb_build_object(
          'reason', 'automatic_reconciliation',
          'previousStatus', plan.status,
          'expiresAt', plan.expires_at
        )
      );
      reconciled_count := reconciled_count + 1;
      reconciled_ids := array_append(reconciled_ids, plan.id);
    end if;
  end loop;

  return jsonb_build_object(
    'organizationId', p_organization_id,
    'reconciledCount', reconciled_count,
    'planIds', reconciled_ids
  );
end;
$function$;

revoke all on function public.reconcile_expired_execution_plans(uuid, integer) from public, anon, authenticated;
grant execute on function public.reconcile_expired_execution_plans(uuid, integer) to service_role;
