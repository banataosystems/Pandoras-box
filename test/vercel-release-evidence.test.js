import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  evaluateExternalPacket,
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
const NOW = new Date("2026-08-19T10:00:00.000Z");
const OBSERVED = "2026-08-19T09:55:00.000Z";
const EXPIRES = "2026-08-19T10:15:00.000Z";
const HASH = "d".repeat(64);

function receipt({ id, evidenceClass, origin, payload, subjectSha = SHA, issuer = "external-issuer" }) {
  return {
    id,
    evidence_class: evidenceClass,
    origin,
    trust_effect: origin === "SOURCE_CONTROLLED" ? "DESCRIBES_EXPECTATION_ONLY" : "SATISFIES_EXTERNAL_GATE",
    issuer: { identity: issuer, transport: "test" },
    subject_sha: subjectSha,
    observed_at: OBSERVED,
    expires_at: EXPIRES,
    receipt: { locator: `provider://receipt/${id}`, sha256: HASH },
    payload,
  };
}

function route(surface, method, routePath, contract) {
  const payload = {
    surface,
    method,
    route: routePath,
    semantic_contract: contract,
    content_type: "application/json",
    matched_path: routePath,
    rewrite_ambiguous: false,
    authenticated_acceptance: false,
  };
  if (contract === "healthy_json") {
    Object.assign(payload, { status: 200, parsed_body: { status: "healthy", service: "mcpmaster-projectos" } });
  } else if (contract === "unauthenticated_bearer_boundary") {
    Object.assign(payload, {
      status: 401,
      www_authenticate: "Bearer resource_metadata=\"https://mcpmaster.vercel.app/.well-known/oauth-protected-resource/mcp\"",
      parsed_body: { jsonrpc: "2.0", id: null, error: { code: -32001, message: "bearer required" } },
    });
  } else {
    Object.assign(payload, {
      status: 200,
      parsed_body: {
        resource: "https://mcpmaster.vercel.app/mcp",
        authorization_servers: ["https://example.invalid/auth"],
      },
    });
  }
  return receipt({
    id: `route-${surface}-${method}-${routePath.replaceAll("/", "-")}`,
    evidenceClass: "route_probe",
    origin: "GITHUB_PROVIDER",
    payload,
    issuer: "github-actions",
  });
}

function validPacket({ includeReview = true, includeAuthorization = false } = {}) {
  const evidence = [
    receipt({
      id: "preview",
      evidenceClass: "candidate_preview_deployment",
      origin: "VERCEL_PROVIDER",
      issuer: "vercel[bot]",
      payload: {
        project_id: "prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk",
        deployment_id: "dpl_2G6a5tZv7j4u1cknywFXWfzCjvok",
        git_sha: SHA,
        target: null,
        state: "READY",
        source: "git",
        url: "https://candidate.example.vercel.app",
      },
    }),
    receipt({
      id: "prod-mcp",
      evidenceClass: "production_binding:mcpmaster",
      origin: "VERCEL_PROVIDER",
      payload: {
        project_id: "prj_Y5rZVcq8xJVzHVt4uvfmg9wPvXMk",
        repository: "banataosystems/Pandoras-box",
        branch: "main",
        deployment_id: "dpl_CLg3L8iDJpCHVLfRtyNjMFoSis3Y",
        git_sha: BASE,
        target: "production",
        state: "READY",
        source: "git",
        aliases: ["https://mcpmaster.vercel.app"],
      },
    }),
    receipt({
      id: "prod-memory",
      evidenceClass: "production_binding:memory",
      origin: "VERCEL_PROVIDER",
      payload: {
        project_id: "prj_brg3BJDcHfSftHH84NhnFtDJAnDO",
        repository: "banataosystems/pandoras-box-memory",
        branch: "main",
        deployment_id: "dpl_G8trVgoSegxCtu5hE51KkBvCtchW",
        git_sha: "e".repeat(40),
        target: "production",
        state: "READY",
        source: "git",
        aliases: ["https://pandorasbox-memory.vercel.app"],
      },
    }),
    receipt({
      id: "rollback",
      evidenceClass: "rollback_target",
      origin: "VERCEL_PROVIDER",
      payload: {
        deployment_id: "dpl_5Y3YmFgQ1Heg5nrH73g8uBvraELm",
        git_sha: BASE,
        state: "READY",
        retrievable: true,
        source: "git",
        target: "staging",
      },
    }),
    receipt({
      id: "stateful",
      evidenceClass: "stateful_change_matrix",
      origin: "GITHUB_PROVIDER",
      payload: {
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
      },
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
      id: "rehearsal",
      evidenceClass: "rollback_rehearsal",
      origin: "GITHUB_PROVIDER",
      issuer: "github-actions",
      payload: {
        mode: "parallel_read_only_non_production",
        result: "PASS",
        candidate_sha: SHA,
        rollback_deployment_id: "dpl_5Y3YmFgQ1Heg5nrH73g8uBvraELm",
        production_mutation: false,
      },
    }),
  ];
  if (includeReview) {
    evidence.push(
      receipt({
        id: "review",
        evidenceClass: "independent_review",
        origin: "INDEPENDENT_REVIEWER",
        issuer: "worker6-independent",
        payload: {
          subject_sha: SHA,
          reviewer_identity: "worker6-independent",
          verdict: "PASS",
        },
      }),
    );
  }
  if (includeAuthorization) {
    evidence.push(
      receipt({
        id: "owner-auth",
        evidenceClass: "owner_authorization",
        origin: "OWNER_AUTHORIZATION",
        issuer: "owner-control-tower",
        payload: {
          subject_sha: SHA,
          target: "production",
          one_time: true,
          revoked: false,
        },
      }),
    );
  }
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
    derived: {},
  };
}

function evaluate(packet, expectedSha = SHA) {
  return evaluateExternalPacket(packet, { expectedSha, now: NOW });
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

test("valid external packet is release-ready but not owner-authorized", () => {
  const result = evaluate(validPacket());
  assert.deepEqual(result.errors, []);
  assert.equal(result.decision, "RELEASE_READY_BUT_NOT_AUTHORIZED");
});

test("owner authorization is accepted only as a separate external record", () => {
  const result = evaluate(validPacket({ includeAuthorization: true }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.decision, "AUTHORIZED_FOR_PRODUCTION");
});

test("self-authored authorization marked independent fails", () => {
  const packet = validPacket();
  const review = packet.evidence.find((item) => item.evidence_class === "independent_review");
  review.origin = "SOURCE_CONTROLLED";
  const result = evaluate(packet);
  assert.ok(result.errors.some((error) => error.includes("SOURCE_CONTROLLED evidence cannot satisfy")));
  assert.equal(result.decision, "NOT_READY");
});

test("source-controlled deployment identity cannot satisfy provider provenance", () => {
  const packet = validPacket();
  packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment").origin = "SOURCE_CONTROLLED";
  const result = evaluate(packet);
  assert.ok(result.errors.some((error) => error.includes("origin SOURCE_CONTROLLED")));
});

test("wrong Git SHA bound to candidate deployment fails", () => {
  const packet = validPacket();
  packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment").payload.git_sha = "f".repeat(40);
  assert.ok(evaluate(packet).errors.some((error) => error.includes("Git SHA mismatch")));
});

test("stale provider observation fails", () => {
  const packet = validPacket();
  packet.evidence[0].expires_at = "2026-08-19T09:59:59.000Z";
  assert.ok(evaluate(packet).errors.some((error) => error.includes("external evidence is stale")));
});

test("preview mislabeled production fails", () => {
  const packet = validPacket();
  packet.evidence.find((item) => item.evidence_class === "candidate_preview_deployment").payload.target = "production";
  assert.ok(evaluate(packet).errors.some((error) => error.includes("production/staging target is forbidden")));
});

test("production mislabeled preview fails", () => {
  const packet = validPacket();
  packet.evidence.find((item) => item.evidence_class === "production_binding:mcpmaster").payload.target = "preview";
  assert.ok(evaluate(packet).errors.some((error) => error.includes("target must be production")));
});

test("READY deployment with failed application probe fails", () => {
  const packet = validPacket();
  const probe = packet.evidence.find((item) => item.evidence_class === "route_probe" && item.payload.surface === "candidate" && item.payload.route === "/health");
  probe.payload.status = 500;
  assert.ok(evaluate(packet).errors.some((error) => error.includes("handler semantics were not proven")));
});

test("rollback target no longer retrievable fails", () => {
  const packet = validPacket();
  packet.evidence.find((item) => item.evidence_class === "rollback_target").payload.retrievable = false;
  assert.ok(evaluate(packet).errors.some((error) => error.includes("retrievability")));
});

test("rollback target bound to wrong Git SHA fails", () => {
  const packet = validPacket();
  packet.evidence.find((item) => item.evidence_class === "rollback_target").payload.git_sha = "f".repeat(40);
  assert.ok(evaluate(packet).errors.some((error) => error.includes("provider-observed PR base SHA")));
});

test("missing rollback target fails", () => {
  const packet = validPacket();
  packet.evidence = packet.evidence.filter((item) => item.evidence_class !== "rollback_target");
  assert.ok(evaluate(packet).errors.some((error) => error.includes("rollback target: required evidence is absent")));
});

test("rewrite fallback does not prove route semantics", () => {
  const packet = validPacket();
  const probe = packet.evidence.find((item) => item.evidence_class === "route_probe" && item.payload.surface === "candidate" && item.payload.route === "/health");
  probe.payload.rewrite_ambiguous = true;
  probe.payload.content_type = "text/html";
  assert.ok(evaluate(packet).errors.some((error) => error.includes("rewrite ambiguity")));
});

test("GET 405 cannot be mistaken for functional POST success", () => {
  const packet = validPacket();
  const probe = packet.evidence.find((item) => item.evidence_class === "route_probe" && item.payload.surface === "candidate" && item.payload.method === "GET" && item.payload.route === "/mcp");
  probe.payload.status = 405;
  assert.ok(evaluate(packet).errors.some((error) => error.includes("GET 405")));
});

test("unauthenticated 401 cannot prove authenticated acceptance", () => {
  const packet = validPacket();
  const probe = packet.evidence.find((item) => item.evidence_class === "route_probe" && item.payload.surface === "candidate" && item.payload.route === "/mcp");
  probe.payload.authenticated_acceptance = true;
  assert.ok(evaluate(packet).errors.some((error) => error.includes("cannot prove authenticated acceptance")));
});

test("Vercel-only rollback fails when database state changed", () => {
  const packet = validPacket();
  packet.evidence.find((item) => item.evidence_class === "stateful_change_matrix").payload.classifications.database = "DOCUMENTED_ONLY";
  assert.ok(evaluate(packet).errors.some((error) => error.includes("database: rollback-critical state is not safely classified")));
});

test("release approval without independent exact-head review fails", () => {
  const result = evaluate(validPacket({ includeReview: false, includeAuthorization: true }));
  assert.ok(result.errors.some((error) => error.includes("independent review")) || result.gates.independent_review === false);
  assert.equal(result.decision, "NOT_READY");
});

test("production remains not authorized when owner authorization is absent", () => {
  const packet = validPacket();
  packet.derived.release_decision = "AUTHORIZED_FOR_PRODUCTION";
  const result = evaluate(packet);
  assert.equal(result.decision, "RELEASE_READY_BUT_NOT_AUTHORIZED");
});

test("candidate SHA movement invalidates the packet", () => {
  const result = evaluate(validPacket(), "f".repeat(40));
  assert.ok(result.errors.some((error) => error.includes("candidate moved")));
  assert.equal(result.decision, "NOT_READY");
});

test("workflow is exact-head, immutable-action, read-only and non-promoting", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.deepEqual(validateWorkflowText(workflow), []);
});

test("workflow path filters, mutable actions, and promotion commands fail closed", () => {
  const workflow = readFileSync(workflowPath, "utf8")
    .replace("  pull_request:\n", "  pull_request:\n    paths:\n      - docs/**\n")
    .replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@v4")
    .concat("\n# vercel promote --prod\n");
  const errors = validateWorkflowText(workflow);
  assert.ok(errors.some((error) => error.includes("path filtering")));
  assert.ok(errors.some((error) => error.includes("full immutable commit SHA")));
  assert.ok(errors.some((error) => error.includes("provider/production mutation")));
});
