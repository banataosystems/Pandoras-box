"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectProjectOSContinuation = projectProjectOSContinuation;
const FULL_SHA = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ELIGIBLE_STATUSES = new Set([
    "in-progress",
    "ready",
    "not-started",
    "queued-qualification",
]);
const VALID_TASK_STATUSES = new Set([
    "complete",
    "in-progress",
    "ready",
    "not-started",
    "queued-qualification",
    "partial",
    "blocked",
]);
const VALID_EVIDENCE_OUTCOMES = new Set([
    "complete",
    "partial",
    "blocked",
]);
const VALID_EVIDENCE_SOURCE_TYPES = new Set([
    "merged-pull-request",
    "workflow-run",
    "commit",
    "deployment",
    "provider-run",
    "database-query",
]);
function compareText(left, right) {
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    return 0;
}
function assertNonBlank(value, label) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label} must be a non-empty string`);
    }
}
function assertUniqueIds(values, label) {
    const seen = new Set();
    for (const value of values) {
        assertNonBlank(value.id, `${label} id`);
        if (seen.has(value.id))
            throw new Error(`duplicate ${label} id ${value.id}`);
        seen.add(value.id);
    }
}
function assertAcyclic(ids, dependenciesFor, label) {
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
        if (visiting.has(id))
            throw new Error(`${label} dependency cycle includes ${id}`);
        if (visited.has(id))
            return;
        visiting.add(id);
        for (const dependency of dependenciesFor(id))
            visit(dependency);
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of ids)
        visit(id);
}
function validateManifest(manifest) {
    assertNonBlank(manifest.schemaVersion, "manifest schemaVersion");
    assertNonBlank(manifest.planVersion, "manifest planVersion");
    if (!Array.isArray(manifest.phases) || manifest.phases.length === 0) {
        throw new Error("manifest phases must contain at least one phase");
    }
    if (!Array.isArray(manifest.tasks) || manifest.tasks.length === 0) {
        throw new Error("manifest tasks must contain at least one task");
    }
    assertUniqueIds(manifest.phases, "phase");
    assertUniqueIds(manifest.tasks, "task");
    const phaseIds = new Set(manifest.phases.map((phase) => phase.id));
    const phaseIndex = new Map(manifest.phases.map((phase, index) => [phase.id, index]));
    const taskIds = new Set(manifest.tasks.map((task) => task.id));
    for (const phase of manifest.phases) {
        assertNonBlank(phase.name, `phase ${phase.id} name`);
        if (!Array.isArray(phase.dependsOn)) {
            throw new Error(`phase ${phase.id} dependsOn must be an array`);
        }
        for (const dependency of phase.dependsOn) {
            if (!phaseIds.has(dependency)) {
                throw new Error(`phase ${phase.id} has unknown dependency ${dependency}`);
            }
            if (dependency === phase.id) {
                throw new Error(`phase ${phase.id} cannot depend on itself`);
            }
            if ((phaseIndex.get(dependency) ?? Number.MAX_SAFE_INTEGER)
                >= (phaseIndex.get(phase.id) ?? -1)) {
                throw new Error(`phase ${phase.id} dependency ${dependency} must appear earlier in the canonical order`);
            }
        }
    }
    for (const task of manifest.tasks) {
        assertNonBlank(task.title, `task ${task.id} title`);
        assertNonBlank(task.repository, `task ${task.id} repository`);
        if (!phaseIds.has(task.phase)) {
            throw new Error(`task ${task.id} has unknown phase ${task.phase}`);
        }
        if (!VALID_TASK_STATUSES.has(task.status)) {
            throw new Error(`task ${task.id} has invalid status ${String(task.status)}`);
        }
        if (task.continuationRole !== undefined
            && task.continuationRole !== "primary"
            && task.continuationRole !== "parallel") {
            throw new Error(`task ${task.id} has invalid continuationRole ${String(task.continuationRole)}`);
        }
        for (const dependency of task.dependsOn ?? []) {
            if (!taskIds.has(dependency)) {
                throw new Error(`task ${task.id} has unknown dependency ${dependency}`);
            }
            if (dependency === task.id) {
                throw new Error(`task ${task.id} cannot depend on itself`);
            }
        }
    }
    assertAcyclic(manifest.phases.map((phase) => phase.id), (id) => manifest.phases.find((phase) => phase.id === id)?.dependsOn ?? [], "phase");
    assertAcyclic(manifest.tasks.map((task) => task.id), (id) => manifest.tasks.find((task) => task.id === id)?.dependsOn ?? [], "task");
}
function validateEvidence(ledger, manifest) {
    assertNonBlank(ledger.schemaVersion, "evidence schemaVersion");
    if (!ISO_TIMESTAMP.test(ledger.observedThrough)) {
        throw new Error("evidence observedThrough must be an ISO UTC timestamp");
    }
    if (!Array.isArray(ledger.records)) {
        throw new Error("evidence records must be an array");
    }
    assertUniqueIds(ledger.records, "evidence");
    const taskIds = new Set(manifest.tasks.map((task) => task.id));
    const taskById = new Map(manifest.tasks.map((task) => [task.id, task]));
    for (const record of ledger.records) {
        if (!Array.isArray(record.taskIds) || record.taskIds.length === 0) {
            throw new Error(`evidence ${record.id} must name at least one task`);
        }
        if (new Set(record.taskIds).size !== record.taskIds.length) {
            throw new Error(`evidence ${record.id} taskIds must be unique`);
        }
        if (!VALID_EVIDENCE_OUTCOMES.has(record.outcome)) {
            throw new Error(`evidence ${record.id} has invalid outcome ${String(record.outcome)}`);
        }
        if (record.verification !== "verified" && record.verification !== "unverified") {
            throw new Error(`evidence ${record.id} has invalid verification ${String(record.verification)}`);
        }
        if (!VALID_EVIDENCE_SOURCE_TYPES.has(record.sourceType)) {
            throw new Error(`evidence ${record.id} has invalid sourceType ${String(record.sourceType)}`);
        }
        for (const taskId of record.taskIds) {
            if (!taskIds.has(taskId)) {
                throw new Error(`evidence ${record.id} names unknown task ${taskId}`);
            }
            if (taskById.get(taskId)?.repository !== record.repository) {
                throw new Error(`evidence ${record.id} repository does not match task ${taskId}`);
            }
        }
        assertNonBlank(record.repository, `evidence ${record.id} repository`);
        if (!record.url.startsWith("https://")) {
            throw new Error(`evidence ${record.id} url must use HTTPS`);
        }
        if (!ISO_TIMESTAMP.test(record.observedAt)) {
            throw new Error(`evidence ${record.id} observedAt must be an ISO UTC timestamp`);
        }
        if (record.observedAt > ledger.observedThrough) {
            throw new Error(`evidence ${record.id} is newer than observedThrough`);
        }
        if (record.headSha !== undefined && !FULL_SHA.test(record.headSha)) {
            throw new Error(`evidence ${record.id} headSha must be a lowercase full SHA`);
        }
        if (record.commitSha !== undefined && !FULL_SHA.test(record.commitSha)) {
            throw new Error(`evidence ${record.id} commitSha must be a lowercase full SHA`);
        }
        if (record.sourceType === "merged-pull-request"
            && (!record.headSha || !record.commitSha)) {
            throw new Error(`merged-pull-request evidence ${record.id} requires headSha and commitSha`);
        }
        if (record.sourceType === "merged-pull-request"
            && !record.url.startsWith(`https://github.com/${record.repository}/pull/`)) {
            throw new Error(`merged-pull-request evidence ${record.id} must use its repository pull-request URL`);
        }
        if (record.sourceType === "workflow-run"
            && !record.url.startsWith(`https://github.com/${record.repository}/actions/runs/`)) {
            throw new Error(`workflow-run evidence ${record.id} must use its repository Actions URL`);
        }
    }
}
function evidenceStatus(task, records) {
    const verified = records.filter((record) => record.verification === "verified" && record.taskIds.includes(task.id)).sort((left, right) => compareText(left.observedAt, right.observedAt)
        || compareText(left.id, right.id));
    const completedRecords = verified.filter((record) => record.outcome === "complete");
    const blockedRecords = verified.filter((record) => record.outcome === "blocked");
    const latestComplete = completedRecords[completedRecords.length - 1];
    const latestBlocked = blockedRecords[blockedRecords.length - 1];
    if (latestBlocked
        && (!latestComplete
            || latestBlocked.observedAt >= latestComplete.observedAt)) {
        return "blocked";
    }
    if (latestComplete)
        return "complete";
    if (verified.some((record) => record.outcome === "partial"))
        return "partial";
    if (task.status === "complete")
        return "blocked";
    return task.status;
}
function phaseDependenciesComplete(phase, phaseById) {
    return phase.dependsOn.every((dependency) => phaseById.get(dependency)?.status === "complete");
}
function taskStatusPriority(status) {
    if (status === "in-progress")
        return 0;
    if (status === "ready")
        return 1;
    if (status === "queued-qualification")
        return 2;
    return 3;
}
function projectProjectOSContinuation(manifest, ledger) {
    validateManifest(manifest);
    validateEvidence(ledger, manifest);
    const evidenceByTask = new Map();
    for (const task of manifest.tasks)
        evidenceByTask.set(task.id, []);
    for (const record of ledger.records) {
        for (const taskId of record.taskIds) {
            evidenceByTask.get(taskId)?.push(record);
        }
    }
    const resolvedStatus = new Map();
    for (const task of manifest.tasks) {
        resolvedStatus.set(task.id, evidenceStatus(task, evidenceByTask.get(task.id) ?? []));
    }
    const taskAssessments = manifest.tasks.map((task) => {
        const missingDependencies = (task.dependsOn ?? []).filter((dependency) => resolvedStatus.get(dependency) !== "complete");
        const records = (evidenceByTask.get(task.id) ?? [])
            .filter((record) => record.verification === "verified")
            .sort((left, right) => compareText(left.id, right.id));
        const blockerIds = [...new Set(task.blockerIds ?? [])].sort(compareText);
        if (task.status === "complete" && records.every((record) => record.outcome !== "complete")) {
            blockerIds.push("completion-evidence-missing");
        }
        return {
            id: task.id,
            title: task.title,
            phase: task.phase,
            repository: task.repository,
            declaredStatus: task.status,
            status: resolvedStatus.get(task.id),
            dependencyReady: missingDependencies.length === 0,
            missingDependencies,
            blockerIds: [...new Set(blockerIds)].sort(compareText),
            evidenceIds: records.map((record) => record.id),
            blocksPhaseExit: task.blocksPhaseExit !== false,
            builderAgent: task.builderAgent,
            reviewerAgent: task.reviewerAgent,
            continuationRole: task.continuationRole ?? "primary",
        };
    });
    const assessmentByTask = new Map(taskAssessments.map((assessment) => [assessment.id, assessment]));
    const phaseAssessments = [];
    const phaseById = new Map();
    for (const phase of manifest.phases) {
        const tasks = manifest.tasks
            .filter((task) => task.phase === phase.id && task.blocksPhaseExit !== false)
            .map((task) => assessmentByTask.get(task.id));
        const completedTasks = tasks.filter((task) => task.status === "complete").length;
        const dependenciesComplete = phaseDependenciesComplete(phase, phaseById);
        let status;
        if (tasks.length > 0 && completedTasks === tasks.length && dependenciesComplete) {
            status = "complete";
        }
        else if (!dependenciesComplete) {
            status = "planned";
        }
        else if (tasks.some((task) => task.status === "blocked"
            || (!task.dependencyReady && task.missingDependencies.length > 0))
            && !tasks.some((task) => task.dependencyReady && ELIGIBLE_STATUSES.has(task.status))) {
            status = "blocked";
        }
        else {
            status = "active";
        }
        const assessment = {
            id: phase.id,
            name: phase.name,
            status,
            completedTasks,
            gatingTasks: tasks.length,
        };
        phaseAssessments.push(assessment);
        phaseById.set(phase.id, assessment);
    }
    const phaseIndex = new Map(manifest.phases.map((phase, index) => [phase.id, index]));
    const taskIndex = new Map(manifest.tasks.map((task, index) => [task.id, index]));
    const candidates = taskAssessments
        .filter((task) => {
        const phase = manifest.phases.find((item) => item.id === task.phase);
        return Boolean(phase
            && phaseDependenciesComplete(phase, phaseById)
            && task.dependencyReady
            && task.blockerIds.length === 0
            && ELIGIBLE_STATUSES.has(task.status));
    })
        .sort((left, right) => taskStatusPriority(left.status) - taskStatusPriority(right.status)
        || (phaseIndex.get(left.phase) ?? Number.MAX_SAFE_INTEGER)
            - (phaseIndex.get(right.phase) ?? Number.MAX_SAFE_INTEGER)
        || (taskIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER)
            - (taskIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
        || compareText(left.id, right.id));
    const completed = taskAssessments.filter((task) => task.status === "complete").length;
    const nextTask = candidates.find((task) => task.continuationRole === "primary")
        ?? candidates[0]
        ?? null;
    const activePhase = phaseAssessments.find((phase) => phase.status !== "complete") ?? null;
    const blocked = taskAssessments.filter((task) => task.status === "blocked"
        || task.status === "partial"
        || task.blockerIds.length > 0
        || (!task.dependencyReady && task.status !== "complete"));
    const allComplete = completed === taskAssessments.length;
    return {
        schemaVersion: "1.0.0",
        planVersion: manifest.planVersion,
        observedThrough: ledger.observedThrough,
        status: allComplete ? "complete" : nextTask ? "active" : "blocked",
        currentPhase: activePhase,
        phases: phaseAssessments,
        progress: {
            completed,
            total: taskAssessments.length,
            percent: Math.floor((completed / taskAssessments.length) * 100),
        },
        nextTask,
        readyParallel: candidates.filter((task) => task.id !== nextTask?.id),
        blocked,
        drift: taskAssessments
            .filter((task) => task.declaredStatus !== task.status)
            .map((task) => ({
            taskId: task.id,
            declaredStatus: task.declaredStatus,
            evidenceStatus: task.status,
        })),
        tasks: taskAssessments,
    };
}
//# sourceMappingURL=continuation.js.map