export type OwnerConnectionState =
  | "ready"
  | "problem"
  | "off"
  | "needs_permission"
  | "not_checked";

export interface OwnerConnectionSummary {
  id: string;
  name: string;
  plainPurpose: string;
  state: OwnerConnectionState;
  plainStatus: string;
  canRead: boolean;
  canChange: boolean;
  needsOwnerApprovalForChanges: boolean;
  lastCheckedAt: string | null;
  advanced?: Record<string, unknown> | null;
}

export interface OwnerProjectSummary {
  id: string;
  name: string;
  plainPurpose?: string;
  phase?: string;
  progressPercent?: number | null;
  progressVerified?: boolean;
  plainStatus?: string;
  whatIsStoppingUs?: string | null;
  whatIWillDoNext?: string | null;
}

export interface OwnerApprovalSummary {
  id: string;
  projectId?: string | null;
  whatWillHappen: string;
  whyINeedYou: string;
  whatCouldGoWrong?: string | null;
  howWeCanUndoIt?: string | null;
  extraIdentityCheckRequired: boolean;
}

export interface OwnerAskResult {
  reply: string;
  needsApproval: boolean;
  actionId?: string | null;
  approvalId?: string | null;
  status?: {
    whatChanged?: string | null;
    whereWeAre?: string | null;
    whatIsDone?: string | null;
    whatIsHappeningNow?: string | null;
    whatIsStoppingUs?: string | null;
    whatIWillDoNext?: string | null;
  } | null;
  advanced?: Record<string, unknown> | null;
}

export class PandoraOwnerApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 0, code = "OWNER_API_ERROR") {
    super(message);
    this.name = "PandoraOwnerApiError";
    this.status = status;
    this.code = code;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type AccessTokenProvider = () => Promise<string | null> | string | null;
type OrganizationIdProvider = () => Promise<string | null> | string | null;

export class PandoraOwnerApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly getOrganizationId?: OrganizationIdProvider;

  constructor(options: {
    baseUrl: string;
    getAccessToken: AccessTokenProvider;
    getOrganizationId?: OrganizationIdProvider;
    fetchImpl?: FetchLike;
  }) {
    const normalized = options.baseUrl.trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(normalized)) {
      throw new PandoraOwnerApiError(
        "Pandora connection must use HTTPS.",
        0,
        "HTTPS_REQUIRED",
      );
    }
    this.baseUrl = normalized;
    this.getAccessToken = options.getAccessToken;
    this.getOrganizationId = options.getOrganizationId;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  home<T = unknown>(): Promise<T> {
    return this.request<T>("/api/owner/home");
  }

  projects(): Promise<OwnerProjectSummary[]> {
    return this.request<OwnerProjectSummary[]>("/api/owner/projects");
  }

  project<T = unknown>(projectId: string): Promise<T> {
    return this.request<T>(
      `/api/owner/projects/${
        encodeURIComponent(requireValue(projectId, "projectId"))
      }`,
    );
  }

  connections(): Promise<OwnerConnectionSummary[]> {
    return this.request<OwnerConnectionSummary[]>("/api/owner/connections");
  }

  approvals(): Promise<OwnerApprovalSummary[]> {
    return this.request<OwnerApprovalSummary[]>("/api/owner/approvals");
  }

  activity<T = unknown>(): Promise<T> {
    return this.request<T>("/api/owner/activity");
  }

  safety<T = unknown>(): Promise<T> {
    return this.request<T>("/api/owner/safety");
  }

  ask(message: string, projectId?: string | null): Promise<OwnerAskResult> {
    const trimmed = requireValue(message, "message");
    return this.request<OwnerAskResult>("/api/owner/ask", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        message: trimmed,
        projectId: projectId?.trim() || undefined,
        clientMode: "simple",
      }),
    });
  }

  runAction<T = unknown>(actionId: string): Promise<T> {
    return this.request<T>(
      `/api/owner/actions/${
        encodeURIComponent(requireValue(actionId, "actionId"))
      }/run`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ clientMode: "simple" }),
      },
    );
  }

  decideApproval<T = unknown>(
    approvalId: string,
    decision: "approve" | "reject",
  ): Promise<T> {
    return this.request<T>(
      `/api/owner/approvals/${
        encodeURIComponent(requireValue(approvalId, "approvalId"))
      }/decide`,
      {
        method: "POST",
        body: JSON.stringify({ decision, clientMode: "simple" }),
      },
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new PandoraOwnerApiError(
        "Please sign in again.",
        401,
        "SIGN_IN_REQUIRED",
      );
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    const organizationId = (await this.getOrganizationId?.())?.trim();
    if (organizationId) headers.set("X-Organization-Id", organizationId);
    if (init.body) headers.set("Content-Type", "application/json");

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const plainMessage = typeof payload?.plainMessage === "string"
        ? payload.plainMessage
        : response.status === 401 || response.status === 403
        ? "You do not have permission for this yet."
        : response.status >= 500
        ? "Pandora cannot reach that service right now."
        : "Pandora could not complete that request.";
      const code = typeof payload?.code === "string"
        ? payload.code
        : "OWNER_API_REQUEST_FAILED";
      throw new PandoraOwnerApiError(plainMessage, response.status, code);
    }

    return payload as T;
  }
}

function requireValue(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new PandoraOwnerApiError(`${name} is required.`, 0, "INVALID_INPUT");
  }
  return trimmed;
}
