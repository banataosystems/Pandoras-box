const issuer = "https://token.actions.githubusercontent.com";
const audience = "pandora-flutterflow-project-api";
const expectedRepository = "banataosystems/Pandoras-box";
const expectedRepositoryId = "1326729533";
const expectedRepositoryOwner = "banataosystems";
const expectedRepositoryOwnerId = "314296438";
const expectedRef = "refs/heads/feature/flutterflow-pandora-mobile-v1";
const expectedRefType = "branch";
const expectedWorkflow = "FlutterFlow unattended project inspection";
const expectedRepositoryVisibility = "public";
const expectedWorkflowRef =
  "banataosystems/Pandoras-box/.github/workflows/flutterflow-unattended.yml@refs/heads/feature/flutterflow-pandora-mobile-v1";
const expectedProjectId = "pandoras-box-gj9hnb";
const jwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const tokenMaxBytes = 16 * 1024;
const clockToleranceSeconds = 5;
const tokenMaxAgeSeconds = 5 * 60;
const tokenMaxLifetimeSeconds = 10 * 60;
type GithubJwk = JsonWebKey & { kid?: string; use?: string; kty?: string };
let cachedJwks: { keys: GithubJwk[]; fetchedAt: number } | undefined;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'",
  "pragma": "no-cache",
};

function response(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: jsonHeaders,
  });
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing_${name}`);
  }
  return value;
}

function adminKey(): string {
  const modernKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modernKeys) {
    try {
      const key = JSON.parse(modernKeys)?.default;
      if (typeof key === "string" && key.length > 0) return key;
    } catch {
      throw new Error("secret_keys_invalid");
    }
  }
  return requiredString(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    "service_role_key",
  );
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("invalid_base64url");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function decodeJsonSegment(value: string): Record<string, unknown> {
  const decoded = new TextDecoder().decode(decodeBase64Url(value));
  const parsed = JSON.parse(decoded);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_jwt_json");
  }
  return parsed as Record<string, unknown>;
}

async function getJwks(forceRefresh = false): Promise<GithubJwk[]> {
  const now = Date.now();
  if (
    !forceRefresh && cachedJwks && now - cachedJwks.fetchedAt < 60 * 60 * 1000
  ) {
    return cachedJwks.keys;
  }
  const jwksResponse = await fetch(jwksUrl, {
    headers: { accept: "application/json" },
  });
  if (!jwksResponse.ok) throw new Error("jwks_unavailable");
  const body = await jwksResponse.json();
  if (!Array.isArray(body?.keys) || body.keys.length === 0) {
    throw new Error("jwks_invalid");
  }
  const keys = body.keys as GithubJwk[];
  cachedJwks = { keys, fetchedAt: now };
  return keys;
}

async function verifyGithubJwt(
  token: string,
): Promise<Record<string, unknown>> {
  if (new TextEncoder().encode(token).length > tokenMaxBytes) {
    throw new Error("jwt_too_large");
  }
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("jwt_shape_invalid");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonSegment(encodedHeader);
  if (
    header.alg !== "RS256" || header.typ !== "JWT" ||
    typeof header.kid !== "string" || header.kid.length === 0
  ) {
    throw new Error("jwt_header_invalid");
  }

  let keys = await getJwks();
  let key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    keys = await getJwks(true);
    key = keys.find((candidate) => candidate.kid === header.kid);
  }
  if (!key || key.kty !== "RSA" || key.use !== "sig") {
    throw new Error("jwt_key_invalid");
  }
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("jwt_signature_invalid");

  const claims = decodeJsonSegment(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = Number(claims.iat);
  const notBefore = Number(claims.nbf ?? issuedAt);
  const expiresAt = Number(claims.exp);
  if (
    claims.iss !== issuer || claims.aud !== audience ||
    !Number.isInteger(issuedAt) || !Number.isInteger(notBefore) ||
    !Number.isInteger(expiresAt) ||
    issuedAt > now + clockToleranceSeconds ||
    issuedAt < now - tokenMaxAgeSeconds - clockToleranceSeconds ||
    notBefore > now + clockToleranceSeconds ||
    expiresAt <= now - clockToleranceSeconds ||
    expiresAt - issuedAt > tokenMaxLifetimeSeconds + clockToleranceSeconds
  ) {
    throw new Error("jwt_claims_invalid");
  }
  return claims;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return response(405, "METHOD_NOT_ALLOWED", "POST is required.");
  }

  if (request.headers.has("origin")) {
    return response(
      403,
      "BROWSER_CALL_REJECTED",
      "Browser calls are not accepted.",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return response(
      401,
      "OIDC_REQUIRED",
      "A GitHub OIDC bearer token is required.",
    );
  }

  let requestedProjectId = "";
  try {
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).length > 128) {
      return response(413, "REQUEST_TOO_LARGE", "The request is too large.");
    }
    const body = JSON.parse(bodyText);
    requestedProjectId = requiredString(body?.project_id, "project_id");
  } catch {
    return response(400, "INVALID_REQUEST", "A valid project_id is required.");
  }
  if (requestedProjectId !== expectedProjectId) {
    return response(
      403,
      "PROJECT_NOT_ALLOWED",
      "The requested project is not allowed.",
    );
  }

  let claims: Record<string, unknown>;
  try {
    claims = await verifyGithubJwt(authorization.slice(7));
  } catch {
    return response(401, "OIDC_INVALID", "The GitHub OIDC token is invalid.");
  }

  try {
    const repository = requiredString(claims.repository, "repository");
    const repositoryId = requiredString(claims.repository_id, "repository_id");
    const repositoryOwner = requiredString(
      claims.repository_owner,
      "repository_owner",
    );
    const repositoryOwnerId = requiredString(
      claims.repository_owner_id,
      "repository_owner_id",
    );
    const workflowRef = requiredString(claims.workflow_ref, "workflow_ref");
    const workflowSha = requiredString(claims.workflow_sha, "workflow_sha");
    const workflow = requiredString(claims.workflow, "workflow");
    const ref = requiredString(claims.ref, "ref");
    const refType = requiredString(claims.ref_type, "ref_type");
    const commitSha = requiredString(claims.sha, "sha");
    const eventName = requiredString(claims.event_name, "event_name");
    const actorId = requiredString(claims.actor_id, "actor_id");
    const repositoryVisibility = requiredString(
      claims.repository_visibility,
      "repository_visibility",
    );
    requiredString(claims.sub, "sub");
    const runnerEnvironment = requiredString(
      claims.runner_environment,
      "runner_environment",
    );
    const jti = requiredString(claims.jti, "jti");
    const runId = requiredString(claims.run_id, "run_id");
    const runAttempt = Number(
      requiredString(claims.run_attempt, "run_attempt"),
    );

    if (
      repository !== expectedRepository ||
      repositoryId !== expectedRepositoryId ||
      repositoryOwner !== expectedRepositoryOwner ||
      repositoryOwnerId !== expectedRepositoryOwnerId ||
      workflowRef !== expectedWorkflowRef ||
      workflow !== expectedWorkflow ||
      ref !== expectedRef ||
      refType !== expectedRefType ||
      workflowSha !== commitSha ||
      eventName !== "push" ||
      repositoryVisibility !== expectedRepositoryVisibility ||
      runnerEnvironment !== "github-hosted" ||
      !/^[0-9a-f]{40}$/.test(commitSha) ||
      !/^[1-9][0-9]*$/.test(runId) ||
      !/^[1-9][0-9]*$/.test(actorId) ||
      !Number.isInteger(runAttempt) ||
      runAttempt < 1
    ) {
      return response(
        403,
        "WORKLOAD_NOT_ALLOWED",
        "This workload is not allowed.",
      );
    }

    const supabaseUrl = requiredString(
      Deno.env.get("SUPABASE_URL"),
      "supabase_url",
    );
    const serviceRoleKey = adminKey();
    const grantResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/consume_flutterflow_github_oidc_grant`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_repository: repository,
          p_repository_id: repositoryId,
          p_repository_owner_id: repositoryOwnerId,
          p_workflow_ref: workflowRef,
          p_ref: ref,
          p_sha: commitSha,
          p_audience: audience,
          p_actor_id: actorId,
          p_jti_sha256: await sha256(jti),
          p_run_id: runId,
          p_run_attempt: runAttempt,
        }),
      },
    );

    if (!grantResponse.ok) {
      return response(
        503,
        "GRANT_CHECK_FAILED",
        "The one-time grant could not be checked.",
      );
    }
    const rows = await grantResponse.json();
    const grant = Array.isArray(rows) ? rows[0] : undefined;
    if (!grant?.token || grant.project_id !== expectedProjectId) {
      console.info(
        "flutterflow_oidc_grant_miss",
        JSON.stringify({
          repository,
          ref,
          sha: commitSha,
          workflow_ref: workflowRef,
          actor_id: actorId,
          run_id: runId,
          run_attempt: runAttempt,
        }),
      );
      return response(
        403,
        "GRANT_NOT_AVAILABLE",
        "No matching one-time grant is available.",
      );
    }

    return new Response(
      JSON.stringify({
        token: grant.token,
        project_id: grant.project_id,
        project_name: grant.project_name,
        verified_at: grant.verified_at,
        grant_id: grant.grant_id,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch {
    return response(
      403,
      "CLAIMS_INVALID",
      "Required workload claims are missing.",
    );
  }
});
