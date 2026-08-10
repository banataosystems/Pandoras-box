import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const FF_LIST_PROJECTS = "https://api.flutterflow.io/v2/l/listProjects";
const MAX_BODY = 16 * 1024;

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function normalizeName(s: unknown) { return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function safeLabel(s: unknown) { return String(s ?? "").replace(/[\r\n\t]/g, " ").slice(0, 120); }

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return text("Use the secure FlutterFlow connection form from ChatGPT.", 405);
  const length = Number(req.headers.get("content-length") || "0");
  if (length > MAX_BODY) return text("REQUEST_TOO_LARGE", 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return text("INVALID_REQUEST", 400); }
  const code = String(form.get("code") || "").trim();
  const token = String(form.get("token") || "").trim();
  if (code.length < 32 || token.length < 20) return text("INVALID_INPUT — No credential was stored.", 400);

  const codeSha = await sha256Hex(code);
  let ffResp: Response;
  try {
    ffResp = await fetch(FF_LIST_PROJECTS, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ project_type: "ALL", deserialize_response: true }),
      cache: "no-store",
    });
  } catch {
    return text("FLUTTERFLOW_UNAVAILABLE — No credential was stored. Try again later.", 502);
  }

  const payload = await ffResp.json().catch(() => null);
  if (!ffResp.ok || !payload?.success) return text("TOKEN_NOT_ACCEPTED — No credential was stored.", 401);

  const entries = Array.isArray(payload?.value?.entries) ? payload.value.entries : [];
  const candidates = entries.filter((entry: any) => {
    const n = normalizeName(entry?.project?.name);
    return n.includes("pandora") && n.includes("box");
  });

  if (candidates.length !== 1) {
    const names = entries.map((entry: any) => safeLabel(entry?.project?.name)).filter(Boolean).slice(0, 20);
    if (candidates.length > 1) {
      return text(`TOKEN_VALID_BUT_MULTIPLE_PANDORA_PROJECTS — No credential was stored. Candidates: ${candidates.map((e:any)=>safeLabel(e?.project?.name)).join(" | ")}`, 409);
    }
    return text(`TOKEN_VALID_BUT_PANDORA_PROJECT_NOT_FOUND — No credential was stored. Projects visible to this token: ${names.length ? names.join(" | ") : "(none returned)"}`, 409);
  }

  const match = candidates[0];
  if (!match?.id) return text("TOKEN_VALID_BUT_PROJECT_ID_MISSING — No credential was stored.", 409);

  const { data, error } = await admin.rpc("consume_flutterflow_credential_handoff", {
    p_code_sha256: codeSha,
    p_token: token,
    p_project_id: String(match.id),
    p_project_name: String(match?.project?.name || "Pandoras Box"),
  });
  if (error || data !== true) return text("HANDOFF_EXPIRED_OR_USED — No new credential was stored. Return to ChatGPT for a fresh link.", 410);

  return text(`CONNECTED — ${safeLabel(match?.project?.name || "Pandoras Box")} verified. Token stored privately in Supabase Vault. Return to ChatGPT and say Go.`);
});
