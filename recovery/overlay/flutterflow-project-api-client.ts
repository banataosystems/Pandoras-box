export type FlutterFlowFetch = typeof fetch;

export type FlutterFlowClientOptions = {
  getToken: () => Promise<string> | string;
  fetchImpl?: FlutterFlowFetch;
  baseUrl?: string;
};

export type FlutterFlowApproval = {
  approvalGranted: boolean;
  approvalRef?: string;
};

export class FlutterFlowProjectApiClient {
  private readonly getToken: FlutterFlowClientOptions['getToken'];
  private readonly fetchImpl: FlutterFlowFetch;
  private readonly baseUrl: string;

  constructor(options: FlutterFlowClientOptions) {
    this.getToken = options.getToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = (options.baseUrl ?? 'https://api.flutterflow.io/v2').replace(/\/$/, '');
  }

  private async request(path: string, init: RequestInit = {}) {
    const token = String(await this.getToken()).trim();
    if (!token) throw new Error('flutterflow_api_token_unavailable');

    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    headers.set('accept', 'application/json');
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = payload && typeof payload === 'object' && 'reason' in payload
        ? String((payload as { reason?: unknown }).reason ?? '')
        : '';
      throw new Error(`flutterflow_http_${response.status}${reason ? `:${reason}` : ''}`);
    }
    if (!payload || typeof payload !== 'object') throw new Error('flutterflow_invalid_response');
    return payload as Record<string, unknown>;
  }

  async listProjects() {
    return this.request('/l/listProjects', {
      method: 'POST',
      body: JSON.stringify({ project_type: 'ALL', deserialize_response: true }),
    });
  }

  async listPartitionedFileNames(projectId: string) {
    const id = projectId.trim();
    if (!id) throw new Error('flutterflow_project_id_required');
    return this.request(`/listPartitionedFileNames?projectId=${encodeURIComponent(id)}`);
  }

  async readProjectYaml(projectId: string, fileName?: string) {
    const id = projectId.trim();
    if (!id) throw new Error('flutterflow_project_id_required');
    const suffix = fileName?.trim() ? `&fileName=${encodeURIComponent(fileName.trim())}` : '';
    return this.request(`/projectYamls?projectId=${encodeURIComponent(id)}${suffix}`);
  }

  async validateProjectYaml(projectId: string, fileKey: string, fileContent: string) {
    const id = projectId.trim();
    const key = fileKey.trim();
    if (!id) throw new Error('flutterflow_project_id_required');
    if (!key) throw new Error('flutterflow_file_key_required');
    return this.request('/validateProjectYaml', {
      method: 'POST',
      body: JSON.stringify({ projectId: id, fileKey: key, fileContent }),
    });
  }

  async updateProjectByYaml(
    projectId: string,
    fileKeyToContent: Record<string, string>,
    approval: FlutterFlowApproval,
  ) {
    const id = projectId.trim();
    if (!id) throw new Error('flutterflow_project_id_required');
    if (!approval?.approvalGranted) throw new Error('flutterflow_write_approval_required');

    const entries = Object.entries(fileKeyToContent);
    if (!entries.length) throw new Error('flutterflow_update_empty');

    for (const [fileKey, fileContent] of entries) {
      if (!fileKey.trim()) throw new Error('flutterflow_file_key_required');
      const validation = await this.validateProjectYaml(id, fileKey, fileContent);
      const success = validation.success === true ||
        (validation.value !== undefined && validation.reason == null && !('validationErrors' in validation));
      if (!success || 'validationErrors' in validation) {
        throw new Error(`flutterflow_validation_failed:${fileKey}`);
      }
    }

    return this.request('/updateProjectByYaml', {
      method: 'POST',
      body: JSON.stringify({ projectId: id, fileKeyToContent }),
      headers: approval.approvalRef ? { 'x-pandora-approval-ref': approval.approvalRef } : undefined,
    });
  }
}
