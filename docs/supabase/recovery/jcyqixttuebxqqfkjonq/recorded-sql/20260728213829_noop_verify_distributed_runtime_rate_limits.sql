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
