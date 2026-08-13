-- GOVERNED MIGRATION-HISTORY RECOVERY.
-- This filename preserves a production ledger version for clean replay.
-- Production history is never rewritten; live hashes remain in the recovery manifest.
-- Semantic recovery of the provider-recorded SQL payload; comments and terminal newline may differ.

do $$
begin
  if to_regclass('public.runtime_rate_limit_buckets') is null then
    raise exception 'runtime_rate_limit_buckets missing';
  end if;
  if to_regprocedure('public.consume_runtime_rate_limit(uuid,text,integer,integer)') is null then
    raise exception 'consume_runtime_rate_limit missing';
  end if;
end
$$;
