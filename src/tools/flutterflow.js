"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.flutterFlowTools = exports.FlutterFlowMCPServer = exports.FlutterFlowProjectApiError = void 0;
exports.executeFlutterFlowTool = executeFlutterFlowTool;

const zod_1 = require("zod");

const FLUTTERFLOW_API_ORIGIN = "https://api.flutterflow.io/v2";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const ProjectIdSchema = zod_1.z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);

const AccountConfigurationSchema = zod_1.z.object({
    id: zod_1.z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
    label: zod_1.z.string().min(1).max(160),
    authMode: zod_1.z.literal("api_token").default("api_token"),
    token: zod_1.z.string().min(20),
    baseUrl: zod_1.z.literal(FLUTTERFLOW_API_ORIGIN).default(FLUTTERFLOW_API_ORIGIN),
    allowedProjectIds: zod_1.z.array(ProjectIdSchema).min(1).max(100),
    grantedScopes: zod_1.z.array(zod_1.z.string().trim().min(1)).default([]),
});

const RuntimeConfigurationSchema = zod_1.z.object({
    accounts: zod_1.z.array(AccountConfigurationSchema).min(1).max(20),
    timeoutMs: zod_1.z.number().int().min(250).max(30_000).default(DEFAULT_TIMEOUT_MS),
    maxResponseBytes: zod_1.z.number().int().min(1024).max(2_000_000).default(DEFAULT_MAX_RESPONSE_BYTES),
}).superRefine((configuration, context) => {
    const accountIds = new Set();
    for (const account of configuration.accounts) {
        if (accountIds.has(account.id)) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["accounts"],
                message: `duplicate FlutterFlow account id: ${account.id}`,
            });
        }
        accountIds.add(account.id);
    }
});

const ProjectEntrySchema = zod_1.z.object({
    id: ProjectIdSchema,
    project: zod_1.z.object({
        name: zod_1.z.string().min(1).max(300),
        createdAt: zod_1.z.string().optional(),
        updatedAt: zod_1.z.string().optional(),
        Extras: zod_1.z.object({
            createdAt: zod_1.z.string().optional(),
            updatedAt: zod_1.z.string().optional(),
        }).optional(),
        mainBranchRef: zod_1.z.object({ path: zod_1.z.string().max(512) }).optional(),
        numBranches: zod_1.z.number().int().nonnegative().optional(),
        totalNumUpdates: zod_1.z.number().int().nonnegative().optional(),
        totalNumUpdatesV2: zod_1.z.number().int().nonnegative().optional(),
        projectVersionNumber: zod_1.z.number().int().nonnegative().optional(),
        isLibrary: zod_1.z.boolean().optional(),
        isMainBranch: zod_1.z.boolean().optional(),
    }),
});

function deserializeProviderValue(value) {
    if (typeof value !== "string")
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}

const ProjectListResponseSchema = zod_1.z.object({
    success: zod_1.z.literal(true),
    reason: zod_1.z.unknown().nullable().optional(),
    value: zod_1.z.preprocess(deserializeProviderValue, zod_1.z.object({
        entries: zod_1.z.array(ProjectEntrySchema).max(10_000),
    })),
});

const PartitionedFilesResponseSchema = zod_1.z.object({
    success: zod_1.z.literal(true),
    reason: zod_1.z.unknown().nullable().optional(),
    value: zod_1.z.object({
        versionInfo: zod_1.z.object({
            partitionerVersion: zod_1.z.number().int().nonnegative(),
            projectSchemaFingerprint: zod_1.z.string().min(1).max(512),
        }),
        fileNames: zod_1.z.array(zod_1.z.string().min(1).max(2048)).max(100_000),
    }),
});

const AccountArgsSchema = zod_1.z.object({
    accountId: zod_1.z.string().min(1),
});

const ReadinessArgsSchema = AccountArgsSchema.extend({
    projectId: ProjectIdSchema,
});

class FlutterFlowProjectApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "FlutterFlowProjectApiError";
        this.status = status;
    }
}
exports.FlutterFlowProjectApiError = FlutterFlowProjectApiError;

function declaredResponseLength(response) {
    const value = response.headers?.get("content-length")?.trim();
    if (!value || !/^\d+$/.test(value))
        return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function readBoundedBody(response, maxResponseBytes) {
    const declaredLength = declaredResponseLength(response);
    if (declaredLength !== undefined && declaredLength > maxResponseBytes) {
        throw new FlutterFlowProjectApiError("FlutterFlow Project API response exceeded size limit");
    }
    if (!response.body?.getReader) {
        const body = await response.text();
        if (Buffer.byteLength(body, "utf8") > maxResponseBytes) {
            throw new FlutterFlowProjectApiError("FlutterFlow Project API response exceeded size limit");
        }
        return body;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = "";
    let bytesRead = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            bytesRead += value.byteLength;
            if (bytesRead > maxResponseBytes) {
                await reader.cancel?.("FlutterFlow Project API response exceeded size limit");
                throw new FlutterFlowProjectApiError("FlutterFlow Project API response exceeded size limit");
            }
            body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
        return body;
    }
    finally {
        reader.releaseLock?.();
    }
}

function normalizedProject(project) {
    return {
        id: project.id,
        name: project.project.name,
        createdAt: project.project.createdAt ?? project.project.Extras?.createdAt,
        updatedAt: project.project.updatedAt ?? project.project.Extras?.updatedAt,
        mainBranchPath: project.project.mainBranchRef?.path,
        branchCount: project.project.numBranches,
        updateCount: project.project.totalNumUpdatesV2 ?? project.project.totalNumUpdates,
        projectVersionNumber: project.project.projectVersionNumber,
        isLibrary: project.project.isLibrary,
        isMainBranch: project.project.isMainBranch,
    };
}

function parseProviderContract(schema, value) {
    try {
        return schema.parse(value);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            throw new FlutterFlowProjectApiError("FlutterFlow Project API response contract changed");
        }
        throw error;
    }
}

function configurationSignals(fileNames) {
    const exact = new Set(fileNames);
    const prefixCount = (prefix) => fileNames.filter((name) => name.startsWith(prefix)).length;
    return {
        appDetailsPresent: exact.has("app-details"),
        authenticationConfigPresent: exact.has("authentication"),
        appStatePresent: exact.has("app-state"),
        themePresent: exact.has("theme") || exact.has("app-theme"),
        pageCount: prefixCount("page/"),
        componentCount: prefixCount("component/"),
        customFileCount: prefixCount("custom-file/"),
    };
}

function readinessAssessment(project, partitioned, observedAt) {
    const signals = configurationSignals(partitioned.fileNames);
    const structuralEvidencePresent = signals.appDetailsPresent && signals.pageCount > 0;
    const projectType = project.isLibrary === true
        ? "library"
        : project.isLibrary === false
            ? "application"
            : "unknown";
    const projectTypeGateStatus = projectType === "library"
        ? "failed"
        : projectType === "application"
            ? "passed"
            : "not_proven";
    return {
        accountEvidence: "server-side FlutterFlow Project API bearer accepted",
        project,
        projectType,
        observedAt,
        apiVersion: "v2-beta",
        schema: {
            partitionerVersion: partitioned.versionInfo.partitionerVersion,
            projectSchemaFingerprint: partitioned.versionInfo.projectSchemaFingerprint,
            partitionedFileCount: partitioned.fileNames.length,
        },
        configurationSignals: signals,
        projectConfigurationStatus: structuralEvidencePresent ? "observed" : "blocked",
        deploymentReadiness: {
            status: "blocked",
            summary: projectType === "library"
                ? "FlutterFlow reports this project as a Library; Library projects cannot use web or mobile deployment."
                : structuralEvidencePresent
                    ? "Project structure is readable, but deployment evidence is incomplete."
                    : "Required FlutterFlow project structure is missing or could not be evidenced.",
            gates: [
                { key: "provider_read_access", status: "passed" },
                { key: "exact_project_binding", status: "passed" },
                {
                    key: "deployable_project_type",
                    status: projectTypeGateStatus,
                    observed: projectType,
                    required: "application",
                },
                { key: "schema_snapshot", status: "passed" },
                {
                    key: "minimum_project_structure",
                    status: structuralEvidencePresent ? "passed" : "failed",
                    required: ["app-details", "at least one page"],
                },
                { key: "project_yaml_validation", status: "not_run" },
                { key: "generated_code_build", status: "not_proven" },
                { key: "android_ios_signing", status: "not_proven" },
                { key: "authenticated_device_journey", status: "not_proven" },
                { key: "release_authorization", status: "not_granted" },
            ],
        },
    };
}

class FlutterFlowMCPServer {
    constructor(configuration, fetchFn = globalThis.fetch, now = () => new Date().toISOString()) {
        this.config = RuntimeConfigurationSchema.parse(configuration);
        this.fetchFn = fetchFn;
        this.now = now;
    }

    listAccounts() {
        return this.config.accounts.map((account) => ({
            id: account.id,
            label: account.label,
            authMode: account.authMode,
            baseUrl: account.baseUrl,
            allowedProjectIds: [...account.allowedProjectIds],
            grantedScopes: [...account.grantedScopes],
            credentialConfigured: Boolean(account.token),
            mutations: false,
        }));
    }

    account(accountId) {
        const account = this.config.accounts.find((candidate) => candidate.id === accountId);
        if (!account) {
            throw new FlutterFlowProjectApiError(`Unknown FlutterFlow account: ${accountId}`, 404);
        }
        if (account.baseUrl !== FLUTTERFLOW_API_ORIGIN) {
            throw new FlutterFlowProjectApiError("FlutterFlow Project API origin is not trusted");
        }
        return account;
    }

    assertProjectAllowed(account, projectId) {
        if (!account.allowedProjectIds.includes(projectId)) {
            throw new FlutterFlowProjectApiError(
                `FlutterFlow account ${account.id} is not allowed to access project ${projectId}`,
                403,
            );
        }
    }

    async listProjects(accountId) {
        const account = this.account(accountId);
        const response = parseProviderContract(ProjectListResponseSchema, await this.request(
            account,
            "/l/listProjects",
            "POST",
            {},
            { project_type: "ALL", deserialize_response: true },
        ));
        return response.value.entries
            .filter((project) => account.allowedProjectIds.includes(project.id))
            .map(normalizedProject);
    }

    async inspectReadiness(accountId, projectId) {
        const account = this.account(accountId);
        this.assertProjectAllowed(account, projectId);
        const projects = await this.listProjects(accountId);
        const project = projects.find((candidate) => candidate.id === projectId);
        if (!project) {
            throw new FlutterFlowProjectApiError(
                `FlutterFlow project ${projectId} is not visible to account ${accountId}`,
                404,
            );
        }
        const response = parseProviderContract(PartitionedFilesResponseSchema, await this.request(
            account,
            "/listPartitionedFileNames",
            "GET",
            { projectId },
        ));
        return readinessAssessment(project, response.value, this.now());
    }

    async request(account, path, method, query, body) {
        if (!path.startsWith("/") || path.includes("://")) {
            throw new FlutterFlowProjectApiError("FlutterFlow Project API path is not trusted");
        }
        const url = new URL(`${FLUTTERFLOW_API_ORIGIN}${path}`);
        for (const [key, value] of Object.entries(query || {})) {
            url.searchParams.set(key, String(value));
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const response = await this.fetchFn(url.toString(), {
                method,
                headers: {
                    Authorization: `Bearer ${account.token}`,
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    "User-Agent": "MCPMaster-FlutterFlow-Control/1.0",
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
                redirect: "error",
            });
            const responseBody = await readBoundedBody(response, this.config.maxResponseBytes);
            if (!response.ok) {
                throw new FlutterFlowProjectApiError(
                    `FlutterFlow Project API request failed with ${response.status}`,
                    response.status,
                );
            }
            if (!responseBody.trim()) {
                throw new FlutterFlowProjectApiError("FlutterFlow Project API returned an empty response");
            }
            try {
                return JSON.parse(responseBody);
            }
            catch {
                throw new FlutterFlowProjectApiError("FlutterFlow Project API returned invalid JSON");
            }
        }
        catch (error) {
            if (error instanceof FlutterFlowProjectApiError)
                throw error;
            if (error instanceof zod_1.z.ZodError) {
                throw new FlutterFlowProjectApiError("FlutterFlow Project API response contract changed");
            }
            if (error instanceof Error && error.name === "AbortError") {
                throw new FlutterFlowProjectApiError("FlutterFlow Project API request timed out");
            }
            throw new FlutterFlowProjectApiError("FlutterFlow Project API request failed");
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.FlutterFlowMCPServer = FlutterFlowMCPServer;

exports.flutterFlowTools = {
    "flutterflow.list-accounts": {
        description: "List configured FlutterFlow connections without exposing credentials",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
    },
    "flutterflow.list-projects": {
        description: "List only allowlisted FlutterFlow projects visible to one configured account",
        parameters: {
            type: "object",
            properties: {
                accountId: { type: "string", description: "Configured MCPMaster FlutterFlow account ID" },
            },
            required: ["accountId"],
            additionalProperties: false,
        },
    },
    "flutterflow.inspect-readiness": {
        description: "Inspect bounded FlutterFlow project structure and return a fail-closed deployment-readiness assessment",
        parameters: {
            type: "object",
            properties: {
                accountId: { type: "string", description: "Configured MCPMaster FlutterFlow account ID" },
                projectId: { type: "string", description: "Exact allowlisted FlutterFlow project ID" },
            },
            required: ["accountId", "projectId"],
            additionalProperties: false,
        },
    },
};

async function executeFlutterFlowTool(tool, args, configuration, fetchFn) {
    const server = new FlutterFlowMCPServer(configuration, fetchFn);
    switch (tool) {
        case "flutterflow.list-accounts":
            return server.listAccounts();
        case "flutterflow.list-projects": {
            const input = AccountArgsSchema.parse(args);
            return server.listProjects(input.accountId);
        }
        case "flutterflow.inspect-readiness": {
            const input = ReadinessArgsSchema.parse(args);
            return server.inspectReadiness(input.accountId, input.projectId);
        }
        default:
            throw new FlutterFlowProjectApiError(`Unknown FlutterFlow tool: ${tool}`, 404);
    }
}
