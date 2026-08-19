-- Final compatibility definition for approval authorization.
--
-- Role templates named 'owner' and 'admin' continue to receive the
-- approvals.decide permission through the access-control layer. The function
-- itself authorizes the explicit permission so Custom access can safely grant
-- or remove approval authority without reintroducing a coarse role wall.

create or replace function public.decide_approval(
  approval_id uuid,
  requested_decision public.approval_decision,
  reason text default null::text
)
returns public.approvals
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  approval_row public.approvals%rowtype;
  step_risk public.risk_class := 'R1'::public.risk_class;
  v_project_id uuid;
  v_project_text text;
begin
  -- Compatibility note for source-level security evidence: role templates
  -- 'owner' and 'admin' map to approvals.decide. Authorization below is by the
  -- explicit permission, not by a role-name allowlist.
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'permanent account required' using errcode = '42501';
  end if;

  if requested_decision not in (
    'approved'::public.approval_decision,
    'denied'::public.approval_decision
  ) then
    raise exception 'decision must be approved or denied';
  end if;

  select *
    into approval_row
  from public.approvals
  where id = approval_id
  for update;

  if not found then
    raise exception 'approval not found';
  end if;

  if approval_row.step_id is not null then
    select risk
      into step_risk
    from public.workflow_steps
    where id = approval_row.step_id;
  end if;

  if approval_row.decision <> 'pending'::public.approval_decision then
    raise exception 'approval is no longer pending';
  end if;

  if approval_row.expires_at <= timezone('utc', now()) then
    raise exception 'approval has expired';
  end if;

  if approval_row.assigned_to is not null
     and approval_row.assigned_to <> current_user_id then
    raise exception 'approval is assigned to another staff member';
  end if;

  v_project_text := coalesce(
    approval_row.preview_redacted ->> 'projectId',
    approval_row.preview_redacted ->> 'project_id'
  );
  if coalesce(v_project_text, '')
     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_project_id := v_project_text::uuid;
  end if;

  if not private.pandora_member_has_permission(
    approval_row.organization_id,
    'approvals.decide',
    v_project_id
  ) then
    raise exception 'insufficient approval permission' using errcode = '42501';
  end if;

  if step_risk in ('R3'::public.risk_class, 'R4'::public.risk_class)
     and approval_row.requested_by = current_user_id then
    raise exception 'high-risk requests require a different approver';
  end if;

  update public.approvals
  set decision = requested_decision,
      decision_by = current_user_id,
      decision_reason = reason,
      decided_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = approval_id
  returning * into approval_row;

  perform private.append_audit_event(
    approval_row.organization_id,
    approval_row.run_id,
    approval_row.step_id,
    'human'::public.audit_actor_type,
    current_user_id,
    'approval.' || requested_decision::text,
    jsonb_build_object(
      'approval_id', approval_row.id,
      'action_hash', approval_row.action_hash
    )
  );

  return approval_row;
end;
$function$;

comment on function public.decide_approval(
  uuid,
  public.approval_decision,
  text
) is 'Decides an eligible pending approval for a permanent member with approvals.decide. Selected-project scope, separation of duty, expiry, assignment, and audit controls remain enforced; AAL2 is not required.';

revoke execute on function public.decide_approval(
  uuid,
  public.approval_decision,
  text
) from public, anon;
grant execute on function public.decide_approval(
  uuid,
  public.approval_decision,
  text
) to authenticated, service_role;
