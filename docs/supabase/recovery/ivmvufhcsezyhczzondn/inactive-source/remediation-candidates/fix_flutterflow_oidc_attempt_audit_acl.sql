-- SOURCE-ONLY CANDIDATE. INACTIVE. DO NOT APPLY OR REPAIR HISTORY FROM HERE.
-- Target: ivmvufhcsezyhczzondn (Postgres 17)
-- Live evidence on 2026-08-12 showed the Edge broker's service-key call could
-- execute consume_flutterflow_github_oidc_grant but received HTTP 403 from
-- record_flutterflow_github_oidc_attempt. Both RPCs already grant EXECUTE only
-- to service_role/postgres; the record function's additional JWT-claim test is
-- redundant and incompatible with the modern secret-key path.
--
-- This candidate is one transaction. It takes a transaction advisory lock that
-- every governed function writer for this object must share, plus an ACCESS
-- EXCLUSIVE relation lock that intrinsically serializes the table state. It
-- refuses to replace the function unless
-- its body, definition, attributes, complete EXECUTE ACL, target table shape,
-- complete table ACL, constraints, index state, policies, triggers, and rules
-- match the read-only live evidence exactly. The postcondition pins the new body
-- and re-verifies the unchanged persistence boundary before commit.

begin;

-- Provider compatibility, quiescence, and the shared function-writer convention
-- for this advisory transaction lock must be proven before apply. The relation
-- lock prevents concurrent table/ACL/index changes through commit.
select pg_advisory_xact_lock(721398513, 20260812);
lock table private.flutterflow_github_oidc_attempts in access exclusive mode;

do $pandora_oidc_audit_precondition$
declare
  target_oid oid := to_regprocedure(
    'public.record_flutterflow_github_oidc_attempt(text,text,text,text,text,text,integer,text)'
  );
  target_table_oid oid := to_regclass('private.flutterflow_github_oidc_attempts');
  target_owner text;
  target_language text;
  target_result text;
  target_definition_sha256 text;
  target_body_sha256 text;
  target_security_definer boolean;
  target_config text[];
  function_acl_ok boolean;
  table_persistence "char";
  table_replica_identity "char";
  table_shape_sha256 text;
  table_acl_ok boolean;
  extended_table_shape_sha256 text;
  constraint_identity jsonb;
  constraint_indexes_ok boolean;
  policy_count bigint;
  trigger_count bigint;
  rewrite_rule_count bigint;
begin
  if target_oid is null or target_table_oid is null then
    raise exception 'expected_oidc_attempt_audit_objects_missing';
  end if;

  select pg_get_userbyid(p.proowner),
         l.lanname,
         pg_get_function_result(p.oid),
         encode(
           extensions.digest(convert_to(pg_get_functiondef(p.oid), 'UTF8'), 'sha256'),
           'hex'
         ),
         encode(
           extensions.digest(convert_to(p.prosrc, 'UTF8'), 'sha256'),
           'hex'
         ),
         p.prosecdef,
         p.proconfig,
         (
           select count(*) = 2
              and bool_and(
                x.grantor = p.proowner
                and x.grantee in (
                  to_regrole('postgres')::oid,
                  to_regrole('service_role')::oid
                )
                and x.privilege_type = 'EXECUTE'
                and not x.is_grantable
              )
              and count(*) filter (
                where x.grantee = to_regrole('postgres')::oid
              ) = 1
              and count(*) filter (
                where x.grantee = to_regrole('service_role')::oid
              ) = 1
           from aclexplode(p.proacl) x
         )
    into target_owner,
         target_language,
         target_result,
         target_definition_sha256,
         target_body_sha256,
         target_security_definer,
         target_config,
         function_acl_ok
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = target_oid;

  -- The transaction advisory lock is the function-DDL serialization boundary.
  -- A provider apply must prove no parallel writer bypasses this convention.
  if target_owner <> 'postgres'
     or target_language <> 'plpgsql'
     or target_result <> 'void'
     or target_definition_sha256
          <> '4baf796ef8cd0ba99de9c3055343df5b3509c396c15fc3d10a40a9ae68c0842b'
     or target_body_sha256
          <> 'c8916f6a91e56bf5a6cb0c092d25765f818782107531313f86af952b4254e769'
     or target_security_definer is not true
     or target_config is distinct from array['search_path=""']::text[]
     or function_acl_ok is not true
     or has_function_privilege('anon', target_oid, 'EXECUTE')
     or has_function_privilege('authenticated', target_oid, 'EXECUTE')
     or not has_function_privilege('service_role', target_oid, 'EXECUTE') then
    raise exception 'unexpected_oidc_attempt_audit_function_drift';
  end if;

  select c.relpersistence, c.relreplident
    into table_persistence, table_replica_identity
  from pg_class c
  where c.oid = target_table_oid;

  with target as (
    select c.oid,
           c.relowner,
           c.relacl,
           c.relkind,
           c.relrowsecurity,
           c.relforcerowsecurity
    from pg_class c
    where c.oid = target_table_oid
  ), shape as (
    select jsonb_build_object(
      'owner', pg_get_userbyid(t.relowner),
      'relkind', t.relkind,
      'rls_enabled', t.relrowsecurity,
      'rls_forced', t.relforcerowsecurity,
      'columns', (
        select jsonb_agg(
          jsonb_build_object(
            'ordinal', a.attnum,
            'name', a.attname,
            'type', format_type(a.atttypid, a.atttypmod),
            'not_null', a.attnotnull,
            'default', pg_get_expr(d.adbin, d.adrelid)
          ) order by a.attnum
        )
        from pg_attribute a
        left join pg_attrdef d
          on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = t.oid
          and a.attnum > 0
          and not a.attisdropped
      ),
      'constraints', (
        select jsonb_agg(
          jsonb_build_object(
            'type', con.contype,
            'definition', pg_get_constraintdef(con.oid, true)
          ) order by con.contype, pg_get_constraintdef(con.oid, true)
        )
        from pg_constraint con
        where con.conrelid = t.oid
      ),
      'acl', (
        select jsonb_agg(
          jsonb_build_object(
            'grantee', case
              when x.grantee = 0 then 'PUBLIC'
              else pg_get_userbyid(x.grantee)
            end,
            'privilege', x.privilege_type,
            'grantable', x.is_grantable
          ) order by
            case
              when x.grantee = 0 then 'PUBLIC'
              else pg_get_userbyid(x.grantee)
            end,
            x.privilege_type
        )
        from aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) x
      ),
      'policy_count', (
        select count(*) from pg_policy pol where pol.polrelid = t.oid
      )
    ) as value
    from target t
  )
  select encode(
           extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'),
           'hex'
         )
    into table_shape_sha256
  from shape;

  select count(*) = 8
         and bool_and(
           x.grantor = c.relowner
           and x.grantee = c.relowner
           and x.privilege_type = any(array[
             'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES',
             'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
           ]::text[])
           and not x.is_grantable
         )
    into table_acl_ok
  from pg_class c
  cross join lateral aclexplode(c.relacl) x
  where c.oid = target_table_oid
  group by c.relowner;

  select jsonb_agg(
           jsonb_build_array(
             con.conname,
             con.contype,
             pg_get_constraintdef(con.oid, true)
           ) order by con.conname
         ),
         count(*) filter (where con.conindid <> 0) = 2
           and bool_and(
             case
               when con.conindid = 0 then true
               else i.indisvalid and i.indisready and i.indisunique
             end
           )
    into constraint_identity, constraint_indexes_ok
  from pg_constraint con
  left join pg_index i on i.indexrelid = con.conindid
  where con.conrelid = target_table_oid;

  select count(*) into policy_count
  from pg_policy pol
  where pol.polrelid = target_table_oid;

  select count(*) into trigger_count
  from pg_trigger trg
  where trg.tgrelid = target_table_oid;

  select count(*) into rewrite_rule_count
  from pg_rewrite rw
  where rw.ev_class = target_table_oid
    and rw.rulename <> '_RETURN';

  select encode(
           extensions.digest(
             convert_to(
               jsonb_build_object(
                 'indexes', (
                   select jsonb_agg(
                     jsonb_build_object(
                       'name', ci.relname,
                       'definition', pg_get_indexdef(i.indexrelid),
                       'valid', i.indisvalid,
                       'ready', i.indisready,
                       'live', i.indislive,
                       'unique', i.indisunique,
                       'primary', i.indisprimary,
                       'replica_identity', i.indisreplident,
                       'clustered', i.indisclustered,
                       'exclusion', i.indisexclusion,
                       'predicate', pg_get_expr(i.indpred, i.indrelid),
                       'expressions', pg_get_expr(i.indexprs, i.indrelid)
                     ) order by ci.relname
                   )
                   from pg_index i
                   join pg_class ci on ci.oid = i.indexrelid
                   where i.indrelid = target_table_oid
                 ),
                 'columns_extra', (
                   select jsonb_agg(
                     jsonb_build_object(
                       'n', a.attnum,
                       'name', a.attname,
                       'acl', a.attacl,
                       'identity', a.attidentity,
                       'generated', a.attgenerated,
                       'collation', case
                         when a.attcollation = 0 then null
                         else a.attcollation::regcollation::text
                       end
                     ) order by a.attnum
                   )
                   from pg_attribute a
                   where a.attrelid = target_table_oid
                     and a.attnum > 0
                     and not a.attisdropped
                 )
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
    into extended_table_shape_sha256;

  if table_shape_sha256
       <> 'd978c5b5a6905419048fb4eaf79556b59ce06a599d2ff72e4a07af9b5aa3737d'
     or table_persistence <> 'p'
     or table_replica_identity <> 'd'
     or table_acl_ok is not true
     or extended_table_shape_sha256
       <> 'd2adbd38d4aea36b63de4217c78578eedaf30adbe8f52e9b67275fd0c7a9f7d1'
     or constraint_identity is distinct from jsonb_build_array(
       jsonb_build_array(
         'flutterflow_github_oidc_attem_sha_run_id_run_attempt_outcom_key',
         'u',
         'UNIQUE (sha, run_id, run_attempt, outcome)'
       ),
       jsonb_build_array(
         'flutterflow_github_oidc_attempts_attempt_positive',
         'c',
         'CHECK (run_attempt > 0)'
       ),
       jsonb_build_array(
         'flutterflow_github_oidc_attempts_outcome',
         'c',
         'CHECK (outcome = ''grant_miss''::text)'
       ),
       jsonb_build_array(
         'flutterflow_github_oidc_attempts_pkey',
         'p',
         'PRIMARY KEY (id)'
       ),
       jsonb_build_array(
         'flutterflow_github_oidc_attempts_run_id_format',
         'c',
         'CHECK (run_id ~ ''^[1-9][0-9]*$''::text)'
       ),
       jsonb_build_array(
         'flutterflow_github_oidc_attempts_sha_format',
         'c',
         'CHECK (sha ~ ''^[0-9a-f]{40}$''::text)'
       )
     )
     or constraint_indexes_ok is not true
     or policy_count <> 0
     or trigger_count <> 0
     or rewrite_rule_count <> 0 then
    raise exception 'unexpected_oidc_attempt_audit_table_drift';
  end if;
end;
$pandora_oidc_audit_precondition$;

create or replace function public.record_flutterflow_github_oidc_attempt(
  p_repository text,
  p_ref text,
  p_sha text,
  p_workflow_ref text,
  p_actor_id text,
  p_run_id text,
  p_run_attempt integer,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.flutterflow_github_oidc_attempts (
    repository,
    ref,
    sha,
    workflow_ref,
    actor_id,
    run_id,
    run_attempt,
    outcome
  ) values (
    p_repository,
    p_ref,
    p_sha,
    p_workflow_ref,
    p_actor_id,
    p_run_id,
    p_run_attempt,
    p_outcome
  )
  on conflict (sha, run_id, run_attempt, outcome) do nothing;
end;
$$;

revoke all on function public.record_flutterflow_github_oidc_attempt(
  text, text, text, text, text, text, integer, text
) from public, anon, authenticated;

grant execute on function public.record_flutterflow_github_oidc_attempt(
  text, text, text, text, text, text, integer, text
) to service_role;

do $pandora_oidc_audit_postcondition$
declare
  target_oid oid := to_regprocedure(
    'public.record_flutterflow_github_oidc_attempt(text,text,text,text,text,text,integer,text)'
  );
  target_table_oid oid := to_regclass('private.flutterflow_github_oidc_attempts');
  target_definition_sha256 text;
  target_body_sha256 text;
  function_acl_ok boolean;
  table_persistence "char";
  table_replica_identity "char";
  table_shape_sha256 text;
  table_acl_ok boolean;
  extended_table_shape_sha256 text;
  constraint_identity_sha256 text;
  constraint_indexes_ok boolean;
  trigger_count bigint;
  rewrite_rule_count bigint;
begin
  select encode(
           extensions.digest(convert_to(pg_get_functiondef(p.oid), 'UTF8'), 'sha256'),
           'hex'
         ),
         encode(
           extensions.digest(convert_to(p.prosrc, 'UTF8'), 'sha256'),
           'hex'
         ),
         (
           select count(*) = 2
              and bool_and(
                x.grantor = p.proowner
                and x.grantee in (
                  to_regrole('postgres')::oid,
                  to_regrole('service_role')::oid
                )
                and x.privilege_type = 'EXECUTE'
                and not x.is_grantable
              )
              and count(*) filter (
                where x.grantee = to_regrole('postgres')::oid
              ) = 1
              and count(*) filter (
                where x.grantee = to_regrole('service_role')::oid
              ) = 1
           from aclexplode(p.proacl) x
         )
    into target_definition_sha256, target_body_sha256, function_acl_ok
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = target_oid
    and pg_get_userbyid(p.proowner) = 'postgres'
    and l.lanname = 'plpgsql'
    and pg_get_function_result(p.oid) = 'void'
    and p.prosecdef
    and p.proconfig is not distinct from array['search_path=""']::text[];

  with target as (
    select c.oid,
           c.relowner,
           c.relacl,
           c.relkind,
           c.relrowsecurity,
           c.relforcerowsecurity
    from pg_class c
    where c.oid = target_table_oid
  ), shape as (
    select jsonb_build_object(
      'owner', pg_get_userbyid(t.relowner),
      'relkind', t.relkind,
      'rls_enabled', t.relrowsecurity,
      'rls_forced', t.relforcerowsecurity,
      'columns', (
        select jsonb_agg(
          jsonb_build_object(
            'ordinal', a.attnum,
            'name', a.attname,
            'type', format_type(a.atttypid, a.atttypmod),
            'not_null', a.attnotnull,
            'default', pg_get_expr(d.adbin, d.adrelid)
          ) order by a.attnum
        )
        from pg_attribute a
        left join pg_attrdef d
          on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = t.oid
          and a.attnum > 0
          and not a.attisdropped
      ),
      'constraints', (
        select jsonb_agg(
          jsonb_build_object(
            'type', con.contype,
            'definition', pg_get_constraintdef(con.oid, true)
          ) order by con.contype, pg_get_constraintdef(con.oid, true)
        )
        from pg_constraint con
        where con.conrelid = t.oid
      ),
      'acl', (
        select jsonb_agg(
          jsonb_build_object(
            'grantee', case
              when x.grantee = 0 then 'PUBLIC'
              else pg_get_userbyid(x.grantee)
            end,
            'privilege', x.privilege_type,
            'grantable', x.is_grantable
          ) order by
            case
              when x.grantee = 0 then 'PUBLIC'
              else pg_get_userbyid(x.grantee)
            end,
            x.privilege_type
        )
        from aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) x
      ),
      'policy_count', (
        select count(*) from pg_policy pol where pol.polrelid = t.oid
      )
    ) as value
    from target t
  )
  select encode(
           extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'),
           'hex'
         )
    into table_shape_sha256
  from shape;

  select c.relpersistence, c.relreplident
    into table_persistence, table_replica_identity
  from pg_class c
  where c.oid = target_table_oid;

  select count(*) into trigger_count
  from pg_trigger trg
  where trg.tgrelid = target_table_oid;

  select count(*) into rewrite_rule_count
  from pg_rewrite rw
  where rw.ev_class = target_table_oid
    and rw.rulename <> '_RETURN';

  select encode(
           extensions.digest(
             convert_to(
               jsonb_build_object(
                 'indexes', (
                   select jsonb_agg(
                     jsonb_build_object(
                       'name', ci.relname,
                       'definition', pg_get_indexdef(i.indexrelid),
                       'valid', i.indisvalid,
                       'ready', i.indisready,
                       'live', i.indislive,
                       'unique', i.indisunique,
                       'primary', i.indisprimary,
                       'replica_identity', i.indisreplident,
                       'clustered', i.indisclustered,
                       'exclusion', i.indisexclusion,
                       'predicate', pg_get_expr(i.indpred, i.indrelid),
                       'expressions', pg_get_expr(i.indexprs, i.indrelid)
                     ) order by ci.relname
                   )
                   from pg_index i
                   join pg_class ci on ci.oid = i.indexrelid
                   where i.indrelid = target_table_oid
                 ),
                 'columns_extra', (
                   select jsonb_agg(
                     jsonb_build_object(
                       'n', a.attnum,
                       'name', a.attname,
                       'acl', a.attacl,
                       'identity', a.attidentity,
                       'generated', a.attgenerated,
                       'collation', case
                         when a.attcollation = 0 then null
                         else a.attcollation::regcollation::text
                       end
                     ) order by a.attnum
                   )
                   from pg_attribute a
                   where a.attrelid = target_table_oid
                     and a.attnum > 0
                     and not a.attisdropped
                 )
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
    into extended_table_shape_sha256;

  select count(*) = 8
         and bool_and(
           x.grantor = c.relowner
           and x.grantee = c.relowner
           and x.privilege_type = any(array[
             'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES',
             'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
           ]::text[])
           and not x.is_grantable
         )
    into table_acl_ok
  from pg_class c
  cross join lateral aclexplode(c.relacl) x
  where c.oid = target_table_oid
  group by c.relowner;

  select encode(
           extensions.digest(
             convert_to(
               jsonb_agg(
                 jsonb_build_array(
                   con.conname,
                   con.contype,
                   pg_get_constraintdef(con.oid, true)
                 ) order by con.conname
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         ),
         count(*) filter (where con.conindid <> 0) = 2
           and bool_and(
             case
               when con.conindid = 0 then true
               else i.indisvalid and i.indisready and i.indisunique
             end
           )
    into constraint_identity_sha256, constraint_indexes_ok
  from pg_constraint con
  left join pg_index i on i.indexrelid = con.conindid
  where con.conrelid = target_table_oid;

  if target_definition_sha256
       <> '022d7e9e1ab0ffce40c0475bd0c0d4a2f6479b877f4d3e02dc9626bb87b0c2a9'
     or target_body_sha256
       <> '3eeb14005a1b81e8002598457c0d3c30af6becfa4955bc422ec5f29c48e64eb1'
     or function_acl_ok is not true
     or has_function_privilege('anon', target_oid, 'EXECUTE')
     or has_function_privilege('authenticated', target_oid, 'EXECUTE')
     or not has_function_privilege('service_role', target_oid, 'EXECUTE')
     or table_shape_sha256
       <> 'd978c5b5a6905419048fb4eaf79556b59ce06a599d2ff72e4a07af9b5aa3737d'
     or table_persistence <> 'p'
     or table_replica_identity <> 'd'
     or table_acl_ok is not true
     or extended_table_shape_sha256
       <> 'd2adbd38d4aea36b63de4217c78578eedaf30adbe8f52e9b67275fd0c7a9f7d1'
     or constraint_identity_sha256
       <> 'eadef91c5703f9b959c6c9e511ea8aa7f54d2b80540933bcf26205d2a730776a'
     or constraint_indexes_ok is not true
     or trigger_count <> 0
     or rewrite_rule_count <> 0 then
    raise exception 'oidc_attempt_audit_postcondition_failed';
  end if;
end;
$pandora_oidc_audit_postcondition$;

commit;
