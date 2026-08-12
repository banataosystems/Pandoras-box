import express from 'express';
import { createHttpApp } from '../src/http-app.js';
import { loadOperatorPublicConfig } from '../src/operator-public-config.js';
import { SupabaseBearerAuthenticator } from '../apps/meta-business-mcp/src/auth/supabase-bearer.js';
import { SupabaseOrganizationMembershipResolver } from '../apps/meta-business-mcp/src/auth/membership.js';
import { createOperatorApiApp } from '../apps/meta-business-mcp/src/operator/api.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };

let app: ReturnType<typeof express> | undefined;

function runtime() {
  if (app) return app;
  const publicConfig = loadOperatorPublicConfig(process.env);
  const authenticator = new SupabaseBearerAuthenticator({
    supabaseUrl: publicConfig.supabaseUrl,
    publishableKey: publicConfig.supabasePublishableKey,
  });
  const membershipResolver = new SupabaseOrganizationMembershipResolver({
    supabaseUrl: publicConfig.supabaseUrl,
    publishableKey: publicConfig.supabasePublishableKey,
  });
  app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));
  app.use(createOperatorApiApp({
    ...publicConfig,
    authenticator,
    membershipResolver,
    runtimeFactory: (embeddedConfig: unknown) => createHttpApp(embeddedConfig as any),
  }));
  return app;
}

export default function operator(request: any, response: any) {
  request.url = String(request.url || '/').replace(/^\/api\/operator(?=\/|\?|$)/, '') || '/';
  return runtime()(request, response);
}
