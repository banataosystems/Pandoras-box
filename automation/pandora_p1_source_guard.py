#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

API = Path("supabase/functions/pandora-owner-api/index.ts")
SCHEMA = Path("automation/flutterflow/dsl/10_owner_api_state_navigation.dart")
UI = Path("automation/flutterflow/dsl/selector_bindings.dart")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return updated


def between(text: str, start: str, end: str, label: str) -> tuple[str, int, int]:
    left = text.find(start)
    if left < 0:
        raise SystemExit(f"{label}: start marker not found")
    right = text.find(end, left)
    if right < 0:
        raise SystemExit(f"{label}: end marker not found")
    return text[left:right], left, right


def patch_api(text: str) -> str:
    text = replace_once(
        text,
        '''function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
''',
        '''function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function plainOwnerText(value: unknown, fallback = "") {
  let text = textValue(value, fallback);
  const replacements: Array<[RegExp, string]> = [
    [/flutter\\s*flow/gi, "app builder"],
    [/\\bmcp\\b/gi, "connection layer"],
    [/\\byaml\\b/gi, "project configuration"],
    [/\\bci\\b/gi, "automated checks"],
    [/\\bprovider\\b/gi, "service"],
    [/bearer\\s+token/gi, "access credential"],
    [/service\\s+role/gi, "protected server access"],
    [/schema\\s+fingerprint/gi, "data structure check"],
    [/\\baal2\\b/gi, "extra identity check"],
    [/\\btotp\\b/gi, "security code"],
    [/\\bgithub\\b/gi, "source workspace"],
    [/\\bvercel\\b/gi, "live hosting"],
    [/\\bsupabase\\b/gi, "project data service"],
    [/https?:\\/\\/\\S+/gi, "a protected link"],
    [/\\b[0-9a-f]{40,64}\\b/gi, "a recorded version"],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  return text;
}
''',
        "plain owner text helper",
    )
    text = replace_once(
        text,
        "    { code, plainMessage, requestId },",
        "    { plainMessage },",
        "owner diagnostic payload",
    )

    text = sub_once(
        text,
        r"function projectSummary\(value: unknown\) \{.*?\n\}\n\nfunction plainEvidenceSummary",
        '''function projectSummary(value: unknown) {
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
    name: plainOwnerText(project.name, "Unnamed project"),
    plainPurpose: plainOwnerText(
      project.objective ?? projectionProject.objective,
    ),
    phase: plainOwnerText(
      project.currentPhaseKey ?? project.current_phase_key ??
        currentPhase.name ?? currentPhase.key,
    ),
    progressPercent: Number.isFinite(progress) ? progress : null,
    progressVerified: Number.isFinite(progress) && dataFreshness === "fresh",
    plainStatus: plainOwnerText(project.status, "Not verified yet"),
    whatIsStoppingUs: plainOwnerText(blockedTask?.title) || null,
    whatIWillDoNext: plainOwnerText(nextTask.title) || null,
    dataFreshness,
    lastVerifiedAt: computedAt || (project.lastReconciledAt ??
      project.last_reconciled_at ?? projection.observedThrough ?? null),
  };
}

function plainEvidenceSummary''',
        "project summary safe DTO",
    )

    text = sub_once(
        text,
        r"function plainEvidenceSummary\(value: unknown\) \{.*?\n\}\n\nfunction releaseSummary",
        '''function plainEvidenceSummary(value: unknown) {
  const evidence = asRecord(value);
  return {
    id: textValue(evidence.id),
    taskId: textValue(evidence.task_id) || null,
    title: plainOwnerText(evidence.evidence_type, "Project proof").replace(
      /[._-]+/g,
      " ",
    ),
    plainStatus: plainOwnerText(
      evidence.verdict,
      plainOwnerText(evidence.status, "Not checked yet"),
    ).replace(/[._-]+/g, " "),
    observedAt: evidence.observed_at ?? null,
  };
}

function releaseSummary''',
        "evidence safe DTO",
    )

    text = sub_once(
        text,
        r"function releaseSummary\(value: unknown\) \{.*?\n\}\n\nasync function loadProjectSummaries",
        '''function releaseSummary(value: unknown) {
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
    title: plainOwnerText(
      payload.plainTitle ?? payload.title ?? payload.name,
      "Live version",
    ),
    plainStatus: verified
      ? "Verified"
      : plainOwnerText(verdict, plainOwnerText(status, "Not checked yet"))
        .replace(/[._-]+/g, " "),
    verified,
    rollbackAvailable: rollbackReference !== null &&
      rollbackReference !== undefined && rollbackReference !== "",
    observedAt: evidence.observed_at ?? null,
  };
}

async function loadProjectSummaries''',
        "release safe DTO",
    )

    text = sub_once(
        text,
        r"function connectionSummary\(value: unknown, healthRows: JsonRecord\[\] = \[\]\) \{.*?\n\}\n\nfunction approvalSummary",
        '''function connectionSummary(value: unknown, healthRows: JsonRecord[] = []) {
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
  const names: Record<string, string> = {
    github: "Source workspace",
    supabase: "Project data",
    vercel: "Live web",
    google_drive: "Files",
    gmail: "Email",
    posthog: "Product insights",
    resend: "Email delivery",
  };
  const purposes: Record<string, string> = {
    github: "Code, issues, and proposed changes",
    supabase: "Project data, sign-in, and protected functions",
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
    name: names[provider.toLowerCase()] || "Connected service",
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
    canChange: ready && scopes.some((scope) => /write|admin|manage/i.test(scope)),
    canConnect: connectionActionAllowed("connect", state),
    canReconnect: connectionActionAllowed("reconnect", state),
    canTest: connectionActionAllowed("test", state),
    canDisconnect: connectionActionAllowed("disconnect", state),
    needsOwnerApprovalForChanges: true,
    lastCheckedAt: connection.last_health_check_at ?? null,
  };
}

function approvalSummary''',
        "connection safe DTO",
    )

    text = sub_once(
        text,
        r"function approvalSummary\(value: unknown, riskCode = \"\"\) \{.*?\n\}\n\nasync function home",
        '''function approvalSummary(value: unknown, riskCode = "") {
  const approval = asRecord(value);
  const preview = asRecord(approval.preview_redacted);
  const undo = plainOwnerText(preview.howWeCanUndoIt ?? preview.rollback);
  return {
    id: textValue(approval.id),
    projectId: textValue(preview.projectId ?? preview.project_id) || null,
    whatWillHappen: plainOwnerText(
      preview.whatWillHappen ?? preview.summary ?? preview.title,
      "A protected change is waiting for review.",
    ),
    whyINeedYou: plainOwnerText(
      approval.request_reason,
      "Pandora needs your decision before it can continue.",
    ),
    whatWillChange: plainOwnerText(
      preview.whatWillChange ?? preview.changes ?? preview.details,
      "No additional change details were recorded.",
    ),
    whatCouldGoWrong: plainOwnerText(
      preview.whatCouldGoWrong ?? preview.risk,
      "No specific risk explanation was recorded.",
    ),
    howWeCanUndoIt: undo || "No recovery path was recorded.",
    riskLevel: ownerRiskLabel(riskCode),
    reversible: Boolean(undo),
    extraIdentityCheckRequired: true,
    decision: plainOwnerText(approval.decision, "pending"),
    expiresAt: approval.expires_at ?? null,
    createdAt: approval.created_at ?? null,
  };
}

async function home''',
        "approval safe DTO",
    )

    project_block, left, right = between(
        text,
        "async function project(context: UserContext, identifier: string) {",
        "\nasync function connections(",
        "project detail function",
    )
    safe_project = '''async function project(context: UserContext, identifier: string) {
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
      "id, name, sequence, status, started_at, completed_at",
    ).eq("organization_id", context.organizationId).eq(
      "project_id",
      projectRow.id,
    ).order("sequence"),
    context.client.from("projectos_tasks").select(
      "id, title, description, status, updated_at",
    ).eq("organization_id", context.organizationId).eq(
      "project_id",
      projectRow.id,
    ).order("sequence"),
    context.client.from("projectos_evidence").select(
      "id, task_id, evidence_type, status, verdict, payload_redacted, observed_at",
    ).eq("organization_id", context.organizationId).eq(
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
    objective: plainOwnerText(projectRow.objective),
    phases: ((phases.data || []) as JsonRecord[]).map((item) => ({
      id: textValue(item.id),
      name: plainOwnerText(item.name, "Project phase"),
      sequence: Number(item.sequence) || 0,
      plainStatus: plainOwnerText(item.status, "Not checked yet").replace(/[._-]+/g, " "),
      startedAt: item.started_at ?? null,
      completedAt: item.completed_at ?? null,
    })),
    tasks: ((tasks.data || []) as JsonRecord[]).map((item) => ({
      id: textValue(item.id),
      title: plainOwnerText(item.title, "Project work"),
      description: plainOwnerText(item.description, "No summary was recorded."),
      plainStatus: plainOwnerText(item.status, "Not checked yet").replace(/[._-]+/g, " "),
      updatedAt: item.updated_at ?? null,
    })),
    evidence: evidenceRows.map(plainEvidenceSummary),
    recentReleases: evidenceRows
      .filter((item) => isReleaseEvidenceType(textValue(item.evidence_type)))
      .map(releaseSummary)
      .slice(0, 10),
  };
}
'''
    text = text[:left] + safe_project + text[right:]

    text = replace_once(
        text,
        '''  const healthRows = (healthResult.data || []) as JsonRecord[];
  return (connectionsResult.data || []).map((item: JsonRecord) =>
    connectionSummary(item, healthRows)
  );''',
        '''  const healthRows = (healthResult.data || []) as JsonRecord[];
  const visibleConnections = (connectionsResult.data || []).filter(
    (item: JsonRecord) =>
      !/flutter\\s*flow/i.test(
        `${textValue(item.provider)} ${textValue(item.display_name)}`,
      ),
  );
  return visibleConnections.map((item: JsonRecord) =>
    connectionSummary(item, healthRows)
  );''',
        "hidden builder connection filter",
    )
    text = replace_once(
        text,
        "  const provider = textValue(asRecord(item.advanced).provider, item.name);",
        "  const serviceName = item.name;",
        "connection action name",
    )
    text = text.replace("${provider}", "${serviceName}")

    text = sub_once(
        text,
        r"async function activity\(context: UserContext, limit: number\) \{.*?\n\}\n\nasync function resolveMemoryProject",
        '''async function activity(context: UserContext, limit: number) {
  const { data, error } = await context.client.from("audit_events")
    .select("id, event_type, payload_redacted, created_at")
    .eq("organization_id", context.organizationId).order("created_at", {
      ascending: false,
    }).limit(limit);
  if (error) throw new Error("BACKEND_READ_FAILED");
  return (data || []).map((event: JsonRecord) => ({
    id: String(event.id),
    summary: plainOwnerText(
      asRecord(event.payload_redacted).summary,
      String(event.event_type).replace(/[._-]+/g, " "),
    ),
    happenedAt: event.created_at,
  }));
}

async function resolveMemoryProject''',
        "activity safe DTO",
    )

    memory, mleft, mright = between(
        text,
        "async function memory(\n",
        "\nasync function safety(",
        "memory function",
    )
    memory = memory.replace('title: textValue(item.statement, "Recorded decision")', 'title: plainOwnerText(item.statement, "Recorded decision")')
    memory = memory.replace('summary: textValue(item.rationale, "No reason was recorded.")', 'summary: plainOwnerText(item.rationale, "No reason was recorded.")')
    memory = memory.replace('title: textValue(item.title, "Project work")', 'title: plainOwnerText(item.title, "Project work")')
    memory = memory.replace('summary: textValue(item.description, "No summary was recorded.")', 'summary: plainOwnerText(item.description, "No summary was recorded.")')
    memory = memory.replace('summary: textValue(item.lesson, "No summary was recorded.")', 'summary: plainOwnerText(item.lesson, "No summary was recorded.")')
    memory = memory.replace('title: textValue(item.evidence_type, "Project proof")', 'title: plainOwnerText(item.evidence_type, "Project proof")')
    memory, count = re.subn(
        r'''summary: `\$\{textValue\(item\.provider, "Recorded service"\)\}: \$\{.*?\n      \}`,''',
        '''summary: plainOwnerText(
        item.verdict,
        plainOwnerText(item.status, "Not checked yet"),
      ).replace(/[._-]+/g, " "),''',
        memory,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit(f"memory provider summary: expected one match, found {count}")
    memory = memory.replace(
        'plainStatus: textValue(item.status, "Not checked yet")',
        'plainStatus: plainOwnerText(item.status, "Not checked yet")',
    )
    memory = memory.replace('plainSource: "Governed project record"', 'plainSource: "Project record"')
    text = text[:mleft] + memory + text[mright:]

    text = sub_once(
        text,
        r"async function safety\(context: UserContext\) \{.*?\n\}\n\nasync function acceptIntake",
        '''async function safety(context: UserContext) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [policy, health, audit] = await Promise.all([
    context.client.from("projectos_policies").select("*").eq(
      "organization_id",
      context.organizationId,
    ).maybeSingle(),
    context.client.from("projectos_integration_health")
      .select("status, last_success_at, stale_after")
      .eq("organization_id", context.organizationId),
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
    mfaRequiredForApproval: true,
    state,
    plainStatus: state === "problem"
      ? "Needs attention"
      : state === "protected"
      ? "Protected"
      : "Not checked yet",
  };
}

async function acceptIntake''',
        "safety safe DTO",
    )

    text = sub_once(
        text,
        r'''\n    advanced: \{\n      intakeId: intake\.id \?\? null,\n      projectKey: acceptedProject\.project_key \?\? null,\n      idempotencyKey: idempotency,\n      duplicateProtection: providedKey\n        \? "client_key"\n        : "ten_minute_retry_window",\n    \},''',
        "",
        "intake advanced payload",
    )
    text = replace_once(
        text,
        "I saved that request and sent it into Pandora's governed planning flow.",
        "I saved that request and sent it into Pandora's safe planning flow.",
        "ask response copy",
    )
    text = replace_once(
        text,
        '''        Object.entries(ACTION_CATALOG).map(([id, action]) => ({
          id,
          ...action,
          extraIdentityCheckRequired: action.risk === "CRITICAL" ||
            id === "pause-service" || id === "apply-approved-code-change",
          executionMode: "plan_first",
        })),''',
        '''        Object.entries(ACTION_CATALOG).map(([id, action]) => ({
          id,
          title: action.title,
          description: action.description,
          extraIdentityCheckRequired: action.risk === "CRITICAL" ||
            id === "pause-service" || id === "apply-approved-code-change",
        })),''',
        "actions safe DTO",
    )
    return text


def patch_schema(text: str) -> str:
    replacement = '''_PandoraSchemas _declareSchemas(App app) {
  final projectSummary = app.struct('PandoraProjectSummary', {
    'id': string,
    'name': string,
    'plainPurpose': string,
    'phase': string,
    'progressPercent': double_,
    'progressVerified': bool_,
    'plainStatus': string,
    'whatIsStoppingUs': string,
    'whatIWillDoNext': string,
    'dataFreshness': string,
    'lastVerifiedAt': dateTime,
  });
  final projectPhase = app.struct('PandoraProjectPhase', {
    'id': string,
    'name': string,
    'sequence': int_,
    'plainStatus': string,
    'startedAt': dateTime,
    'completedAt': dateTime,
  });
  final projectTask = app.struct('PandoraProjectTask', {
    'id': string,
    'title': string,
    'description': string,
    'plainStatus': string,
    'updatedAt': dateTime,
  });
  final projectEvidence = app.struct('PandoraProjectEvidence', {
    'id': string,
    'taskId': string,
    'title': string,
    'plainStatus': string,
    'observedAt': dateTime,
  });
  final release = app.struct('PandoraRelease', {
    'id': string,
    'title': string,
    'plainStatus': string,
    'verified': bool_,
    'rollbackAvailable': bool_,
    'observedAt': dateTime,
  });
  final projectDetail = app.struct('PandoraProjectDetail', {
    'id': string,
    'name': string,
    'plainPurpose': string,
    'phase': string,
    'progressPercent': double_,
    'progressVerified': bool_,
    'plainStatus': string,
    'whatIsStoppingUs': string,
    'whatIWillDoNext': string,
    'dataFreshness': string,
    'lastVerifiedAt': dateTime,
    'objective': string,
    'phases': listOf(projectPhase),
    'tasks': listOf(projectTask),
    'evidence': listOf(projectEvidence),
    'recentReleases': listOf(release),
  });
  final systemHealth = app.struct('PandoraSystemHealth', {
    'state': string,
    'label': string,
    'lastCheckedAt': dateTime,
  });
  final counters = app.struct('PandoraHomeCounters', {
    'approvals': int_,
    'activeProjects': int_,
    'needsAttention': int_,
  });
  final approval = app.struct('PandoraApproval', {
    'id': string,
    'projectId': string,
    'whatWillHappen': string,
    'whyINeedYou': string,
    'whatWillChange': string,
    'whatCouldGoWrong': string,
    'howWeCanUndoIt': string,
    'riskLevel': string,
    'reversible': bool_,
    'extraIdentityCheckRequired': bool_,
    'decision': string,
    'expiresAt': dateTime,
    'createdAt': dateTime,
  });
  final activity = app.struct('PandoraActivity', {
    'id': string,
    'summary': string,
    'happenedAt': dateTime,
  });
  final memoryItem = app.struct('PandoraMemoryItem', {
    'id': string,
    'projectId': string,
    'kind': string,
    'title': string,
    'summary': string,
    'plainStatus': string,
    'happenedAt': dateTime,
  });
  final memory = app.struct('PandoraMemoryPayload', {
    'query': string,
    'projectId': string,
    'plainSource': string,
    'directMemoryStatus': string,
    'items': listOf(memoryItem),
  });
  final home = app.struct('PandoraHomePayload', {
    'systemHealth': systemHealth,
    'priority': approval,
    'counters': counters,
    'topProjects': listOf(projectSummary),
    'recentActivity': listOf(activity),
  });
  final connection = app.struct('PandoraConnection', {
    'id': string,
    'name': string,
    'plainPurpose': string,
    'state': string,
    'plainStatus': string,
    'canRead': bool_,
    'canChange': bool_,
    'canConnect': bool_,
    'canReconnect': bool_,
    'canTest': bool_,
    'canDisconnect': bool_,
    'needsOwnerApprovalForChanges': bool_,
    'lastCheckedAt': dateTime,
  });
  final safety = app.struct('PandoraSafety', {
    'mfaRequiredForApproval': bool_,
    'state': string,
    'plainStatus': string,
  });
  final actionItem = app.struct('PandoraActionCatalogItem', {
    'id': string,
    'title': string,
    'description': string,
    'extraIdentityCheckRequired': bool_,
  });
  final askStatus = app.struct('PandoraAskStatus', {
    'whatChanged': string,
    'whereWeAre': string,
    'whatIsDone': string,
    'whatIsHappeningNow': string,
    'whatIsStoppingUs': string,
    'whatIWillDoNext': string,
  });
  final askResponse = app.struct('PandoraAskResponse', {
    'reply': string,
    'needsApproval': bool_,
    'actionId': string,
    'approvalId': string,
    'status': askStatus,
  });
  final decisionResponse = app.struct('PandoraApprovalDecision', {
    'ok': bool_,
    'decision': string,
    'approval': approval,
  });

  return _PandoraSchemas(
    projectSummary: projectSummary,
    projectDetail: projectDetail,
    approval: approval,
    activity: activity,
    memory: memory,
    home: home,
    connection: connection,
    safety: safety,
    actionItem: actionItem,
    askResponse: askResponse,
    decisionResponse: decisionResponse,
  );
}

_PandoraApi _declareOwnerApi'''
    text = sub_once(
        text,
        r"_PandoraSchemas _declareSchemas\(App app\) \{.*?\n\}\n\n_PandoraApi _declareOwnerApi",
        replacement,
        "owner schema",
    )
    text = replace_once(text, "      label: 'Work',", "      label: 'Actions',", "Actions nav")
    text = replace_once(text, "      label: 'Approve',", "      label: 'Approvals',", "Approvals nav")
    text = replace_once(text, "      label: 'Memory',", "      label: 'Activity',", "Activity nav")
    return text


def patch_ui(text: str) -> str:
    replacements = [
        ("          Text(State(spec.projectData)['repository'], style: Styles.bodySmall),\n", "", "project repository"),
        ("            Text(item['status'], style: Styles.labelMedium),", "            Text(item['plainStatus'], style: Styles.labelMedium),", "task status"),
        ("            Text(item['environment'], style: Styles.bodySmall),\n", "", "release environment"),
        ("            Text(item['evidence_type'], style: Styles.titleSmall),", "            Text(item['title'], style: Styles.titleSmall),", "evidence title"),
        ("            Text(item['provider'], style: Styles.bodySmall),\n", "", "evidence service"),
        ("            Text(item['verdict'], style: Styles.labelMedium),", "            Text(item['plainStatus'], style: Styles.labelMedium),", "evidence status"),
        ("            Text(item['observed_at'], style: Styles.bodySmall),", "            Text(item['observedAt'], style: Styles.bodySmall),", "evidence time"),
        ("    _brandHeader('Work', 'Choose a governed action'),", "    _brandHeader('Actions', 'Choose what you want Pandora to do'),", "Actions header"),
        ("      'Try loading work again',", "      'Try loading actions again',", "Actions retry"),
        ("            Text(item['provider'], style: Styles.labelSmall),\n", "", "action service"),
        ("    _brandHeader('Approve', 'Only items that need you'),", "    _brandHeader('Approvals', 'Only decisions that need you'),", "Approvals header"),
        ("    _brandHeader('Memory & updates', 'Continue from verified records'),", "    _brandHeader('Activity', 'Recent changes and verified records'),", "Activity header"),
        ("          Text('Direct Memory connection', style: Styles.labelMedium),", "          Text('Record status', style: Styles.labelMedium),", "record status"),
        ("          Text('Audit integrity', style: Styles.titleMedium),", "          Text('Protected activity', style: Styles.titleMedium),", "Safety title"),
        ("            'Pandora checks the audit chain on the governed backend.',", "            'Pandora checks that protected activity records remain intact.',", "Safety body"),
        ("            'Technical hashes stay hidden in simple mode.',", "            'Detailed verification data stays out of the way.',", "Safety detail"),
        ("      'Set up work for this project',", "      'Choose an action for this project',", "project CTA"),
    ]
    for old, new, label in replacements:
        text = replace_once(text, old, new, label)
    text = replace_once(
        text,
        "'Pandora plans first. The backend still enforces approval and the extra '",
        "'Pandora plans first. Approval and an extra identity check still apply '",
        "plan copy first line",
    )
    text = replace_once(
        text,
        "'identity check before protected changes.'",
        "'before protected changes.'",
        "plan copy second line",
    )
    return text


def check_final(api: str, schema: str, ui: str) -> None:
    api_forbidden = [
        "repository: textValue(project.repository)",
        "provider: textValue(evidence.provider)",
        "advanced: { provider, scopes, observedStatus: status }",
        "currentAssuranceLevel: context.aal",
        'summary: `${textValue(item.provider',
        "...action,",
        "environment: textValue(payload.environment)",
        "sourceUrl: textValue(evidence.source_url)",
        "headSha: textValue(evidence.head_sha)",
    ]
    schema_forbidden = [
        "'repository': string,",
        "'provider': string,",
        "'advanced': json,",
        "'currentAssuranceLevel': string,",
        "'environment': string,",
        "'headSha': string,",
        "label: 'Work'",
        "label: 'Approve'",
        "label: 'Memory'",
    ]
    ui_forbidden = [
        "State(spec.projectData)['repository']",
        "item['provider']",
        "_brandHeader('Work'",
        "_brandHeader('Approve'",
        "_brandHeader('Memory & updates'",
        "The backend still enforces",
        "governed backend",
        "Technical hashes",
    ]
    for label, text, forbidden in [
        ("owner API", api, api_forbidden),
        ("owner schema", schema, schema_forbidden),
        ("owner UI", ui, ui_forbidden),
    ]:
        leaked = [value for value in forbidden if value in text]
        if leaked:
            raise SystemExit(f"{label}: forbidden owner-surface fragments remain: {leaked}")
    required_nav = [
        "label: 'Home'",
        "label: 'Actions'",
        "label: 'Approvals'",
        "label: 'Activity'",
        "label: 'Safety'",
    ]
    missing = [value for value in required_nav if value not in schema]
    if missing:
        raise SystemExit(f"owner navigation: missing {missing}")
    if "function plainOwnerText" not in api:
        raise SystemExit("plain-language translation boundary is missing")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.apply == args.check:
        raise SystemExit("choose exactly one of --apply or --check")

    api = API.read_text()
    schema = SCHEMA.read_text()
    ui = UI.read_text()
    if args.apply:
        api = patch_api(api)
        schema = patch_schema(schema)
        ui = patch_ui(ui)
        check_final(api, schema, ui)
        API.write_text(api)
        SCHEMA.write_text(schema)
        UI.write_text(ui)
        print("PANDORA_P1_PATCH APPLIED")
    else:
        check_final(api, schema, ui)
        print("PANDORA_P1_SOURCE_GUARD PASS")


if __name__ == "__main__":
    main()
