import {
  normalizeProviderCapture,
  readDefaultPolicy,
  readDefaultReviewerRegistry,
  stableStringify,
  validateCaptureIntegrity,
  validateProvenance,
} from "./github-governance-provider-model.mjs";

function same(actual, expected) { return stableStringify(actual) === stableStringify(expected); }
function requireSame(actual, expected, label, errors) { if (!same(actual, expected)) errors.push(`${label} drifted`); }
function requireEmptyActors(value, label, errors) {
  if (!value || ![value.users, value.teams, value.apps].every(Array.isArray)) {
    errors.push(`${label} actor lists are absent or malformed`); return;
  }
  if (value.users.length || value.teams.length || value.apps.length) errors.push(`${label} contains bypass or dismissal actors`);
}

const CONTROL_ENDPOINTS = [
  "repository",
  "branch",
  "branch_protection",
  "pull_request_review_protection",
  "actions_permissions",
  "workflow_permissions",
  "rulesets",
];
const READINESS_ENDPOINTS = ["collaborators", "candidate_workflow", "trusted_workflow", "check_runs"];

function validateCaptureFreshnessAndIdentity(state, policy, options, errors) {
  const now = options.nowMs ?? Date.now();
  const observed = Date.parse(state.observed_at ?? "");
  if (state.schema_version !== "2.0.0") errors.push("normalized schema_version must be 2.0.0");
  if (state.api_version !== policy.provider_capture.api_version) errors.push("GitHub API version drifted");
  if (!Number.isFinite(observed)) errors.push("observed_at is invalid");
  else if (observed > now + 300000) errors.push("observed_at is in the future");
  else if (now - observed > (options.maxAgeMs ?? policy.provider_capture.max_age_ms)) errors.push("provider capture is stale");
  requireSame(state.repository.id, policy.repository.repository_id, "repository id", errors);
  requireSame(state.repository.full_name, policy.repository.full_name, "repository full_name", errors);
  requireSame(state.repository.owner_type, policy.repository.owner_type, "repository owner type", errors);
  requireSame(state.repository.default_branch, policy.repository.default_branch, "default branch", errors);
  requireSame(state.main.name, policy.repository.default_branch, "protected branch name", errors);
  if (!/^[0-9a-f]{40}$/.test(state.main.sha ?? "")) errors.push("captured main SHA is invalid");
}

export function validateProviderControlState(state, policy = readDefaultPolicy(), options = {}) {
  const errors = [];
  validateCaptureFreshnessAndIdentity(state, policy, options, errors);
  for (const endpoint of CONTROL_ENDPOINTS) {
    if (state.endpoint_statuses?.[endpoint] !== 200) errors.push(`provider endpoint did not return 200: ${endpoint}`);
  }
  requireSame(state.main.protected, true, "main protection", errors);
  const expectedChecks = policy.status_checks.required_checks.map(({ context, app_id }) => ({ context, app_id }));
  requireSame(state.protection.required_status_checks.strict, true, "strict status checks", errors);
  requireSame(state.protection.required_status_checks.checks, expectedChecks, "app-bound required checks", errors);
  requireSame(state.protection.enforce_admins, true, "administrator enforcement", errors);
  const review = state.protection.required_pull_request_reviews;
  for (const [key, expected, label] of [
    ["required_approving_review_count", policy.pull_request.required_approving_review_count, "approval count"],
    ["dismiss_stale_reviews", policy.pull_request.dismiss_stale_reviews, "stale review dismissal"],
    ["require_code_owner_reviews", policy.pull_request.require_code_owner_reviews, "CODEOWNERS review setting"],
    ["require_last_push_approval", policy.pull_request.require_last_push_approval, "latest-push approval"],
  ]) requireSame(review[key], expected, label, errors);
  if (review.bypass_pull_request_allowances.present !== true) errors.push("bypass_pull_request_allowances is absent");
  requireEmptyActors(review.bypass_pull_request_allowances.actors, "bypass_pull_request_allowances", errors);
  const dismissal = review.dismissal_restrictions;
  if (policy.main_branch.personal_repository_capabilities.dismissal_restrictions_supported) {
    if (dismissal.present !== true) errors.push("dismissal_restrictions is absent");
    requireEmptyActors(dismissal.actors, "dismissal_restrictions", errors);
  } else if (dismissal.present) requireEmptyActors(dismissal.actors, "unsupported dismissal_restrictions", errors);
  const restrictions = state.protection.restrictions;
  if (policy.main_branch.personal_repository_capabilities.push_restrictions_supported) {
    requireEmptyActors(restrictions.actors, "push restrictions", errors);
  } else if (!restrictions.present || restrictions.raw_is_null !== true) {
    errors.push("personal-repository push restrictions must be explicitly null");
  }
  for (const [key, expected, label] of [
    ["required_linear_history", policy.main_branch.required_linear_history, "linear history"],
    ["allow_force_pushes", policy.main_branch.allow_force_pushes, "force-push policy"],
    ["allow_deletions", policy.main_branch.allow_deletions, "branch-deletion policy"],
    ["block_creations", policy.main_branch.block_creations, "branch-creation policy"],
    ["required_conversation_resolution", policy.pull_request.require_conversation_resolution, "conversation resolution"],
    ["lock_branch", policy.main_branch.lock_branch, "lock_branch"],
    ["allow_fork_syncing", policy.main_branch.allow_fork_syncing, "allow_fork_syncing"],
  ]) requireSame(state.protection[key], expected, label, errors);
  requireSame(state.repository.settings, policy.repository_settings, "repository merge settings", errors);
  requireSame(state.actions.repository_enabled, policy.actions.repository_enabled, "Actions repository enablement", errors);
  requireSame(state.actions.default_workflow_permissions, policy.actions.default_workflow_permissions, "Actions default workflow permissions", errors);
  requireSame(state.actions.can_approve_pull_request_reviews, policy.actions.can_approve_pull_request_reviews, "Actions review approval permission", errors);
  if (!Array.isArray(state.rulesets)) errors.push("ruleset readback is malformed");
  else if (state.rulesets.some(({ enforcement }) => enforcement === "active")) errors.push("an active ruleset conflicts with classic branch protection authority");
  return errors;
}

export function validateOperationalReadiness(state, policy = readDefaultPolicy(), options = {}) {
  const errors = [];
  for (const endpoint of READINESS_ENDPOINTS) {
    if (state.endpoint_statuses?.[endpoint] !== 200) errors.push(`provider endpoint did not return 200: ${endpoint}`);
  }
  const qualifyingNonOwner = state.collaborator_capacity.qualifying_non_owner_logins;
  if (!Array.isArray(qualifyingNonOwner) || qualifyingNonOwner.length < 1) {
    errors.push("no provider-verified non-owner qualifying reviewer exists");
  }
  const reviewerRegistry = options.reviewerRegistry ?? readDefaultReviewerRegistry();
  const registered = (reviewerRegistry.reviewers ?? [])
    .filter((reviewer) => reviewer.provider_verified === true && reviewer.roles?.includes("governance"))
    .map((reviewer) => reviewer.login)
    .filter(Boolean)
    .sort();
  if (reviewerRegistry.application_gate !== "open") errors.push("reviewer registry application gate is not open");
  if (!reviewerRegistry.provider_verified_at || !Number.isFinite(Date.parse(reviewerRegistry.provider_verified_at))) {
    errors.push("reviewer registry lacks a provider verification timestamp");
  }
  if (registered.length < 1) errors.push("reviewer registry lacks a provider-verified governance reviewer");
  for (const login of registered) {
    if (!qualifyingNonOwner?.includes(login)) errors.push(`registered reviewer lacks provider-verified qualifying access: ${login}`);
  }
  requireSame(state.workflows.candidate.path, policy.authority.candidate_workflow, "candidate workflow path", errors);
  requireSame(state.workflows.candidate.state, "active", "candidate workflow state", errors);
  requireSame(state.workflows.trusted.path, policy.authority.trusted_workflow, "trusted workflow path", errors);
  requireSame(state.workflows.trusted.state, "active", "trusted workflow state", errors);
  const trusted = state.check_runs.trusted;
  if (!trusted) errors.push("trusted exact-head check run is absent");
  else {
    const expected = policy.status_checks.required_checks[0];
    for (const [actual, wanted, label] of [
      [trusted.head_sha, state.requested_head_sha, "trusted check head SHA"],
      [trusted.status, "completed", "trusted check status"],
      [trusted.conclusion, "success", "trusted check conclusion"],
      [trusted.app_id, expected.app_id, "trusted check app id"],
      [trusted.app_slug, expected.app_slug, "trusted check app slug"],
    ]) requireSame(actual, wanted, label, errors);
    if (!String(trusted.external_id ?? "").startsWith("protected-main:")) errors.push("trusted check external_id lacks the protected-main provenance prefix");
  }
  if (!options.ignoreBootstrap && policy.bootstrap.provider_application_allowed !== true) {
    errors.push("source policy blocks provider application during bootstrap");
  }
  return errors;
}

export function validateNormalizedProviderState(state, policy = readDefaultPolicy(), options = {}) {
  const phase = options.phase ?? policy.provider_capture.validation_phase ?? "steady_state";
  if (!["provider_controls", "operational_readiness", "steady_state"].includes(phase)) {
    return [`unknown governance validation phase: ${phase}`];
  }
  const errors = [];
  if (phase !== "operational_readiness") errors.push(...validateProviderControlState(state, policy, options));
  if (phase !== "provider_controls") errors.push(...validateOperationalReadiness(state, policy, options));
  return errors;
}

export function validateProviderCapture(envelope, policy = readDefaultPolicy(), options = {}) {
  const errors = [...validateCaptureIntegrity(envelope), ...validateProvenance(envelope, policy)];
  if (errors.length) return { errors, normalized: null };
  const normalized = normalizeProviderCapture(envelope, policy);
  errors.push(...validateNormalizedProviderState(normalized, policy, options));
  return { errors, normalized };
}
