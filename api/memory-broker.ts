import { SupabaseBearerAuthenticator } from '../apps/meta-business-mcp/src/auth/supabase-bearer.js';
import { loadOperatorPublicConfig } from '../src/operator-public-config.js';
import { resolveVercelWorkloadToken } from '../src/runtime/vercel-workload-identity.js';
import { PandoraPlanMemoryContextProvider } from '../src/runtime/plan-memory-context.js';
import { PlanContextLedgerClient } from '../src/runtime/plan-context-ledger-client.js';
import { authorizeBrokerRequest } from '../src/projectos/broker-authorization.js';

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

  const authorization = request.headers['authorization'];
  if (!authorization) {
    return response.status(401).json({ error: 'Missing authorization' });
  }

  const publicConfig = loadOperatorPublicConfig(process.env as any);
  const authenticator = new SupabaseBearerAuthenticator({
    supabaseUrl: publicConfig.supabaseUrl,
    publishableKey: publicConfig.supabasePublishableKey,
  });

  const provider = new PandoraPlanMemoryContextProvider();
  const ledger = new PlanContextLedgerClient();

  try {
    const result = await authorizeBrokerRequest({
      planId,
      authorization,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      publicConfig,
      authenticator,
      resolveOidcFn: resolveVercelWorkloadToken,
      hydrateFn: (token, params) => provider.hydrate(token, params),
      attachFn: (token, params) => ledger.attach(token, params)
    });

    return response.status(200).json(result);
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Memory Broker Error:', err);
    return response.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}
