// Same-origin gate for browser POSTs. The expected origins come ONLY from server configuration, never from request headers:
// X-Forwarded-Host / X-Forwarded-Proto (and Host) are supplied by the caller and must not define what counts as "same origin".
//
//  * JOBGUARD_ALLOWED_ORIGINS: comma-separated origins for custom domains or self-hosting (https://demo.example.org).
//  * Vercel system variables VERCEL_URL, VERCEL_BRANCH_URL and VERCEL_PROJECT_PRODUCTION_URL (hostnames set by the platform).
//  * Local development and the production-build browser tests, only when NOT running on Vercel: the loopback hosts on the port
//    this server itself listens on (Next builds request.url from the server's own configuration, not from the Host header).
type Env = Record<string, string | undefined>;

const originOf = (value: string): string | null => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
};

export function trustedOrigins(env: Env, serverUrl: string): string[] {
  const origins = new Set<string>();
  for (const item of (env.JOBGUARD_ALLOWED_ORIGINS ?? "").split(",")) {
    const trimmed = item.trim();
    const origin = trimmed ? originOf(trimmed) : null;
    // An origin has no path: ignore entries that carry one so a typo cannot widen the list.
    if (origin && trimmed.replace(/\/+$/u, "") === origin) origins.add(origin);
  }
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const origin = host && !/[\s/@]/u.test(host) ? originOf(`https://${host}`) : null;
    if (origin) origins.add(origin);
  }
  if (!env.VERCEL) {
    const port = new URL(serverUrl).port;
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) origins.add(`http://${host}${port ? `:${port}` : ""}`);
  }
  return [...origins];
}

export function isTrustedBrowserOrigin(request: Request, env: Env = process.env): boolean {
  const header = request.headers.get("origin");
  const origin = header ? originOf(header) : null;
  return origin !== null && trustedOrigins(env, request.url).includes(origin);
}
