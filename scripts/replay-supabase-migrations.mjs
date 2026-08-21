import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationRoot = join(repositoryRoot, 'supabase', 'migrations');
const fixtureRoot = join(
  repositoryRoot,
  'docs',
  'supabase',
  'recovery',
  'jcyqixttuebxqqfkjonq',
  'inactive-source',
  'schema-baseline-candidates',
  'replay-fixtures',
);
const recoveryRoot = join(
  repositoryRoot,
  'docs',
  'supabase',
  'recovery',
  'jcyqixttuebxqqfkjonq',
);
const expectedExtensionStatements = new Map([
  ['20260728150403_enable_http_for_supabase_account_discovery.sql', [
    'create extension if not exists http with schema extensions;',
  ]],
  ['20260807083337_projectos_memory_lifecycle_enforcement.sql', [
    'create extension if not exists pg_net;',
    'create extension if not exists pg_cron;',
  ]],
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function portableSql(filename, source) {
  let transformed = source;
  for (const statement of expectedExtensionStatements.get(filename) || []) {
    const occurrences = transformed.split(statement).length - 1;
    assert.equal(occurrences, 1, `${filename}: extension substitution drift`);
    transformed = transformed.replace(statement, `-- PGLITE PROVIDER STUB: ${statement}`);
  }
  return transformed;
}

async function bootstrap(db) {
  await db.exec(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;

    do $bootstrap$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end
    $bootstrap$;

    create schema if not exists auth;
    create type auth.aal_level as enum ('aal1', 'aal2');
    create table auth.users (
      id uuid primary key,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      is_anonymous boolean not null default false
    );
    create table auth.sessions (
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      aal auth.aal_level not null default 'aal1',
      not_after timestamptz
    );
    create or replace function auth.jwt() returns jsonb
    language sql stable
    as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create or replace function auth.uid() returns uuid
    language sql stable
    as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid
    $$;
    create or replace function auth.role() returns text
    language sql stable
    as $$
      select coalesce(nullif(auth.jwt() ->> 'role', ''), current_user)
    $$;
    select set_config('request.jwt.claims', '{"role":"service_role"}', false);

    create schema if not exists vault;
    create table vault.decrypted_secrets (
      id uuid primary key,
      decrypted_secret text
    );

    create type extensions.http_method as enum ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD');
    create type extensions.http_header as (field varchar, value varchar);
    create type extensions.http_request as (
      method extensions.http_method,
      uri varchar,
      headers extensions.http_header[],
      content_type varchar,
      content varchar
    );
    create type extensions.http_response as (
      status integer,
      content_type varchar,
      headers extensions.http_header[],
      content varchar
    );
    create or replace function extensions.http(extensions.http_request)
    returns extensions.http_response
    language sql immutable
    as $$
      select row(599, 'application/json', array[]::extensions.http_header[],
        '{"error":"provider HTTP disabled in replay"}')::extensions.http_response
    $$;

    create schema if not exists net;
    create table net._http_response (
      id bigint primary key,
      status_code integer,
      content text,
      headers jsonb,
      error_msg text,
      timed_out boolean not null default false,
      created timestamptz not null default now()
    );
    create sequence net.http_request_id_seq;
    create or replace function net.http_post(
      url text,
      body jsonb default '{}'::jsonb,
      params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb,
      timeout_milliseconds integer default 1000
    ) returns bigint
    language sql volatile
    as $$ select nextval('net.http_request_id_seq') $$;

    create schema if not exists cron;
    create table cron.job (
      jobid bigint generated always as identity primary key,
      jobname text unique,
      schedule text not null,
      command text not null
    );
    create or replace function cron.schedule(job_name text, schedule text, command text)
    returns bigint
    language plpgsql
    as $$
    declare resolved_id bigint;
    begin
      insert into cron.job(jobname, schedule, command)
      values (job_name, schedule, command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
      returning jobid into resolved_id;
      return resolved_id;
    end;
    $$;
  `);
}

async function authorizationSmoke(db) {
  const organizationId = '2270b266-59da-4c39-bfd9-9f8d08352af0';
  const users = {
    owner: '11111111-1111-4111-8111-111111111111',
    operator: '22222222-2222-4222-8222-222222222222',
    requester: '33333333-3333-4333-8333-333333333333',
    anonymousOwner: '44444444-4444-4444-8444-444444444444',
  };
  const approvals = {
    ownerSuccess: '30000000-0000-4000-8000-000000000001',
    operatorDenied: '30000000-0000-4000-8000-000000000002',
    anonymousDenied: '30000000-0000-4000-8000-000000000003',
    separationDenied: '30000000-0000-4000-8000-000000000004',
  };

  await db.exec(`
    insert into auth.users(id, raw_user_meta_data, is_anonymous) values
      ('${users.owner}', '{}'::jsonb, false),
      ('${users.operator}', '{}'::jsonb, false),
      ('${users.requester}', '{}'::jsonb, false),
      ('${users.anonymousOwner}', '{}'::jsonb, true);

    insert into public.memberships(organization_id, user_id, role, status, joined_at) values
      ('${organizationId}', '${users.owner}', 'owner', 'active', now()),
      ('${organizationId}', '${users.operator}', 'operator', 'active', now()),
      ('${organizationId}', '${users.requester}', 'member', 'active', now()),
      ('${organizationId}', '${users.anonymousOwner}', 'owner', 'active', now());

    insert into public.workflow_runs(
      id, organization_id, workflow_key, workflow_version, status, requester_id,
      risk_ceiling, idempotency_key, started_at
    ) values
      ('10000000-0000-4000-8000-000000000001', '${organizationId}', 'replay-owner', '1', 'waiting_approval', '${users.requester}', 'R3', 'replay-owner', now()),
      ('10000000-0000-4000-8000-000000000002', '${organizationId}', 'replay-operator', '1', 'waiting_approval', '${users.requester}', 'R1', 'replay-operator', now()),
      ('10000000-0000-4000-8000-000000000003', '${organizationId}', 'replay-anonymous', '1', 'waiting_approval', '${users.requester}', 'R1', 'replay-anonymous', now()),
      ('10000000-0000-4000-8000-000000000004', '${organizationId}', 'replay-sod', '1', 'waiting_approval', '${users.owner}', 'R4', 'replay-sod', now());

    insert into public.workflow_steps(
      id, organization_id, run_id, step_key, sequence, status, risk, approval_required
    ) values
      ('20000000-0000-4000-8000-000000000001', '${organizationId}', '10000000-0000-4000-8000-000000000001', 'approve', 0, 'waiting_approval', 'R3', true),
      ('20000000-0000-4000-8000-000000000002', '${organizationId}', '10000000-0000-4000-8000-000000000002', 'approve', 0, 'waiting_approval', 'R1', true),
      ('20000000-0000-4000-8000-000000000003', '${organizationId}', '10000000-0000-4000-8000-000000000003', 'approve', 0, 'waiting_approval', 'R1', true),
      ('20000000-0000-4000-8000-000000000004', '${organizationId}', '10000000-0000-4000-8000-000000000004', 'approve', 0, 'waiting_approval', 'R4', true);

    insert into public.approvals(
      id, organization_id, run_id, step_id, requested_by, action_hash,
      preview_redacted, expires_at
    ) values
      ('${approvals.ownerSuccess}', '${organizationId}', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '${users.requester}', repeat('a', 64), '{}'::jsonb, now() + interval '1 hour'),
      ('${approvals.operatorDenied}', '${organizationId}', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '${users.requester}', repeat('b', 64), '{}'::jsonb, now() + interval '1 hour'),
      ('${approvals.anonymousDenied}', '${organizationId}', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '${users.requester}', repeat('c', 64), '{}'::jsonb, now() + interval '1 hour'),
      ('${approvals.separationDenied}', '${organizationId}', '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '${users.owner}', repeat('d', 64), '{}'::jsonb, now() + interval '1 hour');
  `);

  const setClaims = async (userId, isAnonymous = false) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: userId, role: 'authenticated', is_anonymous: String(isAnonymous) }),
    ]);
  };
  const decide = (approvalId) => db.query(
    `select (public.decide_approval($1, 'approved'::public.approval_decision, 'replay')).decision::text as decision`,
    [approvalId],
  );
  const mustDeny = async (userId, approvalId, isAnonymous = false) => {
    await setClaims(userId, isAnonymous);
    await assert.rejects(decide(approvalId));
    const state = await db.query(`select decision::text as decision from public.approvals where id = $1`, [approvalId]);
    assert.equal(state.rows[0].decision, 'pending');
  };

  await setClaims(users.owner);
  assert.equal((await db.query(`select count(*)::integer as count from auth.sessions where user_id = $1`, [users.owner])).rows[0].count, 0);
  assert.equal((await decide(approvals.ownerSuccess)).rows[0].decision, 'approved');
  assert.equal(
    (await db.query(`select count(*)::integer as count from public.audit_events where event_type = 'approval.approved' and actor_user_id = $1`, [users.owner])).rows[0].count,
    1,
  );

  await mustDeny(users.operator, approvals.operatorDenied);
  await mustDeny(users.anonymousOwner, approvals.anonymousDenied, true);
  await mustDeny(users.owner, approvals.separationDenied);
  return {
    aal1_owner_without_session: 'approved',
    operator: 'denied',
    anonymous_owner: 'denied',
    high_risk_requester_as_approver: 'denied',
    audit_event_appended: true,
  };
}

async function rollbackSmoke(db) {
  const rollback = await readFile(
    join(recoveryRoot, 'rollback', '20260812034825_restore_projectos_approval_aal2.sql'),
    'utf8',
  );
  const aal1 = await readFile(
    join(migrationRoot, '20260813014555_remove_projectos_approval_aal2.sql'),
    'utf8',
  );
  const definition = async () => (await db.query(`
    select pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'decide_approval'
      and pg_get_function_identity_arguments(p.oid) = 'approval_id uuid, requested_decision approval_decision, reason text'
  `)).rows[0].definition;

  await db.exec(rollback);
  const restored = await definition();
  assert.match(restored, /auth\.sessions/i, 'database rollback did not restore session assurance');
  assert.match(restored, /current_session_id/i, 'database rollback did not restore session identity');
  assert.match(restored, /'aal2'/i, 'database rollback did not restore AAL2');

  await db.exec(aal1);
  const reapplied = await definition();
  assert.doesNotMatch(
    reapplied,
    /auth\.sessions|auth\.aal_level|current_session_id/i,
    'AAL1 migration could not be reapplied after rollback',
  );
  return {
    restore_previous_aal2_definition: 'pass',
    reapply_aal1_definition: 'pass',
  };
}

async function catalogAssertions(db, migrationFiles) {
  const server = await db.query('show server_version_num');
  const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].count);
  const columns = {};
  for (const table of ['webhook_events', 'meta_drafts', 'meta_webhook_health']) {
    columns[table] = await count(
      `select count(*) from information_schema.columns where table_schema = 'public' and table_name = $1`,
      [table],
    );
  }
  assert.deepEqual(
    columns,
    { webhook_events: 14, meta_drafts: 11, meta_webhook_health: 9 },
    'Meta table column counts drifted',
  );

  const rls = await db.query(`
    select relname, relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and relname in ('meta_drafts', 'meta_webhook_health')
    order by relname
  `);
  assert.equal(rls.rows.length, 2, 'Meta RLS table set drifted');
  assert.ok(rls.rows.every((row) => row.relrowsecurity === true), 'Meta RLS is not enabled');
  assert.equal(
    await count(`select count(*) from pg_policies where schemaname = 'public' and tablename = 'meta_drafts'`),
    2,
    'Meta draft policy count drifted',
  );

  const approval = await db.query(`
    select pg_get_functiondef(p.oid) as definition,
           p.prosecdef as security_definer,
           p.proconfig as configuration,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'decide_approval'
      and pg_get_function_identity_arguments(p.oid) = 'approval_id uuid, requested_decision approval_decision, reason text'
  `);
  assert.equal(approval.rows.length, 1, 'decide_approval signature was not found');
  const [row] = approval.rows;
  assert.equal(row.security_definer, true, 'decide_approval is not security-definer');
  assert.equal(row.authenticated_execute, true, 'authenticated cannot execute decide_approval');
  assert.equal(row.service_execute, true, 'service_role cannot execute decide_approval');
  assert.equal(row.anon_execute, false, 'anon can execute decide_approval');
  assert.ok(
    row.configuration?.some((entry) => /^search_path=(?:""|)$/i.test(entry)),
    'decide_approval search path is not pinned empty',
  );
  assert.doesNotMatch(
    row.definition,
    /auth\.sessions|auth\.aal_level|current_session_id/i,
    'decide_approval still depends on an AAL2 session',
  );
  assert.match(row.definition, /'owner'/i, 'decide_approval owner role is missing');
  assert.match(row.definition, /'admin'/i, 'decide_approval admin role is missing');
  assert.doesNotMatch(
    row.definition,
    /ARRAY\[[^\]]*'operator'/i,
    'decide_approval still admits operator',
  );

  const sourcePolicy = await db.query(`
    select source_type, source_value, wildcard, operational_status
    from private.repository_source_policies
    where source_type = 'github_owner'
      and source_value = 'mbanatao'
  `);
  assert.deepEqual(sourcePolicy.rows, [{
    source_type: 'github_owner',
    source_value: 'mbanatao',
    wildcard: 'mbanatao/*',
    operational_status: 'historical_only',
  }], 'owner-wide repository source policy drifted');

  const historicalBindings = await db.query(`
    select repo_full_name, github_access, source_status
    from private.project_resource_bindings
    where lower(split_part(repo_full_name, '/', 1)) = 'mbanatao'
    order by lower(repo_full_name)
  `);
  assert.ok(historicalBindings.rows.length > 0, 'historical repository bindings are missing');
  assert.ok(
    historicalBindings.rows.every((binding) =>
      binding.github_access === 'read_only' && binding.source_status === 'historical_only'),
    'an mbanatao repository binding remains operational',
  );

  const canonicalBinding = await db.query(`
    select github_access, supabase_project_ref, vercel_project_id, source_status
    from private.project_resource_bindings
    where repo_full_name = 'banataosystems/fxpass'
  `);
  assert.deepEqual(canonicalBinding.rows, [{
    github_access: 'read_write',
    supabase_project_ref: 'jhygppdcfrmejbzyozud',
    vercel_project_id: 'prj_t9cl0GiY9APSTw2NUNJLtRg6auwZ',
    source_status: 'active',
  }], 'canonical FXPass binding drifted');

  const sourceTrigger = await db.query(`
    select procedure.prosecdef as security_definer,
           procedure.proconfig as configuration,
           has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
           has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
           has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_execute
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid = trigger.tgfoid
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'projectos_projects'
      and trigger.tgname = 'enforce_repository_source_authority'
      and not trigger.tgisinternal
  `);
  assert.equal(sourceTrigger.rows.length, 1, 'repository source trigger is missing');
  assert.equal(sourceTrigger.rows[0].security_definer, true, 'repository source trigger is not security-definer');
  assert.equal(sourceTrigger.rows[0].anon_execute, false, 'anon can execute the repository source trigger');
  assert.equal(sourceTrigger.rows[0].authenticated_execute, false, 'authenticated can execute the repository source trigger');
  assert.equal(sourceTrigger.rows[0].service_execute, true, 'service_role cannot execute the repository source trigger');
  assert.ok(
    sourceTrigger.rows[0].configuration?.some((entry) => /^search_path=(?:""|)$/i.test(entry)),
    'repository source trigger search path is not pinned empty',
  );

  const fxpassIntake = await db.query(`
    select pg_get_functiondef(
      'public.projectos_accept_fxpass_product_intake(uuid,jsonb)'::regprocedure
    ) as definition
  `);
  assert.match(fxpassIntake.rows[0].definition, /banataosystems\/fxpass/i, 'FXPass intake lacks canonical repository');
  assert.doesNotMatch(fxpassIntake.rows[0].definition, /mbanatao\/fong/i, 'FXPass intake retains historical repository');

  let mixedCaseSourceDenied = false;
  try {
    await db.exec(`
      insert into public.projectos_projects (
        organization_id, project_key, name, repository, workspace_path
      ) values (
        '2270b266-59da-4c39-bfd9-9f8d08352af0',
        'blocked-source-replay',
        'Blocked source replay',
        'MBANATAO/blocked-source-replay',
        'projectos/projects/blocked-source-replay'
      )
    `);
  } catch (error) {
    mixedCaseSourceDenied = error?.code === '42501';
  }
  assert.equal(mixedCaseSourceDenied, true, 'mixed-case mbanatao repository was not rejected');

  const secrets = await db.query(`
    select secret_name, length(secret_value) as value_length
    from private.integration_secrets
    order by secret_name
  `);
  assert.deepEqual(
    secrets.rows,
    [
      { secret_name: 'projectos_fxpass_intake_hmac', value_length: 64 },
      { secret_name: 'projectos_memory_learning_hmac', value_length: 64 },
    ],
    'database-generated integration secrets are missing',
  );
  const config = await db.query(`
    select length(admin_token_hash) as admin_length,
           length(approval_token_hash) as approval_length
    from private.runtime_security_configs
  `);
  assert.deepEqual(
    config.rows,
    [{ admin_length: 64, approval_length: 64 }],
    'database-generated runtime verifiers are missing',
  );

  const authorization = await authorizationSmoke(db);
  const rollback = await rollbackSmoke(db);
  return {
    schema_version: '1.0.0',
    engine: { name: 'pglite', package_version: '0.5.4', postgres_server_version_num: server.rows[0].server_version_num },
    provider_equivalence: false,
    migration_count: migrationFiles.length,
    chain_sha256: sha256(
      migrationFiles.map(({ filename, source }) => `${filename}:${sha256(source)}`).join('\n') + '\n',
    ),
    provider_extension_substitutions: [...expectedExtensionStatements.entries()].flatMap(([filename, statements]) =>
      statements.map((statement) => ({ filename, statement }))),
    fixtures: ['after-foundations.sql', 'after-20260731122011.sql'],
    assertions: {
      meta_table_column_counts: columns,
      meta_rls_enabled: true,
      meta_drafts_policy_count: 2,
      final_decide_approval: 'AAL1 permanent owner/admin; anon/operator/session dependency denied',
      replay_credentials: 'four database-generated 256-bit values; no source literals',
      source_authority: {
        owner_wildcard: 'mbanatao/*',
        historical_binding_count: historicalBindings.rows.length,
        canonical_fxpass_binding: 'active',
        mixed_case_repository_insert: 'denied',
      },
      authorization_smoke: authorization,
      database_rollback_smoke: rollback,
    },
  };
}

async function main() {
  const filenames = (await readdir(migrationRoot))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  const minimumHistoricalMigrationCount = 52;
  assert.ok(
    filenames.length >= minimumHistoricalMigrationCount,
    `historical migration chain unexpectedly shrank below ${minimumHistoricalMigrationCount}`,
  );
  assert.equal(
    new Set(filenames.map((filename) => filename.slice(0, 14))).size,
    filenames.length,
    'migration timestamps must remain unique',
  );
  const migrationFiles = await Promise.all(filenames.map(async (filename) => ({
    filename,
    source: await readFile(join(migrationRoot, filename), 'utf8'),
  })));
  const fixtures = new Map([
    ['20260724030000_meta_remote_mcp_persistence.sql', await readFile(join(fixtureRoot, 'after-foundations.sql'), 'utf8')],
    ['20260731122011_projectos_product_intelligence_schema.sql', await readFile(join(fixtureRoot, 'after-20260731122011.sql'), 'utf8')],
  ]);

  const db = new PGlite({ extensions: { pgcrypto } });
  let currentMigration = 'bootstrap';
  try {
    await bootstrap(db);
    for (const migration of migrationFiles) {
      currentMigration = migration.filename;
      await db.exec(portableSql(migration.filename, migration.source));
      if (fixtures.has(migration.filename)) await db.exec(fixtures.get(migration.filename));
    }
    const result = await catalogAssertions(db, migrationFiles);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const assertion = error?.name === 'AssertionError' ? ` (${error.message.split('\n')[0]})` : '';
    process.stderr.write(
      `Supabase replay failed at ${currentMigration}: ${error?.code || error?.name || 'error'}${assertion}\n`,
    );
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

await main();
