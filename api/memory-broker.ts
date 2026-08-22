import { SupabaseBearerAuthenticator } from '../apps/meta-business-mcp/src/auth/supabase-bearer.js';
import { loadOperatorPublicConfig } from '../src/operator-public-config.js';
import { resolveVercelWorkloadToken } from '../src/runtime/vercel-workload-identity.js';
import { PandoraPlanMemoryContextProvider } from '../src/runtime/plan-memory-context.js';
import { PlanContextLedgerClient } from '../src/runtime/plan-context-ledger-client.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default async function memoryBroker(request: any, response: any) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }
  
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const bodyText = Buffer.concat(chunks).toString('utf8');
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (err) {
    return response.status(400).json({ error: 'Invalid JSON' });
  }

  const { planId } = body;
  if (!planId || typeof planId !== 'string') {
    return response.status(400).json({ error: 'Missing planId' });
  }

  const publicConfig = loadOperatorPublicConfig(process.env as any);
  const authenticator = new SupabaseBearerAuthenticator({
    supabaseUrl: publicConfig.supabaseUrl,
    publishableKey: publicConfig.supabasePublishableKey,
  });

  const authorization = request.headers['authorization'];
  if (!authorization) {
    return response.status(401).json({ error: 'Missing authorization' });
  }

  let identity;
  try {
    // 1 & 2. Authenticate the user and resolve authenticated userId
    identity = await authenticator.authenticate(authorization);
  } catch (err) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 3. Resolve exact durable plan by planId (using Service Role for private table access)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      throw new Error('Service role key is not configured');
    }

    // Fetch the execution plan using service role
    const planRes = await fetch(`${publicConfig.supabaseUrl}/rest/v1/execution_plans?id=eq.${planId}&select=organization_id,request_id,tool,args`, {
      method: 'GET',
      headers: {
        'apikey': publicConfig.supabasePublishableKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Accept': 'application/json'
      }
    });

    if (!planRes.ok) {
      return response.status(500).json({ error: 'Failed to retrieve plan' });
    }

    const planRows = await planRes.json();
    if (!planRows || planRows.length !== 1) {
      return response.status(404).json({ error: 'Plan not found' });
    }

    const plan = planRows[0];
    const { organization_id, request_id, tool, args } = plan;

    // 4 & 5. Verify plan organization and active owner/admin membership using user's JWT
    // The user's JWT respects RLS on the memberships table!
    const membershipRes = await fetch(`${publicConfig.supabaseUrl}/rest/v1/memberships?user_id=eq.${identity.userId}&organization_id=eq.${organization_id}&status=eq.active&select=role`, {
      method: 'GET',
      headers: {
        'apikey': publicConfig.supabasePublishableKey,
        'Authorization': authorization, // User's bearer token!
        'Accept': 'application/json'
      }
    });

    if (!membershipRes.ok) {
      return response.status(500).json({ error: 'Failed to verify membership' });
    }

    const membershipRows = await membershipRes.json();
    if (!membershipRows || membershipRows.length === 0) {
      return response.status(403).json({ error: 'Forbidden: No active membership in plan organization' });
    }

    const role = membershipRows[0].role;
    if (role !== 'owner' && role !== 'admin') {
      return response.status(403).json({ error: 'Forbidden: Owner or admin role required' });
    }

    // 6, 7, 8 & 9. Derive authoritative values from the plan and ignore caller-supplied values
    const authoritativeRequestId = request_id;
    const authoritativeTool = tool;
    const authoritativeArgs = args;

    // 10. Obtain Vercel workload OIDC
    const oidcToken = await resolveVercelWorkloadToken();
    if (!oidcToken) {
      return response.status(503).json({ error: 'Missing Vercel OIDC token' });
    }

    // 11. Hydrate canonical Pandora Memory
    const provider = new PandoraPlanMemoryContextProvider();
    const hydrated = await provider.hydrate(oidcToken, { tool: authoritativeTool, args: authoritativeArgs });

    if (!hydrated || !hydrated.contextHash) {
      return response.status(500).json({ error: 'Memory hydration failed' });
    }

    // 12. Attach exact context to exact plan/request/org
    const ledger = new PlanContextLedgerClient();
    await ledger.attach(oidcToken, {
      planId: planId,
      requestId: authoritativeRequestId,
      contextHash: hydrated.contextHash,
      contextEnvelope: hydrated.envelope,
    });

    // 13 & 14. Read back attached context implicitly (attach throws if mismatch)
    // Return bounded result
    return response.status(200).json({ ok: true, contextHash: hydrated.contextHash });
  } catch (err: any) {
    console.error('Memory Broker Error:', err);
    return response.status(500).json({ error: err.message || 'Internal server error' });
  }
}
