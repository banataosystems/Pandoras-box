-- GOVERNED MIGRATION-HISTORY RECOVERY.
-- This filename preserves a production ledger version for clean replay.
-- Production history is never rewritten; live hashes remain in the recovery manifest.
-- Semantic recovery of the provider-recorded SQL payload; comments and terminal newline may differ.

do $$
begin
  if has_function_privilege('anon', 'public.consume_runtime_rate_limit(uuid,text,integer,integer)', 'execute') then
    raise exception 'anon unexpectedly has rate limit execute';
  end if;
  if has_function_privilege('authenticated', 'public.consume_runtime_rate_limit(uuid,text,integer,integer)', 'execute') then
    raise exception 'authenticated unexpectedly has rate limit execute';
  end if;
  if not has_function_privilege('service_role', 'public.consume_runtime_rate_limit(uuid,text,integer,integer)', 'execute') then
    raise exception 'service_role missing rate limit execute';
  end if;
end
$$;
