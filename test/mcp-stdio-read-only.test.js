"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  availableTools,
  executeStdioTool,
} = require("../dist/mcp-stdio.js");

test("stdio remains read-only when the legacy write environment flag is set", async () => {
  const previous = process.env.MCP_ALLOW_WRITES;
  process.env.MCP_ALLOW_WRITES = "true";
  let configurationCalls = 0;
  let executionCalls = 0;

  try {
    const listed = new Set(availableTools().map((tool) => tool.name));
    assert.ok(listed.has("github.get-repository"));
    assert.equal(listed.has("github.create-issue"), false);

    const response = await executeStdioTool(
      "github.create-issue",
      { owner: "banataosystems", repo: "Pandoras-box", title: "must not run" },
      {
        async buildConfiguration() {
          configurationCalls += 1;
          return {};
        },
        async execute() {
          executionCalls += 1;
          return {};
        },
      },
    );

    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /read-only stdio mode/i);
    assert.match(response.content[0].text, /durable plan/i);
    assert.equal(configurationCalls, 0);
    assert.equal(executionCalls, 0);
  } finally {
    if (previous === undefined) {
      delete process.env.MCP_ALLOW_WRITES;
    } else {
      process.env.MCP_ALLOW_WRITES = previous;
    }
  }
});

test("stdio continues to execute registered read tools", async () => {
  const calls = [];
  const response = await executeStdioTool(
    "github.get-repository",
    { owner: "banataosystems", repo: "Pandoras-box" },
    {
      async buildConfiguration(name) {
        calls.push({ stage: "configuration", name });
        return { fixture: true };
      },
      async execute(name, args, configuration) {
        calls.push({ stage: "execute", name, args, configuration });
        return { full_name: "banataosystems/Pandoras-box" };
      },
    },
  );

  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [
    { stage: "configuration", name: "github.get-repository" },
    {
      stage: "execute",
      name: "github.get-repository",
      args: { owner: "banataosystems", repo: "Pandoras-box" },
      configuration: { fixture: true },
    },
  ]);
  assert.deepEqual(JSON.parse(response.content[0].text).result, {
    full_name: "banataosystems/Pandoras-box",
  });
});
