alter function public.projectos_accept_intake(uuid,uuid,text,text,text,text,text,text,text)
  set search_path = public, private, auth, extensions, pg_temp;

alter function public.projectos_record_outcome(uuid,text,text,boolean,jsonb,jsonb,numeric,integer,integer,text,jsonb,jsonb,jsonb)
  set search_path = public, private, auth, extensions, pg_temp;
