import "server-only";
import { NextResponse } from "next/server";
import { assertPilotConnection } from "@jobguard/db";
import {
  AuthError, cookieToken, hasNonPilotCookie, identityCookieOptions, identitySessionCookieName,
  identityStatus, requirePilotG1, requirePilotResources, type IdentityApplication, type TenantRequestCredentials,
} from "@jobguard/api/identity";
import { pilotIdentityApplication } from "./identity-server";

export async function pilotIdentityRequest(
  request: Request,
  work: (application: IdentityApplication, credentials: TenantRequestCredentials,
         reply: (body: unknown, token?: string) => NextResponse) => Promise<NextResponse>,
) {
  const headers = { "Cache-Control": "no-store" };
  try {
    requirePilotG1(process.env);
    const resources = requirePilotResources(process.env, "web");
    const origin = request.headers.get("origin") ?? undefined;
    if (new URL(request.url).origin !== resources.webOrigin ||
        (request.method !== "GET" && origin !== resources.webOrigin)) throw new AuthError("ORIGIN_FORBIDDEN");
    const cookie = request.headers.get("cookie") ?? undefined;
    if (hasNonPilotCookie(cookie)) throw new AuthError("UNAUTHENTICATED");
    const name = identitySessionCookieName("pilot_no_charge");
    const credentials = {
      sessionToken: cookieToken({ headers: { cookie } }, "pilot_no_charge"),
      origin, csrfToken: request.headers.get("x-csrf-token") ?? undefined,
      tenantHeader: request.headers.get("x-tenant-id") ?? undefined,
    };
    const application = pilotIdentityApplication();
    const pool = application.provider.repository.pool;
    try {
      await assertPilotConnection(pool, resources.identity);
      return await work(application, credentials, (body, token) => {
        const response = NextResponse.json(body, { headers });
        if (token !== undefined) response.cookies.set(name, token, {
          ...identityCookieOptions, maxAge: token ? identityCookieOptions.maxAge / 1000 : 0,
        });
        return response;
      });
    } finally {
      if (process.env.JOBGUARD_HOSTING === "cloudflare") await pool.end();
    }
  } catch (error) {
    const { code, status } = identityStatus(error);
    return NextResponse.json({ code }, { status, headers });
  }
}
