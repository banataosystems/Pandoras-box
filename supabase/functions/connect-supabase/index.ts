import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OAUTH_CLIENT_ID = "d836261c-ffa5-409b-b614-927a40e30fad";
const OAUTH_REDIRECT_URI =
  "https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/connect-supabase/oauth2/callback";
const OAUTH_TOKEN_URI = "https://api.supabase.com/v1/oauth/token";
const MANAGEMENT_ORIGIN = "https://api.supabase.com";

type JsonRecord = Record<string, unknown>;

function html(message: string, ok: boolean): Response {
  const safe = message.replace(/[<>&'\"]/g, (char) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&#39;", '\"': "&quot;",
  }[char]!));
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Connect Supabase to Pandora</title><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:32px;background:#101211;color:#f5f7f5}main{max-width:560px;margin:12vh auto;padding:28px;border:1px solid #2b312e;border-radius:24px;background:#171a18}h1{font-size:24px;margin:0 0 12px}p{line-height:1.55;color:#cbd3ce}.status{font-weight:700;color:${ok ? "#58d68d" : "#ffb86b"}}</style></head><body><main><div class="status">${ok ? "Connected" : "Connection not completed"}</div><h1>${ok ? "Supabase is connected to Pandora" : "Pandora could not finish connecting Supabase"}</h1><p>${safe}</p><p>You can close this page and return to Pandora. The Connections screen refreshes when the app resumes.</p></main></body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0", pragma: "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } },
  );
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
async function providerJson(path: string, accessToken: string): Promise<unknown> {
  const response = await fetch(`${MANAGEMENT_ORIGIN}${path}`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, redirect: "error" });
  if (!response.ok) throw new Error("provider_discovery_failed");
  return await response.json();
}

Deno.serve(async (request: Request) => {
  if (request.method !== "GET") return new Response("method_not_allowed", { status: 405 });
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/oauth2/callback")) return new Response("not_found", { status: 404 });
  const code = text(url.searchParams.get("code"));
  const state = text(url.searchParams.get("state"));
  const providerError = text(url.searchParams.get("error"));
  if (providerError) return html("Supabase did not grant access. No credentials were stored.", false);
  if (!code || !state || code.length > 4096 || state.length > 512) return html("The OAuth response was incomplete or invalid.", false);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: sessionValue, error: sessionError } = await admin.rpc("claim_supabase_oauth_session", { p_state: state });
    if (sessionError) throw new Error("oauth_session_invalid");
    const session = asRecord(sessionValue);
    const sessionId = text(session.sessionId);
    const verifier = text(session.codeVerifier);
    if (!sessionId || !verifier) throw new Error("oauth_session_invalid");

    const { data: secretValue, error: secretError } = await admin.rpc("get_supabase_oauth_client_secret");
    if (secretError || !text(secretValue)) throw new Error("oauth_client_not_configured");
    const clientSecret = text(secretValue);

    const tokenResponse = await fetch(OAUTH_TOKEN_URI, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: `Basic ${btoa(`${OAUTH_CLIENT_ID}:${clientSecret}`)}` },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: OAUTH_REDIRECT_URI, code_verifier: verifier }),
      redirect: "error",
    });
    if (!tokenResponse.ok) throw new Error("oauth_token_exchange_failed");
    const tokenPayload = asRecord(await tokenResponse.json());
    const accessToken = text(tokenPayload.access_token);
    const refreshToken = text(tokenPayload.refresh_token);
    const expiresIn = positiveInt(tokenPayload.expires_in, 3600);
    if (!accessToken || !refreshToken) throw new Error("oauth_token_exchange_failed");

    const [organizationsValue, projectsValue] = await Promise.all([
      providerJson("/v1/organizations", accessToken), providerJson("/v1/projects", accessToken),
    ]);
    const organizations = Array.isArray(organizationsValue) ? organizationsValue.map(asRecord) : [];
    const projects = Array.isArray(projectsValue) ? projectsValue.map(asRecord) : [];
    if (organizations.length < 1) throw new Error("oauth_no_organization");
    const organizationSlugs = organizations.map((item) => text(item.slug)).filter(Boolean);
    const projectRefs = projects.map((item) => text(item.ref)).filter(Boolean);
    const primaryOrganization = organizations[0];
    const primarySlug = text(primaryOrganization.slug);
    const primaryName = text(primaryOrganization.name) || primarySlug;
    if (!primarySlug) throw new Error("oauth_no_organization");
    const discoveredProjects = projects.map((item) => ({ ref: text(item.ref), name: text(item.name), organizationId: text(item.organization_id), region: text(item.region), status: text(item.status) }));

    const { error: completionError } = await admin.rpc("complete_supabase_oauth_installation", {
      p_session_id: sessionId,
      p_external_account_id: `oauth:${primarySlug}`,
      p_display_name: `Supabase — ${primaryName}`,
      p_access_token: accessToken,
      p_refresh_token: refreshToken,
      p_expires_in: expiresIn,
      p_organization_slugs: organizationSlugs,
      p_project_refs: projectRefs,
      p_discovered_projects: discoveredProjects,
    });
    if (completionError) throw new Error("oauth_installation_failed");
    return html(`Pandora can now discover the Supabase organization "${primaryName}" and the projects authorized by this OAuth app. Protected changes remain governed.`, true);
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : "oauth_failed";
    console.error(JSON.stringify({ event: "supabase_oauth_callback_failed", code: codeValue }));
    return html("Pandora did not store a usable Supabase connection. Existing provider access was left unchanged.", false);
  }
});
