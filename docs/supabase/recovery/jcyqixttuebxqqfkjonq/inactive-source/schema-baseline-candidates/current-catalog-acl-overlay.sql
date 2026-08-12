-- INACTIVE POST-CHAIN REHEARSAL OVERLAY.
--
-- This is not recovered migration source and must not be placed under
-- supabase/migrations. It normalizes an isolated replay to the reported
-- capture-time ACL endpoint only after all 48 preserved later migrations have
-- run. The historical origin and wording of these privileges remain unproven.

revoke all on table public.meta_drafts from public, anon, authenticated, service_role;
grant select, insert on table public.meta_drafts to authenticated;
grant all on table public.meta_drafts to service_role;

revoke all on table public.meta_webhook_health from public, anon, authenticated, service_role;
grant all on table public.meta_webhook_health to service_role;

revoke all on function public.claim_meta_webhook_delivery(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.claim_meta_webhook_delivery(
  uuid, uuid, text, text, timestamptz
) to service_role;

revoke all on function public.record_meta_webhook_health(
  uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.record_meta_webhook_health(
  uuid, text, boolean, timestamptz
) to service_role;
