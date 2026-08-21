import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const repositoryRoot = process.cwd();
const outputDirectory = path.join(repositoryRoot, "artifacts");
const outputPath = path.join(outputDirectory, "dep0169-trace.json");
const warnings = [];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitize(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(new RegExp(escapeRegExp(repositoryRoot), "g"), "<repo>")
    .replace(new RegExp(escapeRegExp(os.homedir()), "g"), "<home>");
}

function stackFrames(stack) {
  if (typeof stack !== "string") return [];
  return stack.split("\n").slice(1).flatMap((rawLine) => {
    const line = rawLine.trim();
    const match = line.match(/(?:\(|\s|^)((?:file:\/\/)?\/[^():\s]+):(\d+):(\d+)\)?$/);
    if (!match) return [];
    const absolutePath = match[1].replace(/^file:\/\//, "");
    return [{
      raw: line,
      absolutePath,
      line: Number.parseInt(match[2], 10),
      column: Number.parseInt(match[3], 10),
    }];
  });
}

function packageAttribution(frame) {
  const marker = `${path.sep}node_modules${path.sep}`;
  const markerIndex = frame.absolutePath.lastIndexOf(marker);
  if (markerIndex < 0) return undefined;

  const packageTail = frame.absolutePath.slice(markerIndex + marker.length);
  const segments = packageTail.split(path.sep);
  if (segments.length < 2) return undefined;

  const packageName = segments[0].startsWith("@")
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
  const packageSegments = packageName.split("/");
  const packageRoot = path.join(
    frame.absolutePath.slice(0, markerIndex),
    "node_modules",
    ...packageSegments,
  );
  const manifestPath = path.join(packageRoot, "package.json");
  let version = null;
  try {
    version = JSON.parse(fs.readFileSync(manifestPath, "utf8")).version ?? null;
  } catch {
    version = null;
  }

  return {
    package: packageName,
    version,
    file: path.relative(packageRoot, frame.absolutePath).split(path.sep).join("/"),
    line: frame.line,
    column: frame.column,
    stack_frame: sanitize(frame.raw),
  };
}

process.on("warning", (warning) => {
  if (warning?.code !== "DEP0169") return;
  const frames = stackFrames(warning.stack);
  const dependencyFrame = frames.find((frame) =>
    frame.absolutePath.includes(`${path.sep}node_modules${path.sep}`),
  );
  warnings.push({
    code: warning.code,
    name: warning.name,
    message: warning.message,
    stack: sanitize(warning.stack),
    first_dependency: dependencyFrame
      ? packageAttribution(dependencyFrame)
      : null,
  });
});

const require = createRequire(import.meta.url);
const { createVercelEntrypoint } = require("../vercel-entrypoint.js");
const app = createVercelEntrypoint();
const server = await new Promise((resolve, reject) => {
  const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
  candidate.once("error", reject);
});

const address = server.address();
if (!address || typeof address === "string") {
  server.close();
  throw new Error("The diagnostic server did not expose a TCP address");
}
const origin = `http://127.0.0.1:${address.port}`;

const probes = [
  {
    name: "protected-resource-metadata",
    path: "/.well-known/oauth-protected-resource/mcp",
    init: { method: "GET" },
    expectedStatus: 200,
  },
  {
    name: "unauthenticated-public-mcp",
    path: "/mcp",
    init: {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dep0169-public-mcp",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "dep0169-trace", version: "1.0.0" },
        },
      }),
    },
    expectedStatus: 401,
  },
  {
    name: "unauthenticated-rewritten-mcp",
    path: "/api/mcp",
    init: {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dep0169-rewritten-mcp",
        method: "tools/list",
        params: {},
      }),
    },
    expectedStatus: 401,
  },
  {
    name: "health",
    path: "/health",
    init: { method: "GET" },
    expectedStatus: 200,
  },
];

const probeResults = [];
try {
  for (const probe of probes) {
    const response = await fetch(`${origin}${probe.path}`, probe.init);
    const body = (await response.text()).slice(0, 500);
    probeResults.push({
      name: probe.name,
      path: probe.path,
      status: response.status,
      expected_status: probe.expectedStatus,
      expected_status_observed: response.status === probe.expectedStatus,
      body_sha256_omitted: true,
      body_length: body.length,
    });
    if (response.status !== probe.expectedStatus) {
      throw new Error(
        `${probe.name} returned ${response.status}; expected ${probe.expectedStatus}`,
      );
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 200));
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const uniqueWarnings = [...new Map(
  warnings.map((warning) => [warning.stack, warning]),
).values()];
const attributed = uniqueWarnings.filter((warning) => warning.first_dependency);
const result = {
  schema_version: "1.0.0",
  diagnostic: "node-dep0169-exact-nonproduction-attribution",
  repository: "banataosystems/Pandoras-box",
  exact_source_sha:
    process.env.EXACT_SOURCE_SHA ?? process.env.GITHUB_SHA ?? null,
  node_version: process.version,
  node_options: process.env.NODE_OPTIONS ?? null,
  provider_mutation: false,
  deployment_performed: false,
  credentials_used: false,
  probes: probeResults,
  warning_count: warnings.length,
  unique_warning_count: uniqueWarnings.length,
  attributed_warning_count: attributed.length,
  warnings: uniqueWarnings,
};

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));

if (uniqueWarnings.length === 0) {
  throw new Error("DEP0169 was not reproduced on the exact local Vercel entrypoint");
}
if (attributed.length === 0) {
  throw new Error("DEP0169 reproduced without an attributable dependency frame");
}
