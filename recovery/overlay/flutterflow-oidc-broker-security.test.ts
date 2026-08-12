import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

const servedHandlers: unknown[] = [];
(globalThis as any).Deno = {
  env: { get: () => undefined },
  serve: (handler: unknown) => servedHandlers.push(handler),
};
const { resolveFlutterFlowGrant } = await import(
  "../../supabase/functions/flutterflow-github-oidc-broker/index.ts"
);

const workload = {
  repository: "banataosystems/Pandoras-box",
  repositoryId: "1326729533",
  repositoryOwnerId: "314296438",
  workflowRef:
    "banataosystems/Pandoras-box/.github/workflows/flutterflow-unattended.yml@refs/heads/feature/flutterflow-pandora-mobile-v1",
  ref: "refs/heads/feature/flutterflow-pandora-mobile-v1",
  commitSha: "a".repeat(40),
  actorId: "314296438",
  jtiSha256: "b".repeat(64),
  runId: "31586020676",
  runAttempt: 1,
};

async function responseCode(result: Response): Promise<string> {
  return (await result.json()).code;
}

test("grant-miss denial is returned only after its audit write succeeds", () => {
  const broker = source(
    "supabase/functions/flutterflow-github-oidc-broker/index.ts",
  );
  const auditFetch = broker.indexOf(
    "/rest/v1/rpc/record_flutterflow_github_oidc_attempt",
  );
  const auditCheck = broker.indexOf("if (!auditResponse.ok)", auditFetch);
  const auditFailure = broker.indexOf("GRANT_MISS_AUDIT_FAILED", auditCheck);
  const grantDenial = broker.indexOf("GRANT_NOT_AVAILABLE", auditFailure);

  assert.ok(auditFetch > 0);
  assert.ok(auditCheck > auditFetch);
  assert.ok(auditFailure > auditCheck);
  assert.ok(grantDenial > auditFailure);
  assert.doesNotMatch(broker, /denied workload remains denied even if audit/);
});

test("inactive audit RPC candidate preserves the service-role-only boundary", () => {
  const path =
    "docs/supabase/recovery/ivmvufhcsezyhczzondn/inactive-source/remediation-candidates/fix_flutterflow_oidc_attempt_audit_acl.sql";
  const sql = source(path);
  const replacement = sql.match(
    /create or replace function public\.record_flutterflow_github_oidc_attempt\([\s\S]*?\nrevoke all on function/i,
  )?.[0];
  assert.ok(replacement);
  assert.equal(
    createHash("sha256").update(sql).digest("hex"),
    "447904e400d14dd76449e03759e8aaaa9851d54577d63e13a9120b2254e81901",
  );
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /unexpected_oidc_attempt_audit_function_drift/);
  assert.match(sql, /unexpected_oidc_attempt_audit_table_drift/);
  assert.match(sql, /oidc_attempt_audit_postcondition_failed/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(
    sql,
    /lock table private\.flutterflow_github_oidc_attempts in access exclusive mode/i,
  );
  assert.match(sql, /table_persistence <> 'p'/);
  assert.match(sql, /table_replica_identity <> 'd'/);
  assert.match(sql, /c8916f6a91e56bf5a6cb0c092d25765f818782107531313f86af952b4254e769/);
  assert.match(sql, /3eeb14005a1b81e8002598457c0d3c30af6becfa4955bc422ec5f29c48e64eb1/);
  assert.match(sql, /d2adbd38d4aea36b63de4217c78578eedaf30adbe8f52e9b67275fd0c7a9f7d1/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(
    sql,
    /revoke all on function public\.record_flutterflow_github_oidc_attempt\([\s\S]*?\) from public, anon, authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.record_flutterflow_github_oidc_attempt\([\s\S]*?\) to service_role;/i,
  );
  assert.doesNotMatch(replacement, /request\.jwt\.claim/i);
  assert.doesNotMatch(
    replacement,
    /grant execute on function[\s\S]*?\) to (?:public|anon|authenticated);/i,
  );
});

test("workflow reports bounded broker codes without publishing denial bodies", () => {
  const workflow = source(".github/workflows/flutterflow-unattended.yml");
  assert.match(workflow, /\[A-Z0-9_\]\{1,64\}/);
  assert.match(workflow, /FlutterFlow broker denied request: %s \(HTTP %s\)/);
  assert.match(workflow, /BROKER_REQUEST_FAILED \(HTTP 000\)/);
  assert.doesNotMatch(workflow, /cat \"\$\{broker_response\}\"/);
  assert.doesNotMatch(
    workflow.match(/broker_response=.*?[\s\S]*?broker_json=/)?.[0] ?? "",
    /--show-error/,
  );
  assert.match(workflow, /rm -f \"\$\{broker_response\}\"/);
});

test("grant miss is denied only after an exact non-secret audit write", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)),
    });
    if (calls.length === 1) {
      return Response.json([], { status: 200 });
    }
    return new Response(null, { status: 204 });
  };

  const result = await resolveFlutterFlowGrant(workload, {
    supabaseUrl: "https://project.invalid",
    serviceRoleKey: "test-secret-not-a-credential",
    fetchImpl: fetchImpl as typeof fetch,
  });
  assert.equal(result.status, 403);
  assert.equal(await responseCode(result), "GRANT_NOT_AVAILABLE");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /consume_flutterflow_github_oidc_grant$/);
  assert.match(calls[1].url, /record_flutterflow_github_oidc_attempt$/);
  assert.deepEqual(calls[1].body, {
    p_repository: workload.repository,
    p_ref: workload.ref,
    p_sha: workload.commitSha,
    p_workflow_ref: workload.workflowRef,
    p_actor_id: workload.actorId,
    p_run_id: workload.runId,
    p_run_attempt: workload.runAttempt,
    p_outcome: "grant_miss",
  });
  assert.equal("p_jti_sha256" in calls[1].body, false);
  assert.equal("token" in calls[1].body, false);
});

test("grant-miss audit provider denial and network failure return 503", async () => {
  for (const auditFailure of ["http", "network"] as const) {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      if (call === 1) return Response.json([], { status: 200 });
      if (auditFailure === "network") throw new Error("offline");
      return Response.json({ code: "denied" }, { status: 403 });
    };
    const result = await resolveFlutterFlowGrant(workload, {
      supabaseUrl: "https://project.invalid",
      serviceRoleKey: "test-secret-not-a-credential",
      fetchImpl: fetchImpl as typeof fetch,
    });
    assert.equal(result.status, 503);
    assert.equal(await responseCode(result), "GRANT_MISS_AUDIT_FAILED");
  }
});

test("grant check errors and malformed success bodies fail closed without audit", async () => {
  const cases = [
    async () => Response.json({ code: "unavailable" }, { status: 503 }),
    async () => new Response("not-json", { status: 200 }),
    async () => {
      throw new Error("offline");
    },
  ];
  for (const fetchImpl of cases) {
    let calls = 0;
    const result = await resolveFlutterFlowGrant(workload, {
      supabaseUrl: "https://project.invalid",
      serviceRoleKey: "test-secret-not-a-credential",
      fetchImpl: (async (...args: Parameters<typeof fetch>) => {
        calls += 1;
        return await (fetchImpl as typeof fetch)(...args);
      }) as typeof fetch,
    });
    assert.equal(result.status, 503);
    assert.equal(await responseCode(result), "GRANT_CHECK_FAILED");
    assert.equal(calls, 1);
  }
});

test("valid consumed grant returns once and does not invoke denial audit", async () => {
  let calls = 0;
  const token = "provider-token-used-only-in-this-test";
  const result = await resolveFlutterFlowGrant(workload, {
    supabaseUrl: "https://project.invalid",
    serviceRoleKey: "test-secret-not-a-credential",
    fetchImpl: (async () => {
      calls += 1;
      return Response.json([{
        token,
        project_id: "pandoras-box-gj9hnb",
        project_name: "Pandora",
        verified_at: "2026-08-12T00:00:00Z",
        grant_id: "test-grant",
      }]);
    }) as typeof fetch,
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.equal((await result.json()).token, token);
});
