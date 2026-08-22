export async function authorizeBrokerRequest({
  planId,
  authorization,
  serviceRoleKey,
  publicConfig,
  authenticator,
  resolveOidcFn,
  hydrateFn,
  attachFn,
  fetchFn = fetch
}: {
  planId: string;
  authorization: string;
  serviceRoleKey: string | undefined;
  publicConfig: any;
  authenticator: any;
  resolveOidcFn: () => Promise<string | null>;
  hydrateFn: (oidcToken: string, params: { tool: string, args: any }) => Promise<{ contextHash: string; envelope: any } | null>;
  attachFn: (oidcToken: string, params: { planId: string, requestId: string, contextHash: string, contextEnvelope: any }) => Promise<any>;
  fetchFn?: typeof fetch;
}) {
  if (!serviceRoleKey) {
    throw new Error('Service role key is not configured');
  }

  // 1 & 2. Authenticate the user and resolve authenticated userId
  const identity = await authenticator.authenticate(authorization);

  // 3. Resolve exact durable plan by planId (using Service Role for private table access)
  const planRes = await fetchFn(`${publicConfig.supabaseUrl}/rest/v1/execution_plans?id=eq.${planId}&select=organization_id,request_id,tool,args`, {
    method: 'GET',
    headers: {
      'apikey': publicConfig.supabasePublishableKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Accept': 'application/json'
    }
  });

  if (!planRes.ok) {
    const error = new Error('Failed to retrieve plan');
    (error as any).status = 500;
    throw error;
  }

  const planRows = await planRes.json();
  if (!planRows || planRows.length !== 1) {
    const error = new Error('Plan not found');
    (error as any).status = 404;
    throw error;
  }

  const plan = planRows[0];
  const { organization_id, request_id, tool, args } = plan;

  // 4 & 5. Verify plan organization and active owner/admin membership using user's JWT
  const membershipRes = await fetchFn(`${publicConfig.supabaseUrl}/rest/v1/memberships?user_id=eq.${identity.userId}&organization_id=eq.${organization_id}&status=eq.active&select=role`, {
    method: 'GET',
    headers: {
      'apikey': publicConfig.supabasePublishableKey,
      'Authorization': authorization, // User's bearer token!
      'Accept': 'application/json'
    }
  });

  if (!membershipRes.ok) {
    const error = new Error('Failed to verify membership');
    (error as any).status = 500;
    throw error;
  }

  const membershipRows = await membershipRes.json();
  if (!membershipRows || membershipRows.length === 0) {
    const error = new Error('Forbidden: No active membership in plan organization');
    (error as any).status = 403;
    throw error;
  }

  const role = membershipRows[0].role;
  if (role !== 'owner' && role !== 'admin') {
    const error = new Error('Forbidden: Owner or admin role required');
    (error as any).status = 403;
    throw error;
  }

  // 6, 7, 8 & 9. Derive authoritative values from the plan and ignore caller-supplied values
  const authoritativeRequestId = request_id;
  const authoritativeTool = tool;
  const authoritativeArgs = args;

  // 10. Obtain Vercel workload OIDC
  const oidcToken = await resolveOidcFn();
  if (!oidcToken) {
    const error = new Error('Missing Vercel OIDC token');
    (error as any).status = 503;
    throw error;
  }

  // 11. Hydrate canonical Pandora Memory
  const hydrated = await hydrateFn(oidcToken, { tool: authoritativeTool, args: authoritativeArgs });
  if (!hydrated || !hydrated.contextHash) {
    const error = new Error('Memory hydration failed');
    (error as any).status = 500;
    throw error;
  }

  // 12. Attach exact context to exact plan/request/org
  await attachFn(oidcToken, {
    planId,
    requestId: authoritativeRequestId,
    contextHash: hydrated.contextHash,
    contextEnvelope: hydrated.envelope,
  });

  return { ok: true, contextHash: hydrated.contextHash };
}
