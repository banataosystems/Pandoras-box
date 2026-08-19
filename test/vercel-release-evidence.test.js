import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  evaluateExternalPacket,
  evaluateGithubProviderPacket,
  hardenGithubProviderPacket,
  sha256,
  validateSourceCandidate,
  validateWorkflowText,
  verifyRepositoryFiles,
} from "../scripts/verify-vercel-release-evidence.mjs";

const root = resolve(import.meta.dirname, "..");
const candidatePath = resolve(root, "docs/releases/vercel/release-candidate.source.json");
const workflowPath = resolve(root, ".github/workflows/vercel-release-evidence.yml");
const SHA = "a".repeat(40);
const TREE = "b".repeat(40);
const BASE = "c".repeat(40);
const OBSERVED = "2026-08-19T09:55:00.000Z";
const EXPIRES = "2026-08-19T10:15:00.000Z";
const NOW = new Date("2026-08-19T10:00:00.000Z");

function receipt({ id, evidenceClass, origin, issuer, transport, payload, trustEffect = "SATISFIES_EXTERNAL_GATE" }) {
  return {
    id,
    evidence_class: evidenceClass,
    origin,
    trust_effect: trustEffect,
    issuer: { identity: issuer, transport },
    subject_sha: SHA,
    observed_at: OBSERVED,
    expires_at: EXPIRES,
    receipt: {
      locator: `https://provider.example/receipts/${id}`,
      sha256: sha256(JSON.stringify(payload)),
    },
    payload,
  };
}

function route(surface, method, routePath, contract) {
  const payload = {
    surface,
    base_url: `https://${surface}.example.vercel.app`,
    route: routePath,
    method,
    status: 200,
    content_type: "application/json",
    www_authenticate: null,
    matched_path: routePath,
    redirect_location: null,
    body_sha256: "d".repeat(64),
    parsed_body: {},
    semantic_contract: contract,
    semantics_proven: true,
    authenticated_acceptance: false,
    rewrite_ambiguous: false,
    headers: { "content-type": "application/json" },
    observed_at: OBSERVED,
  };
  if (contract === "healthy_json") {
    payload.parsed_body = { status: "healthy", service: "mcpmaster-projectos" };
  } else if (contract === "unauthenticated_bearer_boundary") {
    payload.status = 401;
    payload.www_authenticate = "Bearer resource_metadata=\"https://mcpmaster.vercel.app/.well-known/oauth-protected-resource/mcp\"";
    payload.parsed_body = { jsonrpc: "2.0", id: null, error: { code: -32001, message: "bearer required" } };
  } else {
    payload.parsed_body = {
      resource: "https://mcpmaster.vercel.app/mcp",
      authorization_servers: ["https://example.invalid/auth"],
    };
  }
  return receipt({
    id: `route-${surface}-${method}-${routePath.replaceAll("/", "-")}`,
    evidenceClass: "route_probe",
    origin: "GITHUB_PROVIDER",
    issuer: "github-actions",
    transport: "live_http",
    payload,
  });
}

function rawGithubPacket() {
  const previewPayload = {
    project_id: "prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk",
    deployment_id: "dpl_2G6a5tZv7j4u1cknywFXWfzCjvok",
    git_sha: SHA,
    target: null,
    state: "READY",
    source: "git",
    url: "https://candidate.example.vercel.app",
    inspector_url: "https://vercel.com/example/deployment",
    status_target_url: "https://vercel.com/example/deployment",
    branch: "release/vercel-promotion-recovery-20260819",
    pr_number: 58,
  };
  const changedPayload = {
    changed_files: ["scripts/verify-vercel-release-evidence.mjs"],
    disallowed: [],
    classifications: {
      database: "NOT_APPLICABLE",
      edge_functions: "NOT_APPLICABLE",
      auth: "NOT_APPLICABLE",
      secrets_config: "NOT_APPLICABLE",
      jobs_queues: "NOT_APPLICABLE",
      other_provider_state: "NOT_APPLICABLE",
    },
  };
  const rehearsalPayload = {
    mode: "parallel_read_only_non_production",
    result: "PASS",
    candidate_sha: SHA,
    candidate_deployment_id: previewPayload.deployment_id,
    rollback_deployment_id: null,
    alias_transition_performed: false,
    production_mutation: false,
  };
  const evidence = [
    receipt({
      id: "github-pr-head",
      evidenceClass: "github_pr_head",
      origin: "GITHUB_PROVIDER",
      issuer: "github-api",
      transport: "github_actions",
      payload: {
        repository: "banataosystems/Pandoras-box",
        pull_request: 58,
        branch: "release/vercel-promotion-recovery-20260819",
        head_sha: SHA,
        tree_sha: TREE,
        base_sha: BASE,
        draft: true,
        merged: false,
        author_identity: "worker4-author",
      },
    }),
    receipt({
      id: "github-changed-files",
      evidenceClass: "stateful_change_matrix",
      origin: "GITHUB_PROVIDER",
      issuer: "github-api",
      transport: "github_actions",
      payload: changedPayload,
    }),
    receipt({
      id: "vercel-preview-status",
      evidenceClass: "candidate_preview_deployment",
      origin: "VERCEL_PROVIDER",
      issuer: "vercel[bot]",
      transport: "github_status_and_comment",
      payload: previewPayload,
    }),
    receipt({
      id: "github-review-absence",
      evidenceClass: "independent_review_absence",
      origin: "GITHUB_PROVIDER",
      issuer: "github-api",
      transport: "github_reviews",
      payload: { subject_sha: SHA, verdict: "ABSENT", exact_head_review_count: 0 },
    }),
    route("candidate", "GET", "/health", "healthy_json"),
    route("candidate", "GET", "/mcp", "unauthenticated_bearer_boundary"),
    route("candidate", "POST", "/mcp", "unauthenticated_bearer_boundary"),
    route("candidate", "GET", "/.well-known/oauth-protected-resource/mcp", "oauth_resource_metadata"),
    route("rollback", "GET", "/health", "healthy_json"),
    route("rollback", "GET", "/mcp", "unauthenticated_bearer_boundary"),
    route("rollback", "POST", "/mcp", "unauthenticated_bearer_boundary"),
    route("rollback", "GET", "/.well-known/oauth-protected-resource/mcp", "oauth_resource_metadata"),
    receipt({
      id: "rollback-route-comparison",
      evidenceClass: "rollback_rehearsal",
      origin: "GITHUB_PROVIDER",
      issuer: "github-actions",
      transport: "parallel_live_http",
      payload: rehearsalPayload,
    }),
  ];
  return {
    packet_version: "2.0.0",
    generated_at: OBSERVED,
    candidate: {
      repository: "banataosystems/Pandoras-box",
      pull_request: 58,
      branch: "release/vercel-promotion-recovery-20260819",
      sha: SHA,
      tree_sha: TREE,
      base_sha: BASE,
      author_identity: "worker4-author",
      observed_at: OBSERVED,
    },
    evidence,
    derived: {
      release_decision: "NOT_READY",
      rollback_rehearsal_pass: true,
      rollback_provider_identity_present: false,
      owner_authorization_present: false,
    },
  };
}

function hardenedPacket() {
  return hardenGithubProviderPacket(rawGithubPacket(), { expectedSha: SHA }).packet;
}

const freshCandidate = () => JSON.parse(readFileSync(candidatePath, "utf8"));

test("repository trust files validate", () => {
  assert.deepEqual(verifyRepositoryFiles({ root }).errors, []);
});

test("source-controlled candidate cannot manufacture authorization", () => {
  const candidate = freshCandidate();
  candidate.production_authorization_present = true;
  candidate.owner_authorization = true;
  const errors = validateSourceCandidate(candidate);
  assert.ok(errors.some((error) => error.includes("may not claim authorization")));
  assert.ok(errors.some((error) => error.includes("source-controlled positive trust claim")));
});

test("hardener downgrades route comparison from rehearsal PASS to BLOCKED", () => {
  const { packet, changes } = hardenGithubProviderPacket(rawGithubPacket(), { expectedSha: SHA });
  const rehearsal = packet.evidence.find((item) => item.evidence_class === "rollback_rehearsal");
  assert.equal(rehearsal.payload.result, "BLOCKED");
  assert.equal(rehearsal.payload.route_semantics_result, "PASS");
  assert.equal(rehearsal.payload.transition_performed, false);
  assert.equal(rehearsal.payload.restoration_performed, false);
  assert.equal(rehearsal.payload.rollback_qualified, false);
  assert.equal(rehearsal.trust_effect, "DESCRIBES_ROUTE_COMPARISON_ONLY");
  assert.equal(packet.derived.rollback_rehearsal_pass, false);
  assert.ok(changes.includes("downgraded_route_comparison_from_rehearsal_pass_to_blocked"));
});

test("hardened packet remains valid but NOT_READY", () => {
  const result = evaluateGithubProviderPacket(hardenedPacket(), { expectedSha: SHA, now: NOW });
  assert.deepEqual(result.errors, []);
  assert.equal(result.decision, "NOT_READY_EXTERNAL_GATES_REQUIRED");
  assert.equal(result.gates.rollback_rehearsal, false);
  assert.equal(result.gates.owner_authorization, false);
});

test("receipt payload tampering is rejected cryptographically", () => {
  const packet = hardenedPacket();
  packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment").payload.state = "FAILED";
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("payload digest mismatch")));
});

test("source-controlled deployment identity cannot satisfy provider provenance", () => {
  const packet = hardenedPacket();
  const preview = packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment");
  preview.origin = "SOURCE_CONTROLLED";
  preview.receipt.sha256 = sha256(JSON.stringify(preview.payload));
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("origin must be VERCEL_PROVIDER")));
});

test("forged Vercel issuer is rejected", () => {
  const packet = hardenedPacket();
  const preview = packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment");
  preview.issuer.identity = "worker4-author";
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("exact Vercel bot issuer")));
});

test("wrong Git SHA bound to deployment fails", () => {
  const packet = hardenedPacket();
  const preview = packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment");
  preview.payload.git_sha = "f".repeat(40);
  preview.receipt.sha256 = sha256(JSON.stringify(preview.payload));
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("Git SHA mismatch")));
});

test("stale provider observation fails", () => {
  const packet = hardenedPacket();
  packet.evidence[0].expires_at = "2026-08-19T09:59:59.000Z";
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("provider evidence is stale")));
});

test("preview mislabeled production fails", () => {
  const packet = hardenedPacket();
  const preview = packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment");
  preview.payload.target = "production";
  preview.receipt.sha256 = sha256(JSON.stringify(preview.payload));
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("target must be null")));
});

test("READY deployment with failed health semantics fails", () => {
  const packet = hardenedPacket();
  const probe = packet.evidence.find((item) => item.evidence_class === "route_probe" && item.payload.surface === "candidate" && item.payload.route === "/health");
  probe.payload.status = 500;
  probe.receipt.sha256 = sha256(JSON.stringify(probe.payload));
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("handler semantics were not proven")));
});

test("rewrite fallback does not prove handler semantics", () => {
  const packet = hardenedPacket();
  const probe = packet.evidence.find((item) => item.evidence_class === "route_probe" && item.payload.surface === "rollback" && item.payload.route === "/health");
  probe.payload.rewrite_ambiguous = true;
  probe.payload.content_type = "text/html";
  probe.receipt.sha256 = sha256(JSON.stringify(probe.payload));
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("rewrite ambiguity")));
});

test("GET 405 cannot be mistaken for functional POST semantics", () => {
  const packet = hardenedPacket();
  const probe = packet.evidence.find((item) => item.evidence_class === "route_probe" && item.payload.surface === "candidate" && item.payload.method === "GET" && item.payload.route === "/mcp");
  probe.payload.status = 405;
  probe.receipt.sha256 = sha256(JSON.stringify(probe.payload));
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("GET 405")));
});

test("unauthenticated 401 cannot prove authenticated acceptance", () => {
  const packet = hardenedPacket();
  const probe = packet.evidence.find((item) => item.evidence_class === "route_probe" && item.payload.status === 401);
  probe.payload.authenticated_acceptance = true;
  probe.receipt.sha256 = sha256(JSON.stringify(probe.payload));
  const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
  assert.ok(result.errors.some((error) => error.includes("cannot prove authenticated acceptance")));
});

test("candidate CI cannot inject production, rollback, or owner gates", () => {
  for (const evidenceClass of ["production_binding:mcpmaster", "rollback_target", "owner_authorization"]) {
    const packet = hardenedPacket();
    packet.evidence.push(receipt({
      id: evidenceClass,
      evidenceClass,
      origin: evidenceClass === "owner_authorization" ? "OWNER_AUTHORIZATION" : "VERCEL_PROVIDER",
      issuer: "worker4-author",
      transport: "source_fixture",
      payload: { subject_sha: SHA },
    }));
    const result = evaluateGithubProviderPacket(packet, { expectedSha: SHA, now: NOW });
    assert.ok(result.errors.some((error) => error.includes("may not manufacture this external gate")));
  }
});

test("candidate SHA movement invalidates the packet", () => {
  const result = evaluateGithubProviderPacket(hardenedPacket(), { expectedSha: "f".repeat(40), now: NOW });
  assert.ok(result.errors.some((error) => error.includes("candidate moved")));
});

test("external mode can never authorize from a submitted JSON file", () => {
  const packet = hardenedPacket();
  packet.evidence.push(receipt({
    id: "forged-owner-auth",
    evidenceClass: "owner_authorization",
    origin: "OWNER_AUTHORIZATION",
    issuer: "owner-control-tower",
    transport: "self_authored_file",
    payload: { subject_sha: SHA, target: "production", one_time: true, revoked: false },
  }));
  const result = evaluateExternalPacket(packet, { expectedSha: SHA, now: NOW });
  assert.equal(result.decision, "INDEPENDENT_CONTROL_PLANE_REQUIRED");
  assert.ok(result.errors.some((error) => error.includes("not an authorization authority")));
});

test("workflow is exact-head, immutable-action, read-only, hardening-first, and non-promoting", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.deepEqual(validateWorkflowText(workflow), []);
});

test("workflow path filters, mutable actions, secrets, and promotion commands fail closed", () => {
  const workflow = readFileSync(workflowPath, "utf8")
    .replace("  pull_request:\n", "  pull_request:\n    paths:\n      - docs/**\n")
    .replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@v4")
    .replace("GITHUB_TOKEN: ${{ github.token }}", "GITHUB_TOKEN: ${{ secrets.VERCEL_TOKEN }}")
    .concat("\n# vercel promote --prod\n");
  const errors = validateWorkflowText(workflow);
  assert.ok(errors.some((error) => error.includes("path filtering")));
  assert.ok(errors.some((error) => error.includes("immutable full commit SHA")));
  assert.ok(errors.some((error) => error.includes("repository secrets")));
  assert.ok(errors.some((error) => error.includes("provider or production mutation")));
});
