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
