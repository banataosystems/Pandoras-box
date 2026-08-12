import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.2";
import {
  allowedCorsOrigin,
  automaticIntakeWindow,
  connectionActionAllowed,
  isReleaseEvidenceType,
  normalizeOwnerRoute,
  normalizeIntakeFingerprintPart,
  ownerRiskLabel,
  parseAllowedOrigins,
  type OwnerConnectionAction,
} from "./contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = parseAllowedOrigins(
  Deno.env.get("PANDORA_ALLOWED_ORIGINS"),
);

const CORS_BASE_HEADERS = {
  "access-control-allow-headers":
    "authorization, apikey, content-type, idempotency-key, x-client-info, x-organization-id",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-max-age": "86400",
  "vary": "Origin",
};

const ACTION_CATALOG = {
  "view-code": {
    title: "View code",
    description: "View the code and saved versions without changing anything.",
    provider: "GitHub",
    risk: "READ",
    request:
      "Show the current code and saved versions for this project. Do not make changes.",
  },
  "see-issues": {
    title: "See issues",
    description: "See open and closed issues for this project.",
    provider: "GitHub",
    risk: "READ",
    request:
      "Show the current open and recently closed issues for this project. Do not make changes.",
  },
  "propose-code-change": {
    title: "Propose a code change",
    description: "Prepare a proposed code change for review.",
    provider: "GitHub",
    risk: "WRITE",
    request:
      "Prepare a proposed code change for review. Do not merge or deploy it.",
  },
  "apply-approved-code-change": {
    title: "Apply approved code change",
    description: "Apply a code change that has already been approved.",
    provider: "GitHub",
    risk: "WRITE",
    request:
      "Prepare to apply an already-approved code change. Verify the approval before any execution.",
  },
  "check-database": {
    title: "Check database",
    description: "Check the database setup and current status.",
    provider: "Supabase",
    risk: "READ",
    request:
      "Check the database setup and current status without making changes.",
  },
  "pause-service": {
    title: "Pause service",
    description: "Temporarily stop this service from receiving new requests.",
    provider: "Supabase",
    risk: "WRITE",
    request:
      "Create a governed plan to pause this service. Do not execute until approval and rollback are verified.",
  },
  "dangerous-changes": {
    title: "Dangerous changes",
    description:
      "Changes that can permanently remove data. Extra approval is required.",
    provider: "System",
    risk: "CRITICAL",
    request:
      "Create a governed plan for the requested destructive change. Require extra identity verification, independent approval, and a tested rollback. Do not execute now.",
  },
} as const;

type JsonRecord = Record<string, unknown>;
type UserContext = {
  userId: string;
  organizationId: string;
  role: string;
  aal: string;
  isAnonymous: boolean;
  client: ReturnType<typeof createClient>;
};

function response(
  body: unknown,
  status = 200,
  requestId?: string,
  corsOrigin?: string | null,
) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...CORS_BASE_HEADERS,
      ...(corsOrigin ? { "access-control-allow-origin": corsOrigin } : {}),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });
}

function failure(
  status: number,
  code: string,
  plainMessage: string,
  requestId: string,
  corsOrigin?: string | null,
) {
  return response(
    { code, plainMessage, requestId },
    status,
    requestId,
    corsOrigin,
  );
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function intValue(value: string | null, fallback: number, max: number) {
  if (value === null || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(max, Math.trunc(parsed)))
    : fallback;
}

function bearerPayload(authorization: string) {
  try {
    const token = authorization.replace(/^Bearer\s+/i, "");
    const segment = token.split(".")[1];
    if (!segment) return {};
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return asRecord(JSON.parse(atob(padded)));
  } catch {
    return {};
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function bodyJson(req: Request) {
  const length = Number(req.headers.get("content-length") || "0");
  if (length > 16 * 1024) throw new Error("BODY_TOO_LARGE");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON");
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > 16 * 1024) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes) || "null");
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("INVALID_JSON");
  }
  return body as JsonRecord;
}

async function authenticate(req: Request): Promise<UserContext> {
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    throw new Error("SIGN_IN_REQUIRED");
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error("SIGN_IN_REQUIRED");

  const requestedOrganization = req.headers.get("x-organization-id")?.trim() ||
    null;
  let membershipQuery = client
    .from("memberships")
    .select("organization_id, role, status")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(3);
  if (requestedOrganization) {
    membershipQuery = membershipQuery.eq(
      "organization_id",
      requestedOrganization,
    );
  }
  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError || !memberships?.length) {
    throw new Error("ORGANIZATION_ACCESS_REQUIRED");
  }
  if (!requestedOrganization && memberships.length > 1) {
    throw new Error("ORGANIZATION_SELECTION_REQUIRED");
  }

  const claims = bearerPayload(authorization);
  const role = String(memberships[0].role);
  if (!new Set(["owner", "admin"]).has(role)) {
    throw new Error("OWNER_ROLE_REQUIRED");
  }
  return {
    userId: authData.user.id,
    organizationId: String(memberships[0].organization_id),
    role,
    aal: textValue(claims.aal, "aal1"),
    isAnonymous: claims.is_anonymous === true ||
      authData.user.is_anonymous === true,
    client,
  };
}

async function enforceRateLimit(context: UserContext, method: string) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const limit = method === "GET" ? 120 : 20;
  const key = await sha256Hex(`${context.userId}:${method}:pandora-owner-api`);
  const { data, error } = await admin.rpc("consume_runtime_rate_limit", {
    p_organization_id: context.organizationId,
    p_key_hash: key,
    p_limit: limit,
    p_window_seconds: 60,
  });
  if (error) throw new Error("RATE_LIMIT_UNAVAILABLE");
  if (asRecord(data).allowed !== true) throw new Error("RATE_LIMITED");
}

function projectSummary(value: unknown) {
  const project = asRecord(value);
  const projection = asRecord(project.projection);
  const projectionProject = asRecord(projection.project);
  const projectionProgress = asRecord(projection.progress);
  const nextTask = asRecord(projection.nextTask);
  const currentPhase = asRecord(projection.currentPhase);
  const tasks = Array.isArray(projection.tasks)
    ? projection.tasks.map(asRecord)
    : [];
  const blockedTask = tasks.find((task) =>
    textValue(task.status).toLowerCase() === "blocked"
  );
  const progress = Number(
    project.progressPercent ?? project.progress_percent ??
      projectionProgress.percent,
  );
  const staleAfter = textValue(project.projection_stale_after);
  const computedAt = textValue(project.projection_computed_at);
  const dataFreshness = staleAfter && Date.parse(staleAfter) > Date.now()
    ? "fresh"
    : "not_checked";
  return {
    id: textValue(project.key ?? project.project_key ?? project.id),
    name: textValue(project.name, "Unnamed project"),
    plainPurpose: textValue(project.objective ?? projectionProject.objective),
    phase: textValue(
      project.currentPhaseKey ?? project.current_phase_key ??
        currentPhase.name ?? currentPhase.key,
    ),
    progressPercent: Number.isFinite(progress) ? progress : null,
    progressVerified: Number.isFinite(progress) && dataFreshness === "fresh",
    plainStatus: textValue(project.status, "Not verified yet"),
    whatIsStoppingUs: textValue(blockedTask?.title) || null,
    whatIWillDoNext: textValue(nextTask.title) || null,
    repository: textValue(project.repository) || null,
    dataFreshness,
    lastVerifiedAt: computedAt || (project.lastReconciledAt ??
      project.last_reconciled_at ?? projection.observedThrough ?? null),
  };
}

function plainEvidenceSummary(value: unknown) {
  const evidence = asRecord(value);
  return {
    id: textValue(evidence.id),
    task_id: textValue(evidence.task_id) || null,
    evidence_type: textValue(evidence.evidence_type),
    provider: textValue(evidence.provider),
    status: textValue(evidence.status),
    verdict: textValue(evidence.verdict) || null,
    source_url: textValue(evidence.source_url) || null,
    head_sha: textValue(evidence.head_sha) || null,
    observed_at: evidence.observed_at ?? null,
  };
}

function releaseSummary(value: unknown) {
  const evidence = asRecord(value);
  const payload = asRecord(evidence.payload_redacted);
  const status = textValue(evidence.status);
  const verdict = textValue(evidence.verdict);
  const verified = /(^|[._ -])(pass(?:ed)?|success|verified)([._ -]|$)/i.test(
    `${status} ${verdict}`,
  );
  const rollbackReference = payload.rollbackTarget ?? payload.rollback_target ??
    payload.previousDeployment ?? payload.previous_deployment ?? payload.rollback;
  return {
    id: textValue(evidence.id),
    title: textValue(
      payload.plainTitle ?? payload.title ?? payload.name,
      "Live version evidence",
    ),
    plainStatus: verified
      ? "Verified"
      : textValue(verdict, textValue(status, "Not checked yet"))
        .replace(/[._-]+/g, " "),
    verified,
    environment: textValue(payload.environment) || null,
    releaseId: textValue(evidence.external_id) || null,
    sourceUrl: textValue(evidence.source_url) || null,
    headSha: textValue(evidence.head_sha) || null,
    rollbackAvailable: rollbackReference !== null &&
      rollbackReference !== undefined && rollbackReference !== "",
    observedAt: evidence.observed_at ?? null,
  };
}

async function loadProjectSummaries(context: UserContext) {
  const { data: rows, error: projectsError } = await context.client
    .from("projectos_projects")
    .select(
      "id, project_key, name, repository, status, objective, current_phase_key, progress_percent, last_reconciled_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (projectsError) throw new Error("BACKEND_READ_FAILED");
  const projectRows = (rows || []) as JsonRecord[];
  const projectIds = projectRows.map((row) => textValue(row.id)).filter(
    Boolean,
  );
  if (!projectIds.length) return [];

  const { data: projectionRows, error: projectionsError } = await context.client
    .from("projectos_projections")
    .select("project_id, projection, computed_at, stale_after")
    .eq("organization_id", context.organizationId)
    .in("project_id", projectIds);
  if (projectionsError) throw new Error("BACKEND_READ_FAILED");
  const projections = new Map(
    ((projectionRows || []) as JsonRecord[]).map((row) => [
      textValue(row.project_id),
      row,
    ]),
  );
  return projectRows.map((row) => {
    const observed = projections.get(textValue(row.id)) || {};
    return projectSummary({
      ...row,
      projection: observed.projection,
      projection_computed_at: observed.computed_at,
      projection_stale_after: observed.stale_after,
    });
  });
}

function connectionSummary(value: unknown, healthRows: JsonRecord[] = []) {
  const connection = asRecord(value);
  const provider = textValue(connection.provider, "Service");
  const status = textValue(connection.status, "not_checked").toLowerCase();
  const now = Date.now();
  const lastCheckedAt = textValue(connection.last_health_check_at);
  const connectorFresh = Boolean(
    lastCheckedAt && Number.isFinite(Date.parse(lastCheckedAt)) &&
      now - Date.parse(lastCheckedAt) <= 15 * 60 * 1000,
  );
  const matchingHealth = healthRows.filter((row) =>
    textValue(row.provider).toLowerCase() === provider.toLowerCase()
  );
  const healthFresh = matchingHealth.every((row) => {
    const staleAfter = textValue(row.stale_after);
    return Boolean(staleAfter && Date.parse(staleAfter) > now);
  });
  const healthProblem = matchingHealth.some((row) =>
    ["error", "failed", "degraded"].includes(
      textValue(row.status).toLowerCase(),
    )
  );
  const problem = ["error", "failed", "degraded"].includes(status) ||
    healthProblem;
  const ready = ["active", "connected", "healthy", "ready"].includes(
    status,
  ) && connectorFresh && healthFresh && !problem;
  const off = ["disabled", "disconnected", "revoked", "off"].includes(status);
  const state = ready
    ? "ready"
    : problem
    ? "problem"
    : off
    ? "off"
    : status === "pending"
    ? "needs_permission"
    : "not_checked";
  const purposes: Record<string, string> = {
    github: "Code, issues, and proposed changes",
    supabase: "Database, sign-in, and safe server functions",
    vercel: "Live web versions and service health",
    google_drive: "Shared files and documents",
    gmail: "Owner-authorized email workflows",
    posthog: "Product usage and reliability signals",
    resend: "System email delivery",
  };
  const scopes = Array.isArray(connection.scopes)
    ? connection.scopes.map(String)
    : [];
  return {
    id: textValue(connection.id),
    name: textValue(connection.display_name, provider),
    plainPurpose: purposes[provider.toLowerCase()] || "Connected service",
    state,
    plainStatus: ready
      ? "Ready"
      : problem
      ? "Needs attention"
      : off
      ? "Off"
      : status === "pending"
      ? "Needs permission"
      : "Not checked yet",
    canRead: ready,
    canChange: ready &&
      scopes.some((scope) => /write|admin|manage/i.test(scope)),
    canConnect: connectionActionAllowed("connect", state),
    canReconnect: connectionActionAllowed("reconnect", state),
    canTest: connectionActionAllowed("test", state),
    canDisconnect: connectionActionAllowed("disconnect", state),
    needsOwnerApprovalForChanges: true,
    lastCheckedAt: connection.last_health_check_at ?? null,
    advanced: { provider, scopes, observedStatus: status },
  };
}

function approvalSummary(value: unknown, riskCode = "") {
  const approval = asRecord(value);
  const preview = asRecord(approval.preview_redacted);
  const undo = textValue(preview.howWeCanUndoIt ?? preview.rollback);
  return {
    id: textValue(approval.id),
    projectId: textValue(preview.projectId ?? preview.project_id) || null,
    whatWillHappen: textValue(
      preview.whatWillHappen ?? preview.summary ?? preview.title,
      "A protected change is waiting for review.",
    ),
    whyINeedYou: textValue(
      approval.request_reason,
      "Pandora needs your decision before it can continue.",
    ),
    whatWillChange: textValue(
      preview.whatWillChange ?? preview.changes ?? preview.details,
      "No additional change details were recorded.",
    ),
    whatCouldGoWrong: textValue(
      preview.whatCouldGoWrong ?? preview.risk,
      "No specific risk explanation was recorded.",
    ),
    howWeCanUndoIt: undo || "No recovery path was recorded.",
    riskLevel: ownerRiskLabel(riskCode),
    reversible: Boolean(undo),
    extraIdentityCheckRequired: false,
    decision: textValue(approval.decision, "pending"),
    expiresAt: approval.expires_at ?? null,
    createdAt: approval.created_at ?? null,
    advanced: {
      riskCode: riskCode || null,
      actionHash: approval.action_hash ?? null,
      runId: approval.run_id ?? null,
      stepId: approval.step_id ?? null,
    },
  };
}

async function home(context: UserContext) {
  const [
    projectItems,
    approvalItems,
    activityItems,
    connectionItems,
    safetyItem,
  ] = await Promise.all([
    loadProjectSummaries(context),
    approvals(context, 10),
    activity(context, 5),
    connections(context),
    safety(context),
  ]);
  const blocked = projectItems.filter((item) =>
    item.plainStatus.toLowerCase() === "blocked"
  ).length;
  const connectionProblems =
    connectionItems.filter((item) =>
      item.state === "problem" || item.state === "needs_permission"
    ).length;
  const needsAttention = blocked + connectionProblems;
  const notChecked =
    projectItems.some((item) => item.dataFreshness !== "fresh") ||
    connectionItems.some((item) => item.state === "not_checked") ||
    safetyItem.state === "not_checked";
  const problem = safetyItem.state === "problem";
  const state = problem || approvalItems.length || needsAttention
    ? "needs_attention"
    : notChecked
    ? "not_checked"
    : "all_systems_protected";
  const latestVerifiedAt = projectItems
    .map((item) => item.lastVerifiedAt)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1) || null;

  return {
    systemHealth: {
      state,
      label: state === "all_systems_protected"
        ? "All systems protected"
        : state === "not_checked"
        ? "Not checked yet"
        : "Needs attention",
      lastCheckedAt: latestVerifiedAt,
    },
    priority: approvalItems[0] || {
      whatWillHappen: needsAttention
        ? "Review what needs attention"
        : "Nothing needs you right now",
      whyINeedYou: needsAttention
        ? "Pandora found an item that should be checked."
        : "Pandora will keep watching your projects.",
      extraIdentityCheckRequired: false,
    },
    counters: {
      approvals: approvalItems.length,
      activeProjects:
        projectItems.filter((item) => item.plainStatus === "active").length,
      needsAttention,
    },
    topProjects: projectItems.slice(0, 3),
    recentActivity: activityItems,
  };
}

async function projects(context: UserContext) {
  return loadProjectSummaries(context);
}

async function project(context: UserContext, identifier: string) {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(identifier);
  let query = context.client.from("projectos_projects").select("*").eq(
    "organization_id",
    context.organizationId,
  );
  query = uuid
    ? query.eq("id", identifier)
    : query.eq("project_key", identifier);
  const { data: projectRow, error } = await query.maybeSingle();
  if (error) throw new Error("BACKEND_READ_FAILED");
  if (!projectRow) throw new Error("PROJECT_NOT_FOUND");
  const [phases, tasks, evidence, projection] = await Promise.all([
    context.client.from("projectos_phases").select(
      "id, phase_key, name, sequence, status, exit_criteria, started_at, completed_at",
    )
      .eq("organization_id", context.organizationId).eq(
        "project_id",
        projectRow.id,
      ).order("sequence"),
    context.client.from("projectos_tasks").select(
      "id, task_key, title, description, sequence, priority, status, risk_class, completion_criteria, current_head_sha, result_summary, updated_at",
    )
      .eq("organization_id", context.organizationId).eq(
        "project_id",
        projectRow.id,
      ).order("sequence"),
    context.client.from("projectos_evidence").select(
      "id, task_id, evidence_type, provider, external_id, status, verdict, source_url, head_sha, payload_redacted, observed_at",
    )
      .eq("organization_id", context.organizationId).eq(
        "project_id",
        projectRow.id,
      ).is("invalidated_at", null).order("observed_at", { ascending: false })
      .limit(50),
    context.client.from("projectos_projections")
      .select("projection, computed_at, stale_after")
      .eq("organization_id", context.organizationId)
      .eq("project_id", projectRow.id)
      .maybeSingle(),
  ]);
  if (phases.error || tasks.error || evidence.error || projection.error) {
    throw new Error("BACKEND_READ_FAILED");
  }
  const evidenceRows = (evidence.data || []) as JsonRecord[];
  return {
    ...projectSummary({
      ...projectRow,
      projection: projection.data?.projection,
      projection_computed_at: projection.data?.computed_at,
      projection_stale_after: projection.data?.stale_after,
    }),
    objective: projectRow.objective,
    roadmapVersion: projectRow.roadmap_version,
    phases: phases.data || [],
    tasks: tasks.data || [],
    evidence: evidenceRows.map(plainEvidenceSummary),
    recentReleases: evidenceRows
      .filter((item) => isReleaseEvidenceType(textValue(item.evidence_type)))
      .map(releaseSummary)
      .slice(0, 10),
    currentState: projection.data?.projection || null,
  };
}

async function connections(
  context: UserContext,
): Promise<ReturnType<typeof connectionSummary>[]> {
  const [connectionsResult, healthResult] = await Promise.all([
    context.client.from("connector_installations")
      .select(
        "id, provider, display_name, status, scopes, last_health_check_at, updated_at",
      )
      .eq("organization_id", context.organizationId).order("provider"),
    context.client.from("projectos_integration_health")
      .select("provider, status, last_success_at, stale_after, updated_at")
      .eq("organization_id", context.organizationId),
  ]);
  if (connectionsResult.error || healthResult.error) {
    throw new Error("BACKEND_READ_FAILED");
  }
  const healthRows = (healthResult.data || []) as JsonRecord[];
  return (connectionsResult.data || []).map((item: JsonRecord) =>
    connectionSummary(item, healthRows)
  );
}

async function connectionAction(
  context: UserContext,
  connectionId: string,
  requestedAction: string,
  idempotencyKey?: string | null,
) {
  type GovernedConnectionAction = Exclude<OwnerConnectionAction, "view">;
  const allowedActions = new Set<GovernedConnectionAction>([
    "connect",
    "reconnect",
    "test",
    "disconnect",
  ]);
  if (!allowedActions.has(requestedAction as GovernedConnectionAction)) {
    throw new Error("CONNECTION_ACTION_NOT_FOUND");
  }
  const action = requestedAction as GovernedConnectionAction;
  const item = (await connections(context)).find((connection) =>
    connection.id === connectionId
  );
  if (!item) throw new Error("CONNECTION_NOT_FOUND");
  if (!connectionActionAllowed(action, item.state)) {
    throw new Error("CONNECTION_ACTION_NOT_AVAILABLE");
  }
  if (action !== "test" && context.aal !== "aal2") {
    throw new Error("AAL2_REQUIRED");
  }

  const provider = textValue(asRecord(item.advanced).provider, item.name);
  const requests: Record<GovernedConnectionAction, string> = {
    connect:
      `Prepare to finish connecting ${provider}. Verify the owner-approved account, requested permissions, and rollback before changing access.`,
    reconnect:
      `Prepare to reconnect ${provider}. Diagnose the expired or unhealthy authorization first, request only the required permissions, and preserve rollback.`,
    test:
      `Check the ${provider} connection without changing its permissions or configuration. Record fresh health evidence and explain any owner action in plain language.`,
    disconnect:
      `Prepare to disconnect ${provider}. Show what will stop working, verify recovery and rollback, and do not remove access until the protected approval is valid.`,
  };
  return acceptIntake(
    context,
    { message: requests[action] },
    undefined,
    idempotencyKey,
    `connection:${connectionId}:${action}`,
  );
}

async function approvals(context: UserContext, limit: number) {
  const now = new Date().toISOString();
  const { data, error } = await context.client.from("approvals")
    .select(
      "id, run_id, step_id, decision, action_hash, preview_redacted, request_reason, decision_reason, expires_at, decided_at, created_at, requested_by, assigned_to",
    )
    .eq("organization_id", context.organizationId)
    .eq("decision", "pending")
    .gt("expires_at", now)
    .or(`assigned_to.is.null,assigned_to.eq.${context.userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("BACKEND_READ_FAILED");
  const rows = (data || []) as JsonRecord[];
  const stepIds = rows.map((row) => textValue(row.step_id)).filter(Boolean);
  let risks = new Map<string, string>();
  if (stepIds.length) {
    const { data: steps, error: stepsError } = await context.client
      .from("workflow_steps")
      .select("id, risk")
      .eq("organization_id", context.organizationId)
      .in("id", stepIds);
    if (stepsError) throw new Error("BACKEND_READ_FAILED");
    risks = new Map(
      ((steps || []) as JsonRecord[]).map((step) => [
        textValue(step.id),
        textValue(step.risk),
      ]),
    );
  }
  return rows.filter((row) => {
    const risk = risks.get(textValue(row.step_id));
    return !(["R3", "R4"].includes(risk || "") &&
      row.requested_by === context.userId);
  }).map((row) => approvalSummary(row, risks.get(textValue(row.step_id))));
}

async function activity(context: UserContext, limit: number) {
  const { data, error } = await context.client.from("audit_events")
    .select(
      "id, event_type, actor_type, payload_redacted, run_id, step_id, created_at",
    )
    .eq("organization_id", context.organizationId).order("created_at", {
      ascending: false,
    }).limit(limit);
  if (error) throw new Error("BACKEND_READ_FAILED");
  return (data || []).map((event: JsonRecord) => ({
    id: String(event.id),
    type: event.event_type,
    actor: event.actor_type,
    summary: textValue(
      asRecord(event.payload_redacted).summary,
      String(event.event_type).replace(/[._-]+/g, " "),
    ),
    happenedAt: event.created_at,
    advanced: {
      runId: event.run_id,
      stepId: event.step_id,
      details: event.payload_redacted,
    },
  }));
}

async function resolveMemoryProject(
  context: UserContext,
  identifier: string,
) {
  if (!identifier) return null;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(identifier);
  let query = context.client.from("projectos_projects")
    .select("id, project_key, name")
    .eq("organization_id", context.organizationId);
  query = uuid ? query.eq("id", identifier) : query.eq("project_key", identifier);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("BACKEND_READ_FAILED");
  if (!data) throw new Error("PROJECT_NOT_FOUND");
  return asRecord(data);
}

async function memory(
  context: UserContext,
  queryText: string,
  requestedProject: string,
  limit: number,
) {
  if (queryText.length > 200) throw new Error("INVALID_QUERY");
  const project = await resolveMemoryProject(context, requestedProject);
  const projectId = textValue(project?.id);

  let decisionsQuery = context.client.from("projectos_decisions")
    .select("id, project_id, statement, rationale, confidence, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  let tasksQuery = context.client.from("projectos_tasks")
    .select("id, project_id, title, description, status, updated_at")
    .eq("organization_id", context.organizationId)
    .order("updated_at", { ascending: false })
    .limit(50);
  let lessonsQuery = context.client.from("projectos_lessons")
    .select("id, project_id, category, lesson, status, confidence, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(50);
  let evidenceQuery = context.client.from("projectos_evidence")
    .select(
      "id, project_id, evidence_type, provider, status, verdict, observed_at",
    )
    .eq("organization_id", context.organizationId)
    .is("invalidated_at", null)
    .order("observed_at", { ascending: false })
    .limit(50);
  if (projectId) {
    decisionsQuery = decisionsQuery.eq("project_id", projectId);
    tasksQuery = tasksQuery.eq("project_id", projectId);
    lessonsQuery = lessonsQuery.eq("project_id", projectId);
    evidenceQuery = evidenceQuery.eq("project_id", projectId);
  }
  const [decisions, tasks, lessons, evidence] = await Promise.all([
    decisionsQuery,
    tasksQuery,
    lessonsQuery,
    evidenceQuery,
  ]);
  if (decisions.error || tasks.error || lessons.error || evidence.error) {
    throw new Error("BACKEND_READ_FAILED");
  }

  const items = [
    ...((decisions.data || []) as JsonRecord[]).map((item) => ({
      id: textValue(item.id),
      projectId: textValue(item.project_id) || null,
      kind: "Decision",
      title: textValue(item.statement, "Recorded decision"),
      summary: textValue(item.rationale, "No reason was recorded."),
      plainStatus: Number(item.confidence) >= 0.8
        ? "High-confidence record"
        : "Recorded",
      happenedAt: item.created_at ?? null,
    })),
    ...((tasks.data || []) as JsonRecord[]).map((item) => ({
      id: textValue(item.id),
      projectId: textValue(item.project_id) || null,
      kind: "Work",
      title: textValue(item.title, "Project work"),
      summary: textValue(item.description, "No summary was recorded."),
      plainStatus: textValue(item.status, "Not checked yet").replace(
        /[._-]+/g,
        " ",
      ),
      happenedAt: item.updated_at ?? null,
    })),
    ...((lessons.data || []) as JsonRecord[]).map((item) => ({
      id: textValue(item.id),
      projectId: textValue(item.project_id) || null,
      kind: "Lesson",
      title: textValue(item.category, "What Pandora learned").replace(
        /[._-]+/g,
        " ",
      ),
      summary: textValue(item.lesson, "No summary was recorded."),
      plainStatus: Number(item.confidence) >= 0.8
        ? "High-confidence record"
        : "Recorded",
      happenedAt: item.updated_at ?? null,
    })),
    ...((evidence.data || []) as JsonRecord[]).map((item) => ({
      id: textValue(item.id),
      projectId: textValue(item.project_id) || null,
      kind: "Proof",
      title: textValue(item.evidence_type, "Project proof").replace(
        /[._-]+/g,
        " ",
      ),
      summary: `${textValue(item.provider, "Recorded service")}: ${
        textValue(item.verdict, textValue(item.status, "not checked yet"))
          .replace(/[._-]+/g, " ")
      }`,
      plainStatus: textValue(item.status, "Not checked yet").replace(
        /[._-]+/g,
        " ",
      ),
      happenedAt: item.observed_at ?? null,
    })),
  ];
  const term = normalizeIntakeFingerprintPart(queryText);
  const filtered = term
    ? items.filter((item) =>
      normalizeIntakeFingerprintPart(
        `${item.kind} ${item.title} ${item.summary} ${item.plainStatus}`,
      ).includes(term)
    )
    : items;
  filtered.sort((left, right) =>
    Date.parse(String(right.happenedAt || "")) -
    Date.parse(String(left.happenedAt || ""))
  );
  return {
    query: queryText,
    projectId: projectId || null,
    plainSource: "Governed project record",
    directMemoryStatus: "Not checked yet",
    items: filtered.slice(0, limit),
  };
}

async function safety(context: UserContext) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [policy, health, audit] = await Promise.all([
    context.client.from("projectos_policies").select("*").eq(
      "organization_id",
      context.organizationId,
    ).maybeSingle(),
    context.client.from("projectos_integration_health").select(
      "project_id, provider, status, last_event_at, last_success_at, stale_after, details, updated_at",
    )
      .eq("organization_id", context.organizationId).order("provider"),
    admin.rpc("verify_execution_audit_chain", {
      p_organization_id: context.organizationId,
    }),
  ]);
  if (policy.error || health.error || audit.error) {
    throw new Error("BACKEND_READ_FAILED");
  }
  const now = Date.now();
  const healthRows = (health.data || []) as JsonRecord[];
  const auditIntegrity = asRecord(audit.data);
  const policyRecord = asRecord(policy.data);
  const hasProblem = auditIntegrity.valid !== true ||
    healthRows.some((item) =>
      ["error", "failed", "degraded"].includes(
        textValue(item.status).toLowerCase(),
      )
    );
  const allFresh = healthRows.length > 0 && healthRows.every((item) => {
    const staleAfter = textValue(item.stale_after);
    const lastSuccessAt = textValue(item.last_success_at);
    return Boolean(
      staleAfter && Date.parse(staleAfter) > now && lastSuccessAt &&
        Number.isFinite(Date.parse(lastSuccessAt)),
    );
  });
  const requiredPolicyEnabled = policyRecord.mandatory_control_layer === true &&
    policyRecord.require_owner_release_approval === true;
  const state = hasProblem
    ? "problem"
    : allFresh && requiredPolicyEnabled
    ? "protected"
    : "not_checked";
  return {
    policy: policy.data,
    integrations: healthRows.map((item) => ({
      ...item,
      freshness: textValue(item.stale_after) &&
          Date.parse(textValue(item.stale_after)) > now
        ? "fresh"
        : "not_checked",
    })),
    auditIntegrity,
    mfaRequiredForApproval: false,
    state,
    plainStatus: state === "problem"
      ? "Needs attention"
      : state === "protected"
      ? "Protected"
      : "Not checked yet",
  };
}

async function acceptIntake(
  context: UserContext,
  body: JsonRecord,
  fallbackMessage?: string,
  idempotencyKey?: string | null,
  operationName = "ask",
) {
  if (context.isAnonymous) throw new Error("PERMANENT_ACCOUNT_REQUIRED");
  const message = textValue(body.message, fallbackMessage || "");
  if (!message || message.length > 4000) throw new Error("INVALID_MESSAGE");
  const requestedProject = textValue(body.projectId ?? body.projectKey) || null;
  let projectKey: string | null = null;
  if (requestedProject) {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(requestedProject);
    let query = context.client.from("projectos_projects")
      .select("project_key")
      .eq("organization_id", context.organizationId);
    query = uuid
      ? query.eq("id", requestedProject)
      : query.eq("project_key", requestedProject);
    const { data: projectRow, error: projectError } = await query.maybeSingle();
    if (projectError) throw new Error("BACKEND_READ_FAILED");
    if (!projectRow) throw new Error("PROJECT_NOT_FOUND");
    projectKey = textValue(projectRow.project_key) || null;
  }
  const providedKey = textValue(idempotencyKey);
  if (
    providedKey &&
    (providedKey.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(providedKey))
  ) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  const automaticFingerprint = await sha256Hex(
    [
      normalizeIntakeFingerprintPart(operationName),
      normalizeIntakeFingerprintPart(projectKey || "projectos-inbox"),
      normalizeIntakeFingerprintPart(message),
    ].join("\n"),
  );
  const actionKey = providedKey ||
    `automatic:${automaticIntakeWindow(Date.now())}:${automaticFingerprint}`;
  const idempotency = await sha256Hex(
    `${context.organizationId}:${context.userId}:${actionKey}`,
  );
  const { data, error } = await context.client.rpc("projectos_accept_intake", {
    p_organization_id: context.organizationId,
    p_requester_id: context.userId,
    p_request_text: message,
    p_project_key: projectKey,
    p_project_name: null,
    p_repository: null,
    p_request_type: "work",
    p_source: "flutterflow_owner_app",
    p_idempotency_key: idempotency,
  });
  if (error) throw new Error("INTAKE_FAILED");
  const result = asRecord(data);
  const intake = asRecord(result.intake);
  const acceptedProject = asRecord(result.project);
  return {
    reply:
      "I saved that request and sent it into Pandora's governed planning flow.",
    needsApproval: false,
    actionId: textValue(intake.id) || null,
    approvalId: null,
    status: {
      whatChanged: "Your request was recorded.",
      whereWeAre: "Pandora is preparing a safe plan.",
      whatIsDone: "The request is in the project record.",
      whatIsHappeningNow:
        "Current state and required approvals will be checked next.",
      whatIsStoppingUs: null,
      whatIWillDoNext: "Show you the plan before any protected change runs.",
    },
    advanced: {
      intakeId: intake.id ?? null,
      projectKey: acceptedProject.project_key ?? null,
      idempotencyKey: idempotency,
      duplicateProtection: providedKey
        ? "client_key"
        : "ten_minute_retry_window",
    },
  };
}

async function decide(
  context: UserContext,
  approvalId: string,
  body: JsonRecord,
) {
  if (context.isAnonymous) throw new Error("PERMANENT_ACCOUNT_REQUIRED");
  const decision = textValue(body.decision).toLowerCase();
  const requested = decision === "approve"
    ? "approved"
    : decision === "reject"
    ? "denied"
    : "";
  if (!requested) throw new Error("INVALID_DECISION");
  const reason = textValue(body.reason) || null;
  const { data, error } = await context.client.rpc("decide_approval", {
    approval_id: approvalId,
    requested_decision: requested,
    reason,
  });
  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("not found")) throw new Error("APPROVAL_NOT_FOUND");
    if (message.includes("expired") || message.includes("no longer pending")) {
      throw new Error("APPROVAL_CONFLICT");
    }
    if (
      message.includes("assigned to another") ||
      message.includes("insufficient") ||
      message.includes("different approver")
    ) throw new Error("APPROVAL_FORBIDDEN");
    throw new Error("APPROVAL_DECISION_FAILED");
  }
  return { ok: true, decision: requested, approval: approvalSummary(data) };
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const requestOrigin = req.headers.get("origin");
  const corsOrigin = allowedCorsOrigin(requestOrigin, ALLOWED_ORIGINS);
  const send = (body: unknown, status = 200) =>
    response(body, status, requestId, corsOrigin);
  const reject = (status: number, code: string, plainMessage: string) =>
    failure(status, code, plainMessage, requestId, corsOrigin);

  if (requestOrigin && !corsOrigin) {
    return reject(
      403,
      "ORIGIN_NOT_ALLOWED",
      "That app is not allowed to use this service.",
    );
  }
  if (req.method === "OPTIONS") return send(null, 204);
  if (req.method !== "GET" && req.method !== "POST") {
    return reject(405, "METHOD_NOT_ALLOWED", "That action is not available.");
  }

  try {
    const context = await authenticate(req);
    const url = new URL(req.url);
    const route = normalizeOwnerRoute(url.pathname);
    await enforceRateLimit(context, req.method);

    if (req.method === "GET" && route === "/home") {
      return send(await home(context));
    }
    if (req.method === "GET" && route === "/projects") {
      return send(await projects(context));
    }
    if (req.method === "GET" && /^\/projects\/[^/]+$/.test(route)) {
      return send(
        await project(context, decodeURIComponent(route.split("/")[2])),
      );
    }
    if (req.method === "GET" && route === "/connections") {
      return send(await connections(context));
    }
    if (req.method === "GET" && route === "/memory") {
      return send(
        await memory(
          context,
          "",
          textValue(url.searchParams.get("projectId")),
          intValue(url.searchParams.get("limit"), 20, 50),
        ),
      );
    }
    if (req.method === "GET" && route === "/approvals") {
      return send(
        await approvals(
          context,
          intValue(url.searchParams.get("limit"), 50, 100),
        ),
      );
    }
    if (req.method === "GET" && route === "/activity") {
      return send(
        await activity(
          context,
          intValue(url.searchParams.get("limit"), 50, 100),
        ),
      );
    }
    if (req.method === "GET" && route === "/safety") {
      return send(await safety(context));
    }
    if (req.method === "GET" && route === "/actions") {
      return send(
        Object.entries(ACTION_CATALOG).map(([id, action]) => ({
          id,
          ...action,
          extraIdentityCheckRequired: action.risk === "CRITICAL" ||
            id === "pause-service" || id === "apply-approved-code-change",
          executionMode: "plan_first",
        })),
      );
    }
    if (req.method === "POST" && route === "/ask") {
      return send(
        await acceptIntake(
          context,
          await bodyJson(req),
          undefined,
          req.headers.get("idempotency-key"),
          "ask",
        ),
        202,
      );
    }
    if (req.method === "POST" && route === "/memory/search") {
      const body = await bodyJson(req);
      return send(
        await memory(
          context,
          textValue(body.query),
          textValue(body.projectId ?? body.projectKey),
          20,
        ),
      );
    }
    if (
      req.method === "POST" &&
      /^\/connections\/[^/]+\/actions\/[^/]+$/.test(route)
    ) {
      const segments = route.split("/");
      return send(
        await connectionAction(
          context,
          decodeURIComponent(segments[2]),
          decodeURIComponent(segments[4]),
          req.headers.get("idempotency-key"),
        ),
        202,
      );
    }
    if (req.method === "POST" && /^\/actions\/[^/]+\/run$/.test(route)) {
      const actionId = decodeURIComponent(route.split("/")[2]);
      const action = ACTION_CATALOG[actionId as keyof typeof ACTION_CATALOG];
      if (!action) throw new Error("ACTION_NOT_FOUND");
      if (
        (action.risk === "CRITICAL" || actionId === "pause-service" ||
          actionId === "apply-approved-code-change") && context.aal !== "aal2"
      ) {
        throw new Error("AAL2_REQUIRED");
      }
      const body = await bodyJson(req);
      const projectId = textValue(body.projectId ?? body.projectKey) || null;
      const ownerOutcome = textValue(body.message);
      return send(
        await acceptIntake(
          context,
          {
            ...body,
            projectId,
            message: `${action.request}${
              projectId ? ` Project: ${projectId}.` : ""
            }${
              ownerOutcome
                ? ` The owner described this outcome: ${ownerOutcome}`
                : ""
            }`,
          },
          undefined,
          req.headers.get("idempotency-key"),
          `action:${actionId}`,
        ),
        202,
      );
    }
    if (req.method === "POST" && /^\/approvals\/[^/]+\/decide$/.test(route)) {
      return send(
        await decide(
          context,
          decodeURIComponent(route.split("/")[2]),
          await bodyJson(req),
        ),
      );
    }
    return reject(
      404,
      "OWNER_ROUTE_NOT_FOUND",
      "That Pandora page is not available yet.",
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "OWNER_API_ERROR";
    if (code === "SIGN_IN_REQUIRED") {
      return reject(401, code, "Please sign in again.");
    }
    if (
      [
        "ORGANIZATION_ACCESS_REQUIRED",
        "PERMANENT_ACCOUNT_REQUIRED",
        "OWNER_ROLE_REQUIRED",
        "APPROVAL_FORBIDDEN",
      ].includes(code)
    ) {
      return reject(403, code, "You do not have permission for this yet.");
    }
    if (code === "ORGANIZATION_SELECTION_REQUIRED") {
      return reject(409, code, "Choose which organization you want to use.");
    }
    if (code === "AAL2_REQUIRED") {
      return reject(
        403,
        code,
        "Please complete the extra identity check before continuing.",
      );
    }
    if (code === "RATE_LIMITED") {
      return reject(429, code, "Please wait a moment before trying again.");
    }
    if (
      [
        "INVALID_JSON",
        "INVALID_MESSAGE",
        "INVALID_DECISION",
        "INVALID_IDEMPOTENCY_KEY",
        "INVALID_QUERY",
        "BODY_TOO_LARGE",
      ]
        .includes(code)
    ) {
      return reject(400, code, "Please check that information and try again.");
    }
    if (
      [
        "PROJECT_NOT_FOUND",
        "ACTION_NOT_FOUND",
        "APPROVAL_NOT_FOUND",
        "CONNECTION_NOT_FOUND",
        "CONNECTION_ACTION_NOT_FOUND",
      ].includes(code)
    ) {
      return reject(404, code, "Pandora could not find that item.");
    }
    if (code === "APPROVAL_CONFLICT") {
      return reject(409, code, "That approval is no longer available.");
    }
    if (code === "CONNECTION_ACTION_NOT_AVAILABLE") {
      return reject(
        409,
        code,
        "That connection action is not available in its current state.",
      );
    }
    console.error(JSON.stringify({ requestId, code }));
    return reject(
      503,
      "PANDORA_UNAVAILABLE",
      "Pandora cannot reach that service right now.",
    );
  }
});
