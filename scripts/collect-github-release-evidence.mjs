#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const API = "https://api.github.com";
const SHA40 = /^[0-9a-f]{40}$/;
const DEPLOYMENT_SHORT_ID = /^[A-Za-z0-9]{20,}$/;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function expiry(minutes = 20) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function sanitizeHeaders(headers) {
  const allowed = [
    "content-type",
    "www-authenticate",
    "x-matched-path",
    "x-vercel-cache",
    "x-vercel-id",
    "cache-control",
  ];
  const result = {};
  for (const key of allowed) {
    const value = headers.get(key);
    if (value !== null) result[key] = value;
  }
  return result;
}

async function githubJson(path, token, { attempts = 1, pauseMs = 0 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "pandora-worker4-release-evidence",
      },
    });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);
    lastError = new Error(`GitHub ${path} returned ${response.status}: ${text.slice(0, 300)}`);
    if (attempt < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, pauseMs));
  }
  throw lastError;
}

export function extractVercelComment(comment) {
  if (comment?.user?.login !== "vercel[bot]") return null;
  const body = String(comment.body ?? "");
  const inspector = body.match(/https:\/\/vercel\.com\/[^\s)\]]+\/([A-Za-z0-9]{20,})/);
  const previewMatches = [...body.matchAll(/https:\/\/([a-z0-9-]+\.vercel\.app)/g)];
  const preview = previewMatches
    .map((match) => `https://${match[1]}`)
    .find((url) => !url.includes("agents-vade-review"));
  const ready = /\bReady\b/i.test(body);
  if (!inspector || !preview || !ready) return null;
  const shortId = inspector[1];
  if (!DEPLOYMENT_SHORT_ID.test(shortId)) return null;
  return {
    issuer: comment.user.login,
    comment_id: comment.id,
    comment_url: comment.html_url ?? comment.url,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    deployment_id: `dpl_${shortId}`,
    inspector_url: inspector[0],
    preview_url: preview,
    state: "READY",
    raw_sha256: sha256(body),
  };
}

export function normalizeVercelStatus(combinedStatus) {
  const status = (combinedStatus?.statuses ?? []).find((item) => item.context === "Vercel");
  if (!status) return null;
  const match = String(status.target_url ?? "").match(/\/([A-Za-z0-9]{20,})$/);
  return {
    context: status.context,
    state: status.state,
    target_url: status.target_url,
    deployment_id: match ? `dpl_${match[1]}` : null,
    creator: status.creator?.login ?? null,
    updated_at: status.updated_at ?? null,
    raw_sha256: sha256(JSON.stringify(status)),
  };
}

function contentType(headers) {
  return headers.get("content-type") ?? "";
}

function safeParsedBody(text, headers) {
  if (!contentType(headers).includes("application/json")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function semanticResult(contract, status, headers, parsed) {
  if (contract === "healthy_json") {
    return status === 200 && contentType(headers).includes("application/json") && parsed?.status === "healthy";
  }
  if (contract === "unauthenticated_bearer_boundary") {
    return status === 401 && contentType(headers).includes("application/json") &&
      (headers.get("www-authenticate") ?? "").toLowerCase().includes("bearer") && parsed?.error?.code === -32001;
  }
  if (contract === "oauth_resource_metadata") {
    return status === 200 && contentType(headers).includes("application/json") &&
      typeof parsed?.resource === "string" && Array.isArray(parsed?.authorization_servers);
  }
  return false;
}

export async function probeRoute({ surface, baseUrl, route, method, semanticContract }) {
  const url = new URL(route, baseUrl).toString();
  const request = {
    method,
    headers: {
      Accept: "application/json",
      "User-Agent": "pandora-worker4-read-only-rehearsal",
      "X-Pandora-Rehearsal": "non-production-read-only",
    },
    redirect: "manual",
  };
  if (method === "POST") {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify({
      jsonrpc: "2.0",
      id: "worker4-rehearsal",
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "pandora-worker4", version: "1" },
      },
    });
  }
  const startedAt = nowIso();
  const response = await fetch(url, request);
  const text = await response.text();
  const parsed = safeParsedBody(text, response.headers);
  const headers = sanitizeHeaders(response.headers);
  const matchedPath = headers["x-matched-path"] ?? null;
  const semanticPass = semanticResult(semanticContract, response.status, response.headers, parsed);
  return {
    surface,
    base_url: baseUrl,
    route,
    method,
    status: response.status,
    content_type: contentType(response.headers),
    www_authenticate: response.headers.get("www-authenticate"),
    matched_path: matchedPath,
    redirect_location: response.headers.get("location"),
    body_sha256: sha256(text),
    parsed_body: parsed,
    semantic_contract: semanticContract,
    semantics_proven: semanticPass,
    authenticated_acceptance: false,
    rewrite_ambiguous: response.status === 200 && contentType(response.headers).includes("text/html") && !matchedPath,
    headers,
    observed_at: startedAt,
  };
}

function receipt({ id, evidenceClass, origin, issuer, subjectSha, observedAt, payload, locator }) {
  const raw = JSON.stringify(payload);
  return {
    id,
    evidence_class: evidenceClass,
    origin,
    trust_effect: origin === "SOURCE_CONTROLLED" ? "DESCRIBES_EXPECTATION_ONLY" : "SATISFIES_EXTERNAL_GATE",
    issuer,
    subject_sha: subjectSha,
    observed_at: observedAt,
    expires_at: expiry(20),
    receipt: {
      locator,
      sha256: sha256(raw),
    },
    payload,
  };
}

function changedPathClassifications(files, allowedPrefixes) {
  const changedFiles = files.map((item) => item.filename);
  const disallowed = changedFiles.filter((path) => !allowedPrefixes.some((prefix) => path === prefix || path.startsWith(prefix)));
  const classifications = {
    database: "NOT_APPLICABLE",
    edge_functions: "NOT_APPLICABLE",
    auth: "NOT_APPLICABLE",
    secrets_config: "NOT_APPLICABLE",
    jobs_queues: "NOT_APPLICABLE",
    other_provider_state: "NOT_APPLICABLE",
  };
  if (changedFiles.some((path) => path.startsWith("supabase/migrations/"))) classifications.database = "DOCUMENTED_ONLY";
  if (changedFiles.some((path) => path.startsWith("supabase/functions/"))) classifications.edge_functions = "DOCUMENTED_ONLY";
  if (changedFiles.some((path) => /auth|oauth|identity/i.test(path) && !path.startsWith("docs/"))) classifications.auth = "DOCUMENTED_ONLY";
  if (changedFiles.some((path) => /\.env|secret|vercel\.json/i.test(path) && !path.startsWith("docs/"))) classifications.secrets_config = "DOCUMENTED_ONLY";
  if (changedFiles.some((path) => /cron|queue|job/i.test(path) && !path.startsWith("docs/"))) classifications.jobs_queues = "DOCUMENTED_ONLY";
  return { changed_files: changedFiles, disallowed, classifications };
}

function independentReviewStatus(reviews, headSha, authorLogin) {
  const exact = reviews.filter((review) => review.commit_id === headSha);
  const qualifying = exact.find((review) => review.state === "APPROVED" && review.user?.login && review.user.login !== authorLogin);
  return {
    exact_head_review_count: exact.length,
    qualifying_review: qualifying
      ? {
          review_id: qualifying.id,
          reviewer_identity: qualifying.user.login,
          verdict: "PASS",
          subject_sha: headSha,
          submitted_at: qualifying.submitted_at,
        }
      : null,
  };
}

async function collect() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const expectedSha = process.env.EXPECTED_SHA || process.env.GITHUB_SHA;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repository || !expectedSha || !eventPath) {
    throw new Error("GITHUB_TOKEN, GITHUB_REPOSITORY, EXPECTED_SHA/GITHUB_SHA, and GITHUB_EVENT_PATH are required");
  }
  if (!SHA40.test(expectedSha)) throw new Error("Expected exact 40-character candidate SHA");
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const prNumber = event.pull_request?.number ?? event.number;
  if (prNumber !== 58) throw new Error(`Expected PR 58, received ${prNumber}`);
  const candidateSpec = JSON.parse(
    readFileSync(resolve("docs/releases/vercel/release-candidate.source.json"), "utf8"),
  );
  const [owner, repo] = repository.split("/");
  const pr = await githubJson(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
  if (pr.head.sha !== expectedSha) throw new Error(`PR head moved: ${pr.head.sha} != ${expectedSha}`);
  const commit = await githubJson(`/repos/${owner}/${repo}/commits/${expectedSha}`, token);
  const files = await githubJson(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, token);
  const reviews = await githubJson(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`, token);

  let combinedStatus = null;
  let comments = null;
  let vercelStatus = null;
  let vercelComment = null;
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    combinedStatus = await githubJson(`/repos/${owner}/${repo}/commits/${expectedSha}/status`, token);
    comments = await githubJson(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`, token);
    vercelStatus = normalizeVercelStatus(combinedStatus);
    vercelComment = comments.map(extractVercelComment).filter(Boolean).at(-1) ?? null;
    if (
      vercelStatus?.state === "success" &&
      vercelStatus.deployment_id &&
      vercelComment?.deployment_id === vercelStatus.deployment_id
    ) break;
    if (attempt < 24) await new Promise((resolvePromise) => setTimeout(resolvePromise, 15_000));
  }
  if (!vercelStatus || vercelStatus.state !== "success") throw new Error("Fresh Vercel status did not become successful");
  if (!vercelComment) throw new Error("Fresh Vercel bot deployment comment was not found");
  if (vercelComment.deployment_id !== vercelStatus.deployment_id) {
    throw new Error("Vercel bot comment and Vercel commit status disagree on deployment identity");
  }

  const observedAt = nowIso();
  const changed = changedPathClassifications(files, candidateSpec.allowed_changed_path_prefixes);
  if (changed.disallowed.length) throw new Error(`Worker 4 scope collision: ${changed.disallowed.join(", ")}`);
  const review = independentReviewStatus(reviews, expectedSha, pr.user.login);
  const routeContracts = candidateSpec.critical_routes;
  const candidateUrl = vercelComment.preview_url;
  const rollbackUrl = candidateSpec.canonical_targets.mcpmaster.rehearsal_rollback_alias;
  const routeProbes = [];
  for (const surface of [
    ["candidate", candidateUrl],
    ["rollback", rollbackUrl],
  ]) {
    for (const contract of routeContracts) {
      for (const method of contract.methods) {
        routeProbes.push(
          await probeRoute({
            surface: surface[0],
            baseUrl: surface[1],
            route: contract.route,
            method,
            semanticContract: contract.semantic_contract,
          }),
        );
      }
    }
  }
  const allRouteSemantics = routeProbes.every((probe) => probe.semantics_proven && !probe.rewrite_ambiguous);

  const evidence = [
    receipt({
      id: "github-pr-head",
      evidenceClass: "github_pr_head",
      origin: "GITHUB_PROVIDER",
      issuer: { identity: "github-api", transport: "github_actions" },
      subjectSha: expectedSha,
      observedAt,
      locator: pr.html_url,
      payload: {
        repository,
        pull_request: pr.number,
        branch: pr.head.ref,
        head_sha: pr.head.sha,
        tree_sha: commit.commit.tree.sha,
        base_sha: pr.base.sha,
        draft: pr.draft,
        merged: pr.merged,
        author_identity: pr.user.login,
      },
    }),
    receipt({
      id: "github-changed-files",
      evidenceClass: "stateful_change_matrix",
      origin: "GITHUB_PROVIDER",
      issuer: { identity: "github-api", transport: "github_actions" },
      subjectSha: expectedSha,
      observedAt,
      locator: `${pr.html_url}/files`,
      payload: changed,
    }),
    receipt({
      id: "vercel-preview-status",
      evidenceClass: "candidate_preview_deployment",
      origin: "VERCEL_PROVIDER",
      issuer: { identity: "vercel[bot]", transport: "github_status_and_comment" },
      subjectSha: expectedSha,
      observedAt,
      locator: vercelComment.comment_url,
      payload: {
        project_id: candidateSpec.canonical_targets.mcpmaster.vercel_project_id,
        deployment_id: vercelComment.deployment_id,
        git_sha: expectedSha,
        target: null,
        state: "READY",
        source: "git",
        url: vercelComment.preview_url,
        inspector_url: vercelComment.inspector_url,
        status_target_url: vercelStatus.target_url,
        branch: pr.head.ref,
        pr_number: pr.number,
      },
    }),
    receipt({
      id: "github-exact-head-review-state",
      evidenceClass: review.qualifying_review ? "independent_review" : "independent_review_absence",
      origin: review.qualifying_review ? "INDEPENDENT_REVIEWER" : "GITHUB_PROVIDER",
      issuer: {
        identity: review.qualifying_review?.reviewer_identity ?? "github-api",
        transport: "github_reviews",
      },
      subjectSha: expectedSha,
      observedAt,
      locator: `${pr.html_url}#pullrequestreview-0`,
      payload: review.qualifying_review ?? {
        subject_sha: expectedSha,
        verdict: "ABSENT",
        exact_head_review_count: review.exact_head_review_count,
      },
    }),
  ];

  routeProbes.forEach((probe, index) => {
    evidence.push(
      receipt({
        id: `route-probe-${index + 1}`,
        evidenceClass: "route_probe",
        origin: "GITHUB_PROVIDER",
        issuer: { identity: "github-actions", transport: "live_http" },
        subjectSha: expectedSha,
        observedAt: probe.observed_at,
        locator: `${probe.base_url}${probe.route}`,
        payload: probe,
      }),
    );
  });

  evidence.push(
    receipt({
      id: "rollback-read-only-rehearsal",
      evidenceClass: "rollback_rehearsal",
      origin: "GITHUB_PROVIDER",
      issuer: { identity: "github-actions", transport: "parallel_live_http" },
      subjectSha: expectedSha,
      observedAt,
      locator: `${pr.html_url}/checks`,
      payload: {
        mode: "parallel_read_only_non_production",
        result: allRouteSemantics ? "PASS" : "FAIL",
        candidate_sha: expectedSha,
        candidate_deployment_id: vercelComment.deployment_id,
        rollback_deployment_id: null,
        candidate_url: candidateUrl,
        rollback_url: rollbackUrl,
        production_mutation: false,
        alias_transition_performed: false,
        limitation: "The GitHub/Vercel integration proves the candidate preview. Exact rollback deployment identity and target require a separate fresh Vercel provider receipt before qualification.",
      },
    }),
  );

  const packet = {
    packet_version: "2.0.0",
    generated_at: observedAt,
    candidate: {
      repository,
      pull_request: pr.number,
      branch: pr.head.ref,
      sha: expectedSha,
      tree_sha: commit.commit.tree.sha,
      base_sha: pr.base.sha,
      author_identity: pr.user.login,
      observed_at: observedAt,
    },
    evidence,
    derived: {
      source_scope_clean: changed.disallowed.length === 0,
      candidate_preview_provider_bound: true,
      critical_route_semantics_pass: allRouteSemantics,
      independent_review_present: Boolean(review.qualifying_review),
      owner_authorization_present: false,
      rollback_provider_identity_present: false,
      release_decision: "NOT_READY",
      reason: "Vercel production/rollback receipts, exact rollback identity, independent exact-head review, and owner authorization are external gates and are not self-authored by this workflow.",
      production_mutation: false,
    },
  };
  return packet;
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : resolve("release-evidence.github.json");
  const packet = await collect();
  const text = JSON.stringify(packet, null, 2) + "\n";
  writeFileSync(output, text);
  writeFileSync(`${output}.sha256`, `${sha256(text)}  ${output.split("/").at(-1)}\n`);
  console.log(`packet=${output}`);
  console.log(`packet_sha256=${sha256(text)}`);
  console.log(`candidate_sha=${packet.candidate.sha}`);
  console.log(`candidate_preview=${packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment").payload.deployment_id}`);
  console.log(`release_decision=${packet.derived.release_decision}`);
  console.log("production_mutation=none");
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
