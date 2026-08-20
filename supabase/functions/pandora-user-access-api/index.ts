import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PERMISSIONS = [
  "projects.view", "projects.edit", "approvals.view", "approvals.decide",
  "activity.view", "intelligence.view", "autopilot.view", "autopilot.run",
  "release_center.view", "release.production", "connections.view",
  "connections.manage", "safety.view", "memory.view", "diagnostics.view",
  "users.manage",
] as const;
const MEMBER_ROLES = ["owner", "admin", "operator", "member", "viewer"] as const;
const MEMBER_STATUSES = ["invited", "active", "suspended", "revoked"] as const;
const ACCESS_MODES = ["role", "custom"] as const;
const PROJECT_SCOPES = ["all", "selected", "none"] as const;

type JsonRecord = Record<string, unknown>;
type AdminClient = ReturnType<typeof createClient>;
type UserContext = {
  userId: string;
  email: string;
  organizationId: string;
  role: string;
  admin: AdminClient;
};
type AccessConfig = {
  role: string;
  status: string;
  accessMode: string;
  projectScope: string;
  permissions: string[];
  projectIds: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}
function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function routePath(pathname: string) {
  const marker = "/pandora-user-access-api";
  const index = pathname.indexOf(marker);
  const route = index >= 0 ? pathname.slice(index + marker.length) : pathname;
  if (!route || route === "/") return "/";
  return route.startsWith("/") ? route.replace(/\/+$/, "") || "/" : `/${route}`;
}
function allowedOrigins() {
  return new Set(
    (Deno.env.get("PANDORA_ALLOWED_ORIGINS") || "")
      .split(",").map((value) => value.trim()).filter(Boolean),
  );
}
function corsOrigin(origin: string | null) {
  if (!origin) return null;
  return allowedOrigins().has(origin) ? origin : null;
}
const CORS_HEADERS = {
  "access-control-allow-headers":
    "authorization, apikey, content-type, idempotency-key, x-client-info, x-organization-id",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-max-age": "86400",
  "vary": "Origin",
};
function response(body: unknown, status = 200, requestId?: string, origin?: string | null) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...(origin ? { "access-control-allow-origin": origin } : {}),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });
}
function fail(status: number, code: string, message: string, requestId: string, origin?: string | null) {
  return response({ code, plainMessage: message, requestId }, status, requestId, origin);
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function bodyJson(req: Request) {
  const length = Number(req.headers.get("content-length") || "0");
  if (length > 32 * 1024) throw new Error("BODY_TOO_LARGE");
  let value: unknown;
  try { value = await req.json(); } catch { throw new Error("INVALID_JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_JSON");
  return value as JsonRecord;
}
function validateEnum(value: unknown, values: readonly string[], code: string) {
  const result = text(value);
  if (!values.includes(result)) throw new Error(code);
  return result;
}
function stringArray(value: unknown, code: string) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 200) throw new Error(code);
  const result = value.map((item) => text(item)).filter(Boolean);
  if (result.some((item) => item.length > 200)) throw new Error(code);
  return [...new Set(result)];
}
function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validProjectIdentifier(value: string) {
  return validUuid(value) || /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value);
}
function validEmail(value: unknown) {
  const email = text(value).toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}
function rolePermissions(role: string) {
  const all = [...PERMISSIONS];
  if (role === "owner") return all;
  if (role === "admin") return all.filter((key) => key !== "release.production");
  if (role === "operator") return [
    "projects.view", "projects.edit", "approvals.view", "activity.view",
    "intelligence.view", "autopilot.view", "autopilot.run", "release_center.view",
    "connections.view", "safety.view", "memory.view",
  ];
  if (role === "member") return [
    "projects.view", "projects.edit", "activity.view", "intelligence.view", "memory.view",
  ];
  if (role === "viewer") return ["projects.view", "activity.view", "intelligence.view"];
  return [];
}

async function authenticate(req: Request): Promise<UserContext> {
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new Error("SIGN_IN_REQUIRED");
  const token = authorization.replace(/^Bearer\s+/i, "");
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user || authData.user.is_anonymous === true) {
    throw new Error("SIGN_IN_REQUIRED");
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requestedOrganization = req.headers.get("x-organization-id")?.trim() || null;
  let membershipQuery = admin.from("memberships")
    .select("organization_id, user_id, role, status")
    .eq("user_id", authData.user.id).eq("status", "active").limit(3);
  if (requestedOrganization) membershipQuery = membershipQuery.eq("organization_id", requestedOrganization);
  const { data: memberships, error } = await membershipQuery;
  if (error || !memberships?.length) throw new Error("ORGANIZATION_ACCESS_REQUIRED");
  if (!requestedOrganization && memberships.length > 1) throw new Error("ORGANIZATION_SELECTION_REQUIRED");
  const membership = memberships[0];
  return {
    userId: authData.user.id,
    email: authData.user.email || "",
    organizationId: String(membership.organization_id),
    role: String(membership.role),
    admin,
  };
}
async function enforceRateLimit(context: UserContext, method: string) {
  const limit = method === "GET" ? 60 : 15;
  const key = await sha256Hex(`${context.userId}:${method}:pandora-user-access-api`);
  const { data, error } = await context.admin.rpc("consume_runtime_rate_limit", {
    p_organization_id: context.organizationId,
    p_key_hash: key,
    p_limit: limit,
    p_window_seconds: 60,
  });
  if (error) throw new Error("RATE_LIMIT_UNAVAILABLE");
  if (asRecord(data).allowed !== true) throw new Error("RATE_LIMITED");
}
async function actorCanManageUsers(context: UserContext) {
  if (context.role === "owner") return true;
  const { data: profile, error: profileError } = await context.admin
    .from("membership_access_profiles").select("access_mode")
    .eq("organization_id", context.organizationId).eq("user_id", context.userId).maybeSingle();
  if (profileError) throw new Error("AUTHORIZATION_UNAVAILABLE");
  if (!profile || profile.access_mode === "role") return context.role === "admin";
  const { data: permission, error } = await context.admin
    .from("membership_permissions").select("allowed")
    .eq("organization_id", context.organizationId).eq("user_id", context.userId)
    .eq("permission_key", "users.manage").maybeSingle();
  if (error) throw new Error("AUTHORIZATION_UNAVAILABLE");
  return permission?.allowed === true;
}
async function requireUserManagement(context: UserContext) {
  if (!await actorCanManageUsers(context)) throw new Error("USER_MANAGEMENT_FORBIDDEN");
}
async function projectKeyMap(admin: AdminClient, organizationId: string) {
  const { data, error } = await admin.from("projectos_projects").select("id, project_key")
    .eq("organization_id", organizationId);
  if (error) throw new Error("BACKEND_READ_FAILED");
  return new Map((data || []).map((row) => [String(row.id), String(row.project_key)]));
}
async function resolveProjectIds(context: UserContext, config: AccessConfig) {
  if (config.projectScope !== "selected") return [];
  if (!config.projectIds.length) throw new Error("PROJECT_SCOPE_INVALID");
  const { data, error } = await context.admin.from("projectos_projects").select("id, project_key")
    .eq("organization_id", context.organizationId);
  if (error) throw new Error("BACKEND_READ_FAILED");
  const rows = data || [];
  const resolved: string[] = [];
  for (const identifier of config.projectIds) {
    const match = rows.find((row) => String(row.id) === identifier || String(row.project_key) === identifier);
    if (!match) throw new Error("PROJECT_SCOPE_INVALID");
    resolved.push(String(match.id));
  }
  return [...new Set(resolved)];
}
async function loadEmailMap(admin: AdminClient, userIds: Set<string>) {
  const emails = new Map<string, string>();
  if (!userIds.size) return emails;
  for (let page = 1; page <= 20 && emails.size < userIds.size; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("AUTH_DIRECTORY_UNAVAILABLE");
    for (const user of data.users) if (userIds.has(user.id)) emails.set(user.id, user.email || "");
    if (data.users.length < 1000) break;
  }
  return emails;
}
async function findUserByEmail(admin: AdminClient, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("AUTH_DIRECTORY_UNAVAILABLE");
    const found = data.users.find((user) => (user.email || "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  throw new Error("AUTH_DIRECTORY_UNAVAILABLE");
}
async function loadOwnAccess(context: UserContext) {
  const [profileResult, permissionsResult, projectsResult, keys] = await Promise.all([
    context.admin.from("membership_access_profiles")
      .select("access_mode, project_scope, access_version, updated_at")
      .eq("organization_id", context.organizationId).eq("user_id", context.userId).maybeSingle(),
    context.admin.from("membership_permissions").select("permission_key, allowed")
      .eq("organization_id", context.organizationId).eq("user_id", context.userId).eq("allowed", true),
    context.admin.from("membership_project_access").select("project_id, can_view")
      .eq("organization_id", context.organizationId).eq("user_id", context.userId).eq("can_view", true),
    projectKeyMap(context.admin, context.organizationId),
  ]);
  if (profileResult.error || permissionsResult.error || projectsResult.error) throw new Error("BACKEND_READ_FAILED");
  const profile = asRecord(profileResult.data);
  const accessMode = text(profile.access_mode, "role");
  const explicit = (permissionsResult.data || []).map((row) => String(row.permission_key)).sort();
  return {
    userId: context.userId,
    email: context.email,
    role: context.role,
    status: "active",
    accessMode,
    projectScope: text(profile.project_scope, "all"),
    accessVersion: Number(profile.access_version || 1),
    permissions: accessMode === "custom" ? explicit : rolePermissions(context.role),
    projectIds: (projectsResult.data || [])
      .map((row) => keys.get(String(row.project_id)))
      .filter((value): value is string => Boolean(value)).sort(),
    joinedAt: null,
    createdAt: null,
    updatedAt: profile.updated_at ?? null,
  };
}
async function loadMembers(context: UserContext) {
  const [memberships, profiles, permissions, projects, keys] = await Promise.all([
    context.admin.from("memberships").select("user_id, role, status, joined_at, created_at, updated_at")
      .eq("organization_id", context.organizationId).order("created_at"),
    context.admin.from("membership_access_profiles").select("user_id, access_mode, project_scope, access_version")
      .eq("organization_id", context.organizationId),
    context.admin.from("membership_permissions").select("user_id, permission_key, allowed")
      .eq("organization_id", context.organizationId).eq("allowed", true),
    context.admin.from("membership_project_access").select("user_id, project_id, can_view")
      .eq("organization_id", context.organizationId).eq("can_view", true),
    projectKeyMap(context.admin, context.organizationId),
  ]);
  if (memberships.error || profiles.error || permissions.error || projects.error) throw new Error("BACKEND_READ_FAILED");
  const membershipRows = memberships.data || [];
  const emails = await loadEmailMap(context.admin, new Set(membershipRows.map((row) => String(row.user_id))));
  const profileMap = new Map((profiles.data || []).map((row) => [String(row.user_id), row]));
  const permissionMap = new Map<string, string[]>();
  for (const row of permissions.data || []) {
    const userId = String(row.user_id);
    permissionMap.set(userId, [...(permissionMap.get(userId) || []), String(row.permission_key)]);
  }
  const projectMap = new Map<string, string[]>();
  for (const row of projects.data || []) {
    const userId = String(row.user_id);
    const key = keys.get(String(row.project_id));
    if (key) projectMap.set(userId, [...(projectMap.get(userId) || []), key]);
  }
  return membershipRows.map((row) => {
    const userId = String(row.user_id);
    const profile = asRecord(profileMap.get(userId));
    return {
      userId,
      email: emails.get(userId) || "",
      role: String(row.role),
      status: String(row.status),
      accessMode: text(profile.access_mode, "role"),
      projectScope: text(profile.project_scope, "all"),
      accessVersion: Number(profile.access_version || 1),
      permissions: (permissionMap.get(userId) || []).sort(),
      projectIds: (projectMap.get(userId) || []).sort(),
      joinedAt: row.joined_at ?? null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    };
  });
}
async function loadMember(context: UserContext, userId: string) {
  const member = (await loadMembers(context)).find((item) => item.userId === userId);
  if (!member) throw new Error("MEMBERSHIP_NOT_FOUND");
  return member;
}
function parseAccessBody(body: JsonRecord): AccessConfig {
  const role = validateEnum(body.role, MEMBER_ROLES, "INVALID_MEMBER_ROLE");
  const status = validateEnum(body.status ?? "active", MEMBER_STATUSES, "INVALID_MEMBERSHIP_STATUS");
  const accessMode = validateEnum(body.accessMode ?? "role", ACCESS_MODES, "INVALID_ACCESS_MODE");
  const projectScope = validateEnum(body.projectScope ?? "all", PROJECT_SCOPES, "INVALID_PROJECT_SCOPE");
  const permissions = stringArray(body.permissions, "INVALID_PERMISSIONS");
  if (permissions.some((key) => !PERMISSIONS.includes(key as typeof PERMISSIONS[number]))) throw new Error("INVALID_PERMISSIONS");
  const projectIds = stringArray(body.projectIds, "INVALID_PROJECT_IDS");
  if (projectIds.some((identifier) => !validProjectIdentifier(identifier))) throw new Error("INVALID_PROJECT_IDS");
  return { role, status, accessMode, projectScope, permissions, projectIds };
}
function enforceGrantAuthority(context: UserContext, targetRole: string, permissions: string[], currentRole?: string) {
  if (context.role !== "owner" && (targetRole === "owner" || currentRole === "owner")) {
    throw new Error("OWNER_CHANGE_REQUIRES_OWNER");
  }
  if (context.role !== "owner" && (permissions.includes("users.manage") || permissions.includes("release.production"))) {
    throw new Error("ROOT_PERMISSION_REQUIRES_OWNER");
  }
}
async function configureMember(context: UserContext, targetUserId: string, config: AccessConfig) {
  const projectIds = await resolveProjectIds(context, config);
  const { error } = await context.admin.rpc("pandora_configure_membership_access", {
    p_organization_id: context.organizationId,
    p_target_user_id: targetUserId,
    p_actor_user_id: context.userId,
    p_role: config.role,
    p_status: config.status,
    p_access_mode: config.accessMode,
    p_project_scope: config.projectScope,
    p_permissions: config.permissions,
    p_project_ids: projectIds,
  });
  if (error) {
    const message = String(error.message || "").toUpperCase();
    for (const code of [
      "LAST_OWNER_REQUIRED", "USER_MANAGEMENT_FORBIDDEN", "OWNER_CHANGE_REQUIRES_OWNER",
      "ROOT_PERMISSION_REQUIRES_OWNER", "MEMBERSHIP_NOT_FOUND", "PROJECT_SCOPE_INVALID",
      "INVALID_PERMISSION_KEY",
    ]) if (message.includes(code)) throw new Error(code);
    throw new Error("ACCESS_UPDATE_FAILED");
  }
}
async function inviteMember(context: UserContext, body: JsonRecord) {
  const email = validEmail(body.email);
  const config = parseAccessBody({ ...body, status: "active" });
  enforceGrantAuthority(context, config.role, config.permissions);
  let user = await findUserByEmail(context.admin, email);
  if (!user) {
    const { data, error } = await context.admin.auth.admin.inviteUserByEmail(email);
    if (error || !data.user) throw new Error("INVITE_FAILED");
    user = data.user;
  }
  const { data: existing, error: existingError } = await context.admin.from("memberships")
    .select("status").eq("organization_id", context.organizationId).eq("user_id", user.id).maybeSingle();
  if (existingError) throw new Error("MEMBERSHIP_CREATE_FAILED");
  if (existing) throw new Error("USER_ALREADY_MEMBER");
  const { error: membershipError } = await context.admin.from("memberships").insert({
    organization_id: context.organizationId,
    user_id: user.id,
    role: config.role,
    status: "suspended",
    invited_by: context.userId,
  });
  if (membershipError) {
    throw new Error(membershipError.code === "23505" ? "USER_ALREADY_MEMBER" : "MEMBERSHIP_CREATE_FAILED");
  }
  await configureMember(context, user.id, config);
  return loadMember(context, user.id);
}
async function updateMember(context: UserContext, targetUserId: string, body: JsonRecord) {
  if (!validUuid(targetUserId)) throw new Error("MEMBERSHIP_NOT_FOUND");
  const current = await loadMember(context, targetUserId);
  const config = parseAccessBody(body);
  enforceGrantAuthority(context, config.role, config.permissions, current.role);
  await configureMember(context, targetUserId, config);
  return loadMember(context, targetUserId);
}
async function revokeMember(context: UserContext, targetUserId: string) {
  if (!validUuid(targetUserId)) throw new Error("MEMBERSHIP_NOT_FOUND");
  const current = await loadMember(context, targetUserId);
  enforceGrantAuthority(context, current.role, current.permissions, current.role);
  const { error } = await context.admin.rpc("pandora_revoke_membership_access", {
    p_organization_id: context.organizationId,
    p_target_user_id: targetUserId,
    p_actor_user_id: context.userId,
  });
  if (error) {
    const message = String(error.message || "").toUpperCase();
    if (message.includes("LAST_OWNER_REQUIRED")) throw new Error("LAST_OWNER_REQUIRED");
    if (message.includes("USER_MANAGEMENT_FORBIDDEN")) throw new Error("USER_MANAGEMENT_FORBIDDEN");
    throw new Error("ACCESS_UPDATE_FAILED");
  }
  return loadMember(context, targetUserId);
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const requestOrigin = req.headers.get("origin");
  const allowedOrigin = corsOrigin(requestOrigin);
  const send = (body: unknown, status = 200) => response(body, status, requestId, allowedOrigin);
  const reject = (status: number, code: string, message: string) => fail(status, code, message, requestId, allowedOrigin);
  if (requestOrigin && !allowedOrigin) return reject(403, "ORIGIN_NOT_ALLOWED", "That app is not allowed to use this service.");
  if (req.method === "OPTIONS") return send(null, 204);
  if (req.method !== "GET" && req.method !== "POST") return reject(405, "METHOD_NOT_ALLOWED", "That action is not available.");
  try {
    const context = await authenticate(req);
    await enforceRateLimit(context, req.method);
    const route = routePath(new URL(req.url).pathname);
    if (req.method === "GET" && route === "/me") return send({ member: await loadOwnAccess(context) });
    await requireUserManagement(context);
    if (req.method === "GET" && route === "/users") return send({ members: await loadMembers(context), permissions: PERMISSIONS });
    if (req.method === "POST" && route === "/users/invite") return send({ member: await inviteMember(context, await bodyJson(req)) }, 201);
    if (req.method === "POST" && /^\/users\/[^/]+\/update$/.test(route)) {
      return send({ member: await updateMember(context, decodeURIComponent(route.split("/")[2]), await bodyJson(req)) });
    }
    if (req.method === "POST" && /^\/users\/[^/]+\/revoke$/.test(route)) {
      return send({ member: await revokeMember(context, decodeURIComponent(route.split("/")[2])) });
    }
    return reject(404, "ACCESS_ROUTE_NOT_FOUND", "That access-control action is not available.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "ACCESS_API_ERROR";
    if (code === "SIGN_IN_REQUIRED") return reject(401, code, "Please sign in again.");
    if (code === "ORGANIZATION_SELECTION_REQUIRED") return reject(409, code, "Choose which organization you want to use.");
    if (["ORGANIZATION_ACCESS_REQUIRED", "USER_MANAGEMENT_FORBIDDEN", "OWNER_CHANGE_REQUIRES_OWNER", "ROOT_PERMISSION_REQUIRES_OWNER", "LAST_OWNER_REQUIRED"].includes(code)) {
      return reject(403, code, "You do not have permission for that access change.");
    }
    if (code === "RATE_LIMITED") return reject(429, code, "Please wait a moment before trying again.");
    if (["INVALID_JSON", "INVALID_EMAIL", "INVALID_MEMBER_ROLE", "INVALID_MEMBERSHIP_STATUS", "INVALID_ACCESS_MODE", "INVALID_PROJECT_SCOPE", "INVALID_PERMISSIONS", "INVALID_PROJECT_IDS", "INVALID_PERMISSION_KEY", "PROJECT_SCOPE_INVALID", "BODY_TOO_LARGE"].includes(code) || code.startsWith("INVALID_")) {
      return reject(400, code, "Please check that access configuration and try again.");
    }
    if (code === "MEMBERSHIP_NOT_FOUND") return reject(404, code, "Pandora could not find that user in this organization.");
    if (code === "USER_ALREADY_MEMBER") return reject(409, code, "That person already belongs to this Pandora organization.");
    console.error(JSON.stringify({ requestId, code }));
    return reject(503, "PANDORA_ACCESS_UNAVAILABLE", "Pandora cannot update user access right now.");
  }
});