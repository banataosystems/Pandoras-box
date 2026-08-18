import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = path.join(ROOT, ".github/governance/main-policy.json");
const REVIEWER_REGISTRY_PATH = path.join(ROOT, ".github/governance/reviewer-registry.json");
const API_BASE = "https://api.github.com";
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const has = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
const enabled = (value) => typeof value === "boolean" ? value : value?.enabled ?? null;
export const readDefaultPolicy = () => readJson(POLICY_PATH);
export const readDefaultReviewerRegistry = () => readJson(REVIEWER_REGISTRY_PATH);

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function actorList(values) {
  if (!Array.isArray(values)) return null;
  return values.map((value) => value?.login ?? value?.slug ?? value?.name).filter(Boolean).sort();
}
function actorSet(value) {
  if (!value || typeof value !== "object") return null;
  return { users: actorList(value.users), teams: actorList(value.teams), apps: actorList(value.apps) };
}
function body(envelope, name) { return envelope.payload.endpoints?.[name]?.response?.body ?? null; }
function status(envelope, name) { return envelope.payload.endpoints?.[name]?.response?.status ?? null; }

export function buildCaptureEnvelope(payload) {
  return {
    schema_version: "2.0.0",
    integrity: { algorithm: "sha256", payload_sha256: sha256(stableStringify(payload)) },
    payload,
  };
}

export function validateCaptureIntegrity(envelope) {
  const errors = [];
  if (envelope?.schema_version !== "2.0.0") errors.push("capture schema_version must be 2.0.0");
  if (envelope?.integrity?.algorithm !== "sha256") errors.push("capture integrity algorithm must be sha256");
  if (!envelope?.payload || typeof envelope.payload !== "object") {
    errors.push("capture payload is missing");
    return errors;
  }
  if (sha256(stableStringify(envelope.payload)) !== envelope.integrity?.payload_sha256) {
    errors.push("raw provider capture integrity mismatch");
  }
  return errors;
}

export function endpointUrls(policy, headSha) {
  const [owner, repo] = policy.repository.full_name.split("/");
  const base = `${API_BASE}/repos/${owner}/${repo}`;
  const branch = encodeURIComponent(policy.repository.default_branch);
  return {
    repository: base,
    branch: `${base}/branches/${branch}`,
    branch_protection: `${base}/branches/${branch}/protection`,
    pull_request_review_protection: `${base}/branches/${branch}/protection/required_pull_request_reviews`,
    actions_permissions: `${base}/actions/permissions`,
    workflow_permissions: `${base}/actions/permissions/workflow`,
    rulesets: `${base}/rulesets?includes_parents=true`,
    collaborators: `${base}/collaborators?affiliation=all&per_page=100`,
    candidate_workflow: `${base}/actions/workflows/${encodeURIComponent(path.basename(policy.authority.candidate_workflow))}`,
    trusted_workflow: `${base}/actions/workflows/${encodeURIComponent(path.basename(policy.authority.trusted_workflow))}`,
    check_runs: `${base}/commits/${headSha}/check-runs?per_page=100`,
  };
}

export function validateProvenance(envelope, policy) {
  const errors = [];
  const headSha = envelope?.payload?.head_sha;
  if (!/^[0-9a-f]{40}$/.test(headSha ?? "")) {
    errors.push("capture head_sha must be a full 40-hex commit SHA");
    return errors;
  }
  const expected = endpointUrls(policy, headSha);
  for (const name of policy.provider_capture.required_endpoints) {
    const endpoint = envelope.payload.endpoints?.[name];
    if (!endpoint) { errors.push(`raw endpoint missing: ${name}`); continue; }
    if (endpoint.request?.method !== "GET") errors.push(`raw endpoint method drifted: ${name}`);
    if (endpoint.request?.url !== expected[name]) errors.push(`raw endpoint URL drifted: ${name}`);
    if (!Number.isInteger(endpoint.response?.status)) errors.push(`raw endpoint status missing: ${name}`);
  }
  return errors;
}

export function normalizeProviderCapture(envelope, policy = readDefaultPolicy()) {
  const repository = body(envelope, "repository") ?? {};
  const branch = body(envelope, "branch") ?? {};
  const protection = body(envelope, "branch_protection") ?? {};
  const review = body(envelope, "pull_request_review_protection") ?? protection.required_pull_request_reviews ?? {};
  const actions = body(envelope, "actions_permissions") ?? {};
  const workflowPermissions = body(envelope, "workflow_permissions") ?? {};
  const collaborators = body(envelope, "collaborators");
  const candidateWorkflow = body(envelope, "candidate_workflow") ?? {};
  const trustedWorkflow = body(envelope, "trusted_workflow") ?? {};
  const runs = body(envelope, "check_runs")?.check_runs ?? [];
  const sortedRuns = [...runs].sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
  const qualifying = Array.isArray(collaborators) ? collaborators.filter((item) =>
    item?.permissions?.push === true || item?.permissions?.maintain === true ||
    item?.permissions?.admin === true || ["write", "maintain", "admin"].includes(item?.role_name),
  ) : [];
  const check = (name) => sortedRuns.find((run) => run.name === name) ?? null;
  const checkView = (run) => run ? {
    id: run.id, name: run.name, head_sha: run.head_sha, status: run.status,
    conclusion: run.conclusion, app_id: run.app?.id ?? null, app_slug: run.app?.slug ?? null,
    external_id: run.external_id ?? null, details_url: run.details_url ?? null,
  } : null;
  return {
    schema_version: "2.0.0",
    raw_capture_sha256: envelope.integrity?.payload_sha256 ?? null,
    observed_at: envelope.payload?.observed_at ?? null,
    api_version: envelope.payload?.api_version ?? null,
    requested_head_sha: envelope.payload?.head_sha ?? null,
    endpoint_statuses: Object.fromEntries(policy.provider_capture.required_endpoints.map((name) => [name, status(envelope, name)])),
    repository: {
      id: repository.id ?? null, full_name: repository.full_name ?? null,
      owner_login: repository.owner?.login ?? null, owner_type: repository.owner?.type ?? null,
      default_branch: repository.default_branch ?? null,
      settings: Object.fromEntries(Object.keys(policy.repository_settings).map((key) => [key, repository[key] ?? null])),
    },
    main: { name: branch.name ?? null, sha: branch.commit?.sha ?? null, protected: branch.protected ?? null },
    protection: {
      required_status_checks: {
        strict: protection.required_status_checks?.strict ?? null,
        checks: (protection.required_status_checks?.checks ?? [])
          .map(({ context, app_id }) => ({ context, app_id }))
          .sort((a, b) => a.context.localeCompare(b.context)),
      },
      enforce_admins: enabled(protection.enforce_admins),
      required_pull_request_reviews: {
        required_approving_review_count: review.required_approving_review_count ?? null,
        dismiss_stale_reviews: review.dismiss_stale_reviews ?? null,
        require_code_owner_reviews: review.require_code_owner_reviews ?? null,
        require_last_push_approval: review.require_last_push_approval ?? null,
        bypass_pull_request_allowances: { present: has(review, "bypass_pull_request_allowances"), actors: actorSet(review.bypass_pull_request_allowances) },
        dismissal_restrictions: { present: has(review, "dismissal_restrictions"), actors: actorSet(review.dismissal_restrictions) },
      },
      restrictions: { present: has(protection, "restrictions"), actors: actorSet(protection.restrictions), raw_is_null: protection.restrictions === null },
      required_linear_history: enabled(protection.required_linear_history),
      allow_force_pushes: enabled(protection.allow_force_pushes),
      allow_deletions: enabled(protection.allow_deletions),
      block_creations: enabled(protection.block_creations),
      required_conversation_resolution: enabled(protection.required_conversation_resolution),
      lock_branch: enabled(protection.lock_branch),
      allow_fork_syncing: enabled(protection.allow_fork_syncing),
    },
    actions: {
      repository_enabled: actions.enabled ?? null,
      allowed_actions: actions.allowed_actions ?? null,
      default_workflow_permissions: workflowPermissions.default_workflow_permissions ?? null,
      can_approve_pull_request_reviews: workflowPermissions.can_approve_pull_request_reviews ?? null,
    },
    rulesets: Array.isArray(body(envelope, "rulesets"))
      ? body(envelope, "rulesets").map(({ id, name, enforcement }) => ({ id, name, enforcement })) : null,
    collaborator_capacity: {
      all_logins: Array.isArray(collaborators) ? collaborators.map(({ login }) => login).filter(Boolean).sort() : null,
      qualifying_logins: qualifying.map(({ login }) => login).filter(Boolean).sort(),
      qualifying_non_owner_logins: qualifying.map(({ login }) => login).filter((login) => login && login !== repository.owner?.login).sort(),
    },
    workflows: {
      candidate: { id: candidateWorkflow.id ?? null, name: candidateWorkflow.name ?? null, path: candidateWorkflow.path ?? null, state: candidateWorkflow.state ?? null },
      trusted: { id: trustedWorkflow.id ?? null, name: trustedWorkflow.name ?? null, path: trustedWorkflow.path ?? null, state: trustedWorkflow.state ?? null },
    },
    check_runs: {
      trusted: checkView(check(policy.status_checks.required_checks[0].context)),
      candidate: checkView(check(policy.status_checks.candidate_proof.context)),
    },
  };
}

