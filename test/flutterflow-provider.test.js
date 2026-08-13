"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FlutterFlowMCPServer,
  executeFlutterFlowTool,
} = require("../dist/tools/flutterflow.js");
const { executeTool, getAllTools } = require("../dist/runtime/tool-catalog.js");
const { getToolManifest } = require("../dist/runtime/tool-manifest.js");
const {
  buildToolConfiguration,
  inspectToolConfiguration,
} = require("../dist/runtime/service-config.js");

const PROJECT_ID = "pandoras-box-gj9hnb";
const API_TOKEN = "fixture_flutterflow_token_material_123456";

function configuration(overrides = {}) {
  return {
    accounts: [{
      id: "pandora-mobile",
      label: "Pandora Mobile",
      authMode: "api_token",
      token: API_TOKEN,
      baseUrl: "https://api.flutterflow.io/v2",
      allowedProjectIds: [PROJECT_ID],
      grantedScopes: ["projects:read", "project_schema:read"],
      ...overrides,
    }],
    timeoutMs: 1_000,
    maxResponseBytes: 100_000,
  };
}

function providerProject(id = PROJECT_ID) {
  return {
    id,
    project: {
      name: id === PROJECT_ID ? "Pandora Mobile" : "Unrelated project",
      ownerEmail: "must-not-be-returned@example.com",
      createdAt: "2026-08-10T01:00:00.000Z",
      updatedAt: "2026-08-12T01:00:00.000Z",
      mainBranchRef: { path: `projects/${id}` },
      numBranches: 2,
      totalNumUpdates: 17,
      otherMembers: { user: { email: "also-private@example.com" } },
      activeSessions: { session: { lastSuccessfulUpdate: "2026-08-12T00:00:00Z" } },
    },
  };
}

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("FlutterFlow tools are read-only and expose no mutation surface", () => {
  const names = getAllTools().filter((name) => name.startsWith("flutterflow."));
  assert.deepEqual(names.sort(), [
    "flutterflow.inspect-readiness",
    "flutterflow.list-accounts",
    "flutterflow.list-projects",
  ]);
  for (const name of names) {
    const manifest = getToolManifest(name);
    assert.equal(manifest.provider, "flutterflow");
    assert.equal(manifest.risk, "read");
    assert.equal(manifest.mutation, false);
  }
});

test("project discovery pins the official origin, authenticates server-side, and strips private metadata", async () => {
  const calls = [];
  const server = new FlutterFlowMCPServer(configuration(), async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      success: true,
      reason: null,
      value: { entries: [providerProject(), providerProject("unrelated-project")] },
    });
  });

  const projects = await server.listProjects("pandora-mobile");
  assert.deepEqual(projects, [{
    id: PROJECT_ID,
    name: "Pandora Mobile",
    createdAt: "2026-08-10T01:00:00.000Z",
    updatedAt: "2026-08-12T01:00:00.000Z",
    mainBranchPath: `projects/${PROJECT_ID}`,
    branchCount: 2,
    updateCount: 17,
  }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.flutterflow.io/v2/l/listProjects");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${API_TOKEN}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    project_type: "ALL",
    deserialize_response: true,
  });
  const rendered = JSON.stringify(projects);
  assert.doesNotMatch(rendered, /ownerEmail|otherMembers|activeSessions|example\.com/);
});

test("readiness returns structural evidence but remains blocked for deployment", async () => {
  const responses = [
    jsonResponse({
      success: true,
      reason: null,
      value: { entries: [providerProject()] },
    }),
    jsonResponse({
      success: true,
      reason: null,
      value: {
        versionInfo: {
          partitionerVersion: 6,
          projectSchemaFingerprint: "schema-fingerprint-123",
        },
        fileNames: [
          "app-details",
          "authentication",
          "app-state",
          "theme",
          "page/id-home/page-widget-tree-outline",
          "page/id-login/page-widget-tree-outline",
          "component/id-header",
          "custom-file/id-main/custom-file-code",
        ],
      },
    }),
  ];
  const calls = [];
  const server = new FlutterFlowMCPServer(
    configuration(),
    async (url, init) => {
      calls.push({ url, init });
      return responses.shift();
    },
    () => "2026-08-13T10:00:00.000Z",
  );

  const result = await server.inspectReadiness("pandora-mobile", PROJECT_ID);
  assert.equal(result.observedAt, "2026-08-13T10:00:00.000Z");
  assert.equal(result.schema.partitionerVersion, 6);
  assert.equal(result.schema.projectSchemaFingerprint, "schema-fingerprint-123");
  assert.equal(result.schema.partitionedFileCount, 8);
  assert.equal(result.configurationSignals.appDetailsPresent, true);
  assert.equal(result.configurationSignals.authenticationConfigPresent, true);
  assert.equal(result.configurationSignals.pageCount, 2);
  assert.equal(result.projectConfigurationStatus, "observed");
  assert.equal(result.deploymentReadiness.status, "blocked");
  assert.equal(
    result.deploymentReadiness.gates.find((gate) => gate.key === "generated_code_build").status,
    "not_proven",
  );
  assert.equal(
    result.deploymentReadiness.gates.find((gate) => gate.key === "release_authorization").status,
    "not_granted",
  );
  assert.equal(calls[1].url, `https://api.flutterflow.io/v2/listPartitionedFileNames?projectId=${PROJECT_ID}`);
  assert.equal(calls[1].init.method, "GET");
  assert.equal(calls[1].init.body, undefined);
  assert.doesNotMatch(JSON.stringify(result), /fileNames|custom-file\/id-main/);
});

test("unknown accounts and wrong projects fail before any provider request", async () => {
  let requests = 0;
  const server = new FlutterFlowMCPServer(configuration(), async () => {
    requests += 1;
    throw new Error("must not be reached");
  });

  await assert.rejects(
    server.listProjects("unknown"),
    /Unknown FlutterFlow account/,
  );
  await assert.rejects(
    server.inspectReadiness("pandora-mobile", "different-project"),
    /not allowed to access project/,
  );
  assert.equal(requests, 0);

  await assert.rejects(
    executeTool("flutterflow.inspect-readiness", {
      accountId: "pandora-mobile",
      projectId: "different-project",
    }, { flutterflow: configuration() }),
    /not allowed to access project/,
  );
  assert.equal(requests, 0);
});

test("scope checks fail before FlutterFlow execution", async () => {
  await assert.rejects(
    executeTool("flutterflow.inspect-readiness", {
      accountId: "pandora-mobile",
      projectId: PROJECT_ID,
    }, {
      flutterflow: configuration({ grantedScopes: ["projects:read"] }),
    }),
    /missing required scope.*project_schema:read/i,
  );
});

test("alternate API origins and provider contract drift fail closed", async () => {
  assert.throws(
    () => new FlutterFlowMCPServer(configuration({ baseUrl: "https://example.com/v2" })),
    /Invalid literal value|Invalid input/,
  );

  const server = new FlutterFlowMCPServer(configuration(), async () => jsonResponse({
    success: true,
    value: { projects: [] },
  }));
  await assert.rejects(
    server.listProjects("pandora-mobile"),
    /response contract changed/,
  );
});

test("declared and streamed response sizes are bounded", async () => {
  const declared = new FlutterFlowMCPServer({
    ...configuration(),
    maxResponseBytes: 1_024,
  }, async () => jsonResponse({ success: true }, 200, { "content-length": "2048" }));
  await assert.rejects(
    declared.listProjects("pandora-mobile"),
    /response exceeded size limit/,
  );

  const streamed = new FlutterFlowMCPServer({
    ...configuration(),
    maxResponseBytes: 1_024,
  }, async () => new Response("x".repeat(1_025), { status: 200 }));
  await assert.rejects(
    streamed.listProjects("pandora-mobile"),
    /response exceeded size limit/,
  );
});

test("provider calls time out and do not retry ambiguously", async () => {
  let calls = 0;
  const server = new FlutterFlowMCPServer({
    ...configuration(),
    timeoutMs: 250,
  }, (_url, init) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  });
  await assert.rejects(
    server.listProjects("pandora-mobile"),
    /request timed out/,
  );
  assert.equal(calls, 1);
});

test("environment configuration binds the exact project without storing the token in JSON", async (t) => {
  const previous = {
    definitions: process.env.FLUTTERFLOW_ACCOUNTS_JSON,
    token: process.env.FLUTTERFLOW_API_TOKEN,
  };
  t.after(() => {
    if (previous.definitions === undefined) delete process.env.FLUTTERFLOW_ACCOUNTS_JSON;
    else process.env.FLUTTERFLOW_ACCOUNTS_JSON = previous.definitions;
    if (previous.token === undefined) delete process.env.FLUTTERFLOW_API_TOKEN;
    else process.env.FLUTTERFLOW_API_TOKEN = previous.token;
  });

  process.env.FLUTTERFLOW_ACCOUNTS_JSON = JSON.stringify([{
    id: "pandora-mobile",
    label: "Pandora Mobile",
    tokenEnv: "FLUTTERFLOW_API_TOKEN",
    allowedProjectIds: [PROJECT_ID],
    grantedScopes: ["projects:read", "project_schema:read"],
  }]);
  delete process.env.FLUTTERFLOW_API_TOKEN;
  assert.deepEqual(inspectToolConfiguration("flutterflow.inspect-readiness"), {
    configured: false,
    missing: ["FLUTTERFLOW_API_TOKEN"],
  });

  process.env.FLUTTERFLOW_API_TOKEN = API_TOKEN;
  const resolved = await buildToolConfiguration("flutterflow.inspect-readiness");
  assert.deepEqual(resolved.flutterflow.accounts[0].allowedProjectIds, [PROJECT_ID]);
  assert.equal(resolved.flutterflow.accounts[0].token, API_TOKEN);
  assert.equal(inspectToolConfiguration("flutterflow.inspect-readiness").configured, true);

  const accountList = await executeFlutterFlowTool(
    "flutterflow.list-accounts",
    {},
    resolved.flutterflow,
  );
  assert.equal(accountList[0].id, "pandora-mobile");
  assert.equal(Object.hasOwn(accountList[0], "token"), false);

  process.env.FLUTTERFLOW_ACCOUNTS_JSON = JSON.stringify([{
    id: "pandora-mobile",
    label: "Pandora Mobile",
    tokenEnv: "PATH",
    allowedProjectIds: [PROJECT_ID],
  }]);
  assert.deepEqual(inspectToolConfiguration("flutterflow.inspect-readiness"), {
    configured: false,
    missing: [
      "FLUTTERFLOW_ACCOUNTS_JSON entries with id, label, a FLUTTERFLOW_* tokenEnv, and valid allowedProjectIds",
    ],
  });
});
