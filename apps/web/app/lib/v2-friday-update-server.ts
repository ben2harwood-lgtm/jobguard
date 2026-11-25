import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { FridayUpdateApplication, fridayCommandV1, fridayQueryV1 } from "@jobguard/api/workspace";
import { FridayUpdateError } from "@jobguard/db";
import { identityApplication, identityCredentials } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
const headers = { "Cache-Control": "no-store" };
export async function fridayUpdateRequest(request: Request, jobId: string) {
  try {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo")
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers });
    if (["x-tenant-id", "x-actor-id", "x-session-id"].some(key => request.headers.has(key))) throw new Error("NOT_FOUND");
    if (request.method === "POST" && !process.env.AUTH_ALLOWED_ORIGIN) throw new Error("NOT_FOUND");
    const identity = identityApplication();
    const credentials = await identityCredentials(request);
    const session = await identity.session(credentials.sessionToken);
    if (session.memberships.length !== 1 || session.memberships[0]?.role !== "owner") throw new Error("NOT_FOUND");
    try { await resolveVerifiedTenantContext(identity.provider, {
      sessionToken: credentials.sessionToken, requestedTenantId: session.memberships[0].tenantId,
      csrfToken: request.method === "GET" ? session.csrfToken : credentials.csrfToken,
      origin: request.method === "GET" ? identity.allowedOrigin : request.headers.get("origin") ?? undefined,
    }, identity.allowedOrigin); } catch { throw new Error("NOT_FOUND"); }
    const application = new FridayUpdateApplication(syntheticPool(), (await cookies()).get("jg_session")?.value);
    if (request.method === "GET") {
      const query = fridayQueryV1.parse(Object.fromEntries(new URL(request.url).searchParams));
      return NextResponse.json({ snapshot: await application.read(jobId, query), csrfToken: session.csrfToken }, { headers });
    }
    if (new URL(request.url).search) throw new Error("INVALID_INPUT");
    const command = fridayCommandV1.parse(await request.json());
    return NextResponse.json({ snapshot: await application.command(jobId, command) }, { headers });
  } catch (error) {
    const typed = error as { code?: string; name?: string; message?: string };
    const conflict = error instanceof FridayUpdateError && ["FRIDAY_CONFLICT", "FRIDAY_STALE", "FRIDAY_PREPARE_REQUIRED"].includes(error.code);
    const status = conflict ? 409 : typed.name === "ZodError" || typed.name === "SyntaxError" ||
      typed.message === "FRIDAY_WEEK_MUST_START_MONDAY" || typed.message === "INVALID_INPUT" ? 400 :
      ["NOT_FOUND", "UNAUTHENTICATED", "ORIGIN_REFUSED", "ORIGIN_FORBIDDEN", "CSRF_REFUSED", "TENANT_FORBIDDEN", "FORBIDDEN"].includes(typed.code ?? typed.message ?? "") ? 404 : 503;
    return NextResponse.json({ code: conflict ? typed.code : status === 400 ? "INVALID_INPUT" : status === 404 ? "NOT_FOUND" : "FRIDAY_UNAVAILABLE" }, { status, headers });
  }
}
