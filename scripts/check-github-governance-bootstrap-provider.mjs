#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  fetchProviderCapture,
  readDefaultPolicy,
} from "./check-github-governance-provider.mjs";
import { validateProviderCapture } from "./github-governance-provider-validation.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), "..");
const BOOTSTRAP_POLICY_PATH = path.join(ROOT, ".github/governance/bootstrap-application-policy.json");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function buildBootstrapValidationPolicy() {
  const policy = structuredClone(readDefaultPolicy());
  const bootstrap = readJson(BOOTSTRAP_POLICY_PATH);
  policy.status_checks.required_checks = [bootstrap.application.required_check];
  policy.bootstrap.provider_application_allowed = true;
  policy.provider_capture.validation_phase = bootstrap.application.validation_phase;
  return policy;
}

export function validateBootstrapProviderCapture(envelope, options = {}) {
  return validateProviderCapture(envelope, buildBootstrapValidationPolicy(), {
    ...options,
    phase: "provider_controls",
  });
}

async function main() {
  const args = process.argv.slice(2);
  const policy = buildBootstrapValidationPolicy();
  if (args[0] === "--validate") {
    if (!args[1]) throw new Error("Usage: --validate <raw-provider-capture.json>");
    const result = validateBootstrapProviderCapture(readJson(path.resolve(args[1])));
    if (result.errors.length) {
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else console.log("Provider controls match the bounded bootstrap policy.");
    return;
  }
  if (args[0] === "--fetch") {
    const headIndex = args.indexOf("--head-sha");
    const result = await fetchProviderCapture({
      token: process.env.GITHUB_ADMIN_READ_TOKEN ?? process.env.GH_TOKEN,
      outputDir: args[1],
      headSha: headIndex >= 0 ? args[headIndex + 1] : null,
      policy,
    });
    if (result.errors.length) {
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else console.log(`Bootstrap provider controls match policy: ${result.rawPath}`);
    return;
  }
  throw new Error("Usage: --fetch <dir> --head-sha <sha> | --validate <raw-provider-capture.json>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
}
