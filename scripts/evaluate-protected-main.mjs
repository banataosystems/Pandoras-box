#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), "..");
const API_VERSION = "2026-03-10";
const API_BASE = "https://api.github.com";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pathIsProtected(changedPath, protectedPaths) {
  return protectedPaths.some((protectedPath) =>
    protectedPath.endsWith("/")
      ? changedPath.startsWith(protectedPath)
      : changedPath === protectedPath,
  );
}

function latestReviewsByLogin(reviews) {
  const latest = new Map();
  const sorted = [...reviews].sort((left, right) =>
    Date.parse(left.submitted_at ?? 0) - Date.parse(right.submitted_at ?? 0),
  );
  for (const review of sorted) {
    const login = review.user?.login;
    if (login) latest.set(login, review);
  }
  return latest;
}

function runIdFromDetailsUrl(detailsUrl) {
  const match = String(detailsUrl ?? "").match(/\/actions\/runs\/(\d+)(?:$|[/?#])/);
  return match ? Number(match[1]) : null;
}

export function evaluateTrustedGate({
  policy,
  reviewerRegistry,
  pullRequest,
  changedFiles,
  reviews,
  checkRuns,
  candidateWorkflow,
  candidateWorkflowRun,
}) {
  const errors = [];
  const pending = [];
  const repository = policy.repository.full_name;
  const headSha = pullRequest.head?.sha;
  const author = pullRequest.user?.login;

  if (!Number.isInteger(pullRequest.number)) errors.push("pull request number is missing");
  if (pullRequest.base?.ref !== policy.repository.default_branch) errors.push("pull request does not target canonical main");
  if (pullRequest.base?.repo?.full_name && pullRequest.base.repo.full_name !== repository) {
    errors.push("pull request base repository drifted");
  }
  if (pullRequest.head?.repo?.full_name !== repository) {
    errors.push("fork pull requests are not eligible for the trusted write-capable evaluator");
  }
  if (!/^[0-9a-f]{40}$/.test(headSha ?? "")) errors.push("pull request head is not a full commit SHA");
  if (!author) errors.push("pull request author is missing");

  const candidatePolicy = policy.status_checks.candidate_proof;
  const exactCandidateRuns = checkRuns
    .filter((run) => run.name === candidatePolicy.context && run.head_sha === headSha)
    .sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));
  const candidateCheck = exactCandidateRuns[0] ?? null;

  if (!candidateCheck) {
    pending.push("exact-head candidate proof has not reported yet");
  } else {
    if (candidateCheck.app?.id !== candidatePolicy.app_id || candidateCheck.app?.slug !== candidatePolicy.app_slug) {
      errors.push("candidate proof was not produced by the expected GitHub Actions app");
    }
    if (candidateCheck.status !== "completed") {
      pending.push("candidate proof is not completed");
    } else if (candidateCheck.conclusion !== "success") {
      errors.push("candidate proof did not succeed");
    }
    const runId = runIdFromDetailsUrl(candidateCheck.details_url);
    if (!runId || runId !== candidateWorkflowRun?.id) {
      errors.push("candidate proof details URL is not bound to the fetched workflow run");
    }
  }

  if (candidateWorkflow?.path !== policy.authority.candidate_workflow) {
    errors.push("candidate workflow path does not match trusted policy");
  }
  if (candidateWorkflow?.state !== "active") errors.push("candidate workflow is not active on the default branch");
  if (candidateWorkflowRun) {
    if (candidateWorkflowRun.workflow_id !== candidateWorkflow?.id) {
      errors.push("candidate proof run does not belong to the default-branch candidate workflow identity");
    }
    if (candidateWorkflowRun.head_sha !== headSha) errors.push("candidate proof run is not bound to the exact PR head");
    if (candidateWorkflowRun.event !== "pull_request") errors.push("candidate proof run did not originate from pull_request");
    if (candidateWorkflowRun.status !== "completed") pending.push("candidate workflow run is not completed");
    if (candidateWorkflowRun.status === "completed" && candidateWorkflowRun.conclusion !== "success") {
      errors.push("candidate workflow run did not succeed");
    }
  } else if (candidateCheck) {
    errors.push("candidate workflow run metadata is missing");
  }

  const highRiskPaths = changedFiles
    .map((file) => file.filename)
    .filter((filePath) => pathIsProtected(filePath, policy.pull_request.high_risk_governance_review.protected_paths));

  const registeredReviewers = new Set(
    (reviewerRegistry.reviewers ?? [])
      .filter((reviewer) => reviewer.provider_verified === true && reviewer.roles?.includes("governance"))
      .map((reviewer) => reviewer.login),
  );

  if (highRiskPaths.length > 0) {
    if (reviewerRegistry.application_gate !== "open") {
      errors.push("governance reviewer registry is not open");
    }
    const latest = latestReviewsByLogin(reviews);
    const qualifying = [...latest.values()].filter((review) =>
      review.state === "APPROVED" &&
      review.commit_id === headSha &&
      review.user?.login !== author &&
      registeredReviewers.has(review.user?.login),
    );
    if (qualifying.length < 1) {
      errors.push("governance-critical paths lack an exact-head approval from a provider-verified registered non-author reviewer");
    }
  }

  const state = errors.length ? "failure" : pending.length ? "pending" : "success";
  return {
    state,
    errors,
    pending,
    facts: {
      pull_request: pullRequest.number,
      head_sha: headSha,
      author,
      changed_file_count: changedFiles.length,
      governance_critical_paths: highRiskPaths,
      registered_governance_reviewers: [...registeredReviewers].sort(),
      candidate_check_id: candidateCheck?.id ?? null,
      candidate_workflow_run_id: candidateWorkflowRun?.id ?? null,
    },
  };
}

async function githubJson(url, token, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "pandora-trusted-protected-main",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${url}: ${body?.message ?? "unknown error"}`);
  }
  return body;
}

async function fetchAll(url, token) {
  const items = [];
  let page = 1;
  while (true) {
    const separator = url.includes("?") ? "&" : "?";
    const batch = await githubJson(`${url}${separator}per_page=100&page=${page}`, token);
    if (!Array.isArray(batch)) throw new Error(`Expected array from ${url}`);
    items.push(...batch);
    if (batch.length < 100) return items;
    page += 1;
  }
}

function extractPullRequestNumber(event) {
  if (Number.isInteger(event.pull_request?.number)) return event.pull_request.number;
  const workflowPull = event.workflow_run?.pull_requests?.[0];
  if (Number.isInteger(workflowPull?.number)) return workflowPull.number;
  return null;
}

function checkOutput(result) {
  const lines = [
    `Exact head: \`${result.facts.head_sha}\``,
    `Changed files: ${result.facts.changed_file_count}`,
    `Governance-critical paths: ${result.facts.governance_critical_paths.length}`,
  ];
  if (result.errors.length) {
    lines.push("", "Blocking findings:", ...result.errors.map((error) => `- ${error}`));
  }
  if (result.pending.length) {
    lines.push("", "Pending evidence:", ...result.pending.map((item) => `- ${item}`));
  }
  if (!result.errors.length && !result.pending.length) {
    lines.push("", "All trusted exact-head gates passed.");
  }
  return lines.join("\n").slice(0, 65000);
}

async function upsertTrustedCheck({ baseUrl, token, policy, pullRequest, checkRuns, result }) {
  const context = policy.status_checks.required_checks[0];
  const externalId = `protected-main:${pullRequest.number}:${pullRequest.head.sha}`;
  const existing = checkRuns
    .filter((run) => run.name === context.context && run.external_id === externalId)
    .sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0))[0];
  const payload = {
    name: context.context,
    head_sha: pullRequest.head.sha,
    external_id: externalId,
    details_url: `https://github.com/${policy.repository.full_name}/pull/${pullRequest.number}`,
    status: result.state === "pending" ? "in_progress" : "completed",
    output: {
      title: result.state === "success"
        ? "Trusted protected-main gate passed"
        : result.state === "pending"
          ? "Trusted protected-main gate is waiting for exact-head evidence"
          : "Trusted protected-main gate failed closed",
      summary: checkOutput(result),
    },
  };
  if (result.state !== "pending") payload.conclusion = result.state;
  const url = existing ? `${baseUrl}/check-runs/${existing.id}` : `${baseUrl}/check-runs`;
  return githubJson(url, token, { method: existing ? "PATCH" : "POST", body: payload });
}

export async function evaluateFromGitHub({ token, eventPath, root = ROOT }) {
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const event = readJson(eventPath);
  const policy = readJson(path.join(root, ".github/governance/main-policy.json"));
  const reviewerRegistry = readJson(path.join(root, ".github/governance/reviewer-registry.json"));
  const repository = policy.repository.full_name;
  const baseUrl = `${API_BASE}/repos/${repository}`;
  const prNumber = extractPullRequestNumber(event);
  if (!prNumber) throw new Error("Event is not bound to a pull request");

  const pullRequest = await githubJson(`${baseUrl}/pulls/${prNumber}`, token);
  const [changedFiles, reviews, checkRunResponse, candidateWorkflow] = await Promise.all([
    fetchAll(`${baseUrl}/pulls/${prNumber}/files`, token),
    fetchAll(`${baseUrl}/pulls/${prNumber}/reviews`, token),
    githubJson(`${baseUrl}/commits/${pullRequest.head.sha}/check-runs?per_page=100`, token),
    githubJson(`${baseUrl}/actions/workflows/${encodeURIComponent(path.basename(policy.authority.candidate_workflow))}`, token),
  ]);
  const checkRuns = checkRunResponse.check_runs ?? [];
  const candidateCheck = [...checkRuns]
    .filter((run) => run.name === policy.status_checks.candidate_proof.context)
    .sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0))[0];
  const runId = runIdFromDetailsUrl(candidateCheck?.details_url);
  const candidateWorkflowRun = runId ? await githubJson(`${baseUrl}/actions/runs/${runId}`, token) : null;

  const result = evaluateTrustedGate({
    policy,
    reviewerRegistry,
    pullRequest,
    changedFiles,
    reviews,
    checkRuns,
    candidateWorkflow,
    candidateWorkflowRun,
  });
  const check = await upsertTrustedCheck({ baseUrl, token, policy, pullRequest, checkRuns, result });
  return { result, check_id: check.id };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "--github-event") {
    throw new Error("Usage: node scripts/evaluate-protected-main.mjs --github-event <event.json>");
  }
  const eventPath = args[1] ?? process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GitHub event path is required");
  const { result, check_id: checkId } = await evaluateFromGitHub({
    token: process.env.GITHUB_TOKEN,
    eventPath,
  });
  console.log(JSON.stringify({ state: result.state, check_id: checkId, facts: result.facts }));
  if (result.state === "failure") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
