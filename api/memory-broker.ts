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

  const publicConfig = loadOperatorPublicConfig(process.env as any);
  const authenticator = new SupabaseBearerAuthenticator({
    supabaseUrl: publicConfig.supabaseUrl,
    publishableKey: publicConfig.supabasePublishableKey,
  });

  const authorization = request.headers['authorization'];
  if (!authorization) {
    return response.status(401).json({ error: 'Missing authorization' });
  }

  try {
    // Authenticate the user (throws if invalid)
    await authenticator.authenticate(authorization);
  } catch (err) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { planId, requestId, tool, args } = body;
    if (!planId || !tool) {
      return response.status(400).json({ error: 'Missing planId or tool' });
    }

    const oidcToken = await resolveVercelWorkloadToken();
    if (!oidcToken) {
      return response.status(503).json({ error: 'Missing Vercel OIDC token' });
    }

    const provider = new PandoraPlanMemoryContextProvider();
    const hydrated = await provider.hydrate(oidcToken, { tool, args });

    if (!hydrated || !hydrated.contextHash) {
      return response.status(500).json({ error: 'Memory hydration failed' });
    }

    const ledger = new PlanContextLedgerClient();
    await ledger.attach(oidcToken, {
      planId,
      requestId: requestId || planId,
      contextHash: hydrated.contextHash,
      contextEnvelope: hydrated.envelope,
    });

    return response.status(200).json({ ok: true, contextHash: hydrated.contextHash });
  } catch (err: any) {
    console.error('Memory Broker Error:', err);
    return response.status(500).json({ error: err.message || 'Internal server error' });
  }
}
