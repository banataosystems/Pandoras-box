#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildCaptureEnvelope,
  endpointUrls,
  readDefaultPolicy,
  sha256,
} from "./github-governance-provider-model.mjs";
import { validateProviderCapture } from "./github-governance-provider-validation.mjs";
export * from "./github-governance-provider-model.mjs";
export * from "./github-governance-provider-validation.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), "..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

async function fetchJson(url, token, apiVersion) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": apiVersion, "User-Agent": "pandora-protected-main-provider-audit",
    },
  });
  const text = await response.text();
  let responseBody;
  try { responseBody = text ? JSON.parse(text) : null; }
  catch { responseBody = { non_json_response_sha256: sha256(text), byte_length: Buffer.byteLength(text) }; }
  return { request: { method: "GET", url }, response: { status: response.status, body: responseBody } };
}

export async function fetchProviderCapture({ token, outputDir, headSha, policy = readDefaultPolicy() }) {
  if (!token) throw new Error("GITHUB_ADMIN_READ_TOKEN or GH_TOKEN is required");
  if (!/^[0-9a-f]{40}$/.test(headSha ?? "")) throw new Error("--head-sha must be a full 40-hex SHA");
  const entries = await Promise.all(Object.entries(endpointUrls(policy, headSha)).map(async ([name, url]) =>
    [name, await fetchJson(url, token, policy.provider_capture.api_version)]));
  const envelope = buildCaptureEnvelope({
    observed_at: new Date().toISOString(), api_version: policy.provider_capture.api_version,
    repository: policy.repository.full_name, head_sha: headSha, endpoints: Object.fromEntries(entries),
  });
  fs.mkdirSync(outputDir, { recursive: true });
  const rawPath = path.join(outputDir, "github-governance-provider-raw.json");
  fs.writeFileSync(rawPath, `${JSON.stringify(envelope, null, 2)}\n`);
  const result = validateProviderCapture(envelope, policy);
  const normalizedPath = path.join(outputDir, "github-governance-provider-normalized.json");
  const reportPath = path.join(outputDir, "github-governance-provider-report.json");
  fs.writeFileSync(normalizedPath, `${JSON.stringify(result.normalized, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify({ errors: result.errors }, null, 2)}\n`);
  return { envelope, ...result, rawPath, normalizedPath, reportPath };
}

export function runSelfTest() {
  const result = spawnSync(process.execPath, ["--test", path.join(ROOT, "test/github-governance-provider.test.js")], {
    cwd: ROOT, stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Provider capture self-test failed with status ${result.status}`);
  console.log("Provider capture self-test passed through the independent provider test module.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return runSelfTest();
  if (args[0] === "--fetch") {
    const headIndex = args.indexOf("--head-sha");
    const result = await fetchProviderCapture({
      token: process.env.GITHUB_ADMIN_READ_TOKEN ?? process.env.GH_TOKEN,
      outputDir: args[1], headSha: headIndex >= 0 ? args[headIndex + 1] : null,
    });
    if (result.errors.length) {
      console.error("GitHub governance provider drift or bootstrap block detected:");
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else console.log(`Provider capture matches policy: ${result.rawPath}`);
    return;
  }
  if (args[0] === "--validate") {
    if (!args[1]) throw new Error("Usage: --validate <raw-provider-capture.json>");
    const result = validateProviderCapture(readJson(path.resolve(args[1])));
    if (result.errors.length) {
      console.error("GitHub governance provider drift or bootstrap block detected:");
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else console.log("Raw GitHub provider capture matches policy.");
    return;
  }
  throw new Error("Usage: --self-test | --fetch <dir> --head-sha <sha> | --validate <raw-capture.json>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
}
