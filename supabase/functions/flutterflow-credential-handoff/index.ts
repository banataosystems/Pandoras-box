import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const FF_LIST_PROJECTS = "https://api.flutterflow.io/v2/l/listProjects";
const MAX_BODY = 16 * 1024;

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "pragma": "no-cache",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#090909;color:#fff;margin:0;padding:24px}main{max-width:560px;margin:48px auto;background:#141414;border:1px solid #2a2a2a;border-radius:20px;padding:22px}h1{font-size:24px;margin:0 0 10px}p{color:#bbb;line-height:1.45}label{display:block;margin:20px 0 8px;font-weight:700}input{box-sizing:border-box;width:100%;font-size:16px;padding:14px;border-radius:12px;border:1px solid #3a3a3a;background:#0b0b0b;color:#fff}button{width:100%;margin-top:16px;padding:14px;border:0;border-radius:12px;background:#e3262e;color:white;font-size:17px;font-weight:800}.note{font-size:13px;color:#8f8f8f}.ok{color:#77df8a}.bad{color:#ff8f8f}</style></head><body><main>${body}</main></body></html>`, { status, headers });
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeName(s: unknown) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const code = (url.searchParams.get("code") || "").trim();
    if (code.length < 32) return page("Invalid link", `<h1 class="bad">Invalid or incomplete link</h1><p>Return to ChatGPT and request a new secure FlutterFlow handoff.</p>`, 400);
    return page("Connect FlutterFlow", `<h1>Connect FlutterFlow securely</h1><p>Paste your FlutterFlow API token below. It is sent directly to this protected server, validated against FlutterFlow, and stored in Supabase Vault only if the existing <strong>Pandoras Box</strong> project is found.</p><form method="post"><input type="hidden" name="code" value="${code.replace(/[^A-Za-z0-9_-]/g, "")}"><label for="token">FlutterFlow API token</label><input id="token" name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required minlength="20"><button type="submit">Verify and connect</button></form><p class="note">The token is never returned to ChatGPT, GitHub, Pandora Memory, analytics, or application logs.</p>`);
  }

  if (req.method !== "POST") return page("Method not allowed", `<h1 class="bad">Method not allowed</h1>`, 405);
  const length = Number(req.headers.get("content-length") || "0");
  if (length > MAX_BODY) return page("Too large", `<h1 class="bad">Request too large</h1>`, 413);

  let form: FormData;
  try { form = await req.formData(); } catch { return page("Invalid request", `<h1 class="bad">Invalid request</h1>`, 400); }
  const code = String(form.get("code") || "").trim();
  const token = String(form.get("token") || "").trim();
  if (code.length < 32 || token.length < 20) return page("Invalid input", `<h1 class="bad">Invalid input</h1><p>No credential was stored.</p>`, 400);

  const codeSha = await sha256Hex(code);
  let ffResp: Response;
  try {
    ffResp = await fetch(FF_LIST_PROJECTS, {
      method: "POST",
      headers: { "authorization": `Bearer ${token}`, "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({ project_type: "ALL", deserialize_response: true }),
      cache: "no-store",
    });
  } catch {
    return page("FlutterFlow unavailable", `<h1 class="bad">FlutterFlow could not be reached</h1><p>No credential was stored. Try again later.</p>`, 502);
  }

  const payload = await ffResp.json().catch(() => null);
  if (!ffResp.ok || !payload?.success) return page("Token not accepted", `<h1 class="bad">FlutterFlow did not accept this token</h1><p>No credential was stored. Create a current API token in your FlutterFlow account and try again.</p>`, 401);

  const entries = Array.isArray(payload?.value?.entries) ? payload.value.entries : [];
  const match = entries.find((entry: any) => {
    const n = normalizeName(entry?.project?.name);
    return n === "pandorasbox" || n === "pandorabox";
  });
  if (!match?.id) {
    return page("Project not found", `<h1 class="bad">Token is valid, but Pandoras Box was not found</h1><p>No credential was stored. Make sure this token belongs to the FlutterFlow account that owns or can edit the existing Pandora project.</p>`, 409);
  }

  const { data, error } = await admin.rpc("consume_flutterflow_credential_handoff", {
    p_code_sha256: codeSha,
    p_token: token,
    p_project_id: String(match.id),
    p_project_name: String(match?.project?.name || "Pandoras Box"),
  });
  if (error || data !== true) return page("Link expired", `<h1 class="bad">This secure link is expired or already used</h1><p>No new credential was stored. Return to ChatGPT for a fresh link.</p>`, 410);

  return page("Connected", `<h1 class="ok">FlutterFlow connected securely</h1><p>The existing <strong>${String(match?.project?.name || "Pandoras Box").replace(/[<>]/g, "")}</strong> project was verified. The token is stored privately in Supabase Vault. You can return to ChatGPT and say <strong>Go</strong>.</p><p class="note">No token value is displayed or returned.</p>`);
});
