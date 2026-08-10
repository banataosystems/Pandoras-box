export const DEFAULT_ALLOWED_ORIGINS = [
  "https://mcpmaster.vercel.app",
  "https://mcpmaster-hazel.vercel.app",
  "https://mcpmaster-mbanatao-dc676069.vercel.app",
] as const;

export function parseAllowedOrigins(
  configured: string | undefined,
  defaults: readonly string[] = DEFAULT_ALLOWED_ORIGINS,
): Set<string> {
  const candidates = [...defaults, ...(configured || "").split(",")];
  const origins = new Set<string>();
  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.origin === value) origins.add(value);
    } catch {
      // Invalid configuration is ignored so it can never broaden browser access.
    }
  }
  return origins;
}

export function allowedCorsOrigin(
  requestOrigin: string | null,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  if (!requestOrigin) return null;
  try {
    const url = new URL(requestOrigin);
    return url.origin === requestOrigin && allowedOrigins.has(requestOrigin)
      ? requestOrigin
      : null;
  } catch {
    return null;
  }
}

export function normalizeOwnerRoute(pathname: string): string {
  let route = pathname
    .replace(/^\/functions\/v1\/pandora-owner-api(?=\/|$)/, "")
    .replace(/^\/pandora-owner-api(?=\/|$)/, "")
    .replace(/^\/api\/owner(?=\/|$)/, "")
    .replace(/\/+$/, "");
  if (!route) return "/";
  if (!route.startsWith("/")) route = `/${route}`;
  return route;
}
