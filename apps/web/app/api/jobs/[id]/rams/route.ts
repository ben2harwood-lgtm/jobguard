import { ZodError } from "zod";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RamsApplication, RamsError } from "@jobguard/api/workspace";
import { AuthError, resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { identityApplication } from "../../../../lib/identity-server";
import { WorkPlanError } from "@jobguard/db";
import { practiceFailure, syntheticPool } from "../../../../lib/synthetic-server";

async function handle(request: Request, context: { params: Promise<{ id: string }> }, write: boolean) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  const headers = { "Cache-Control": "no-store" };
  try {
    if (write) {
      if (!process.env.AUTH_ALLOWED_ORIGIN) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
      const identity = identityApplication();
      const token = (await cookies()).get("jobguard_session")?.value;
      const session = await identity.session(token);
      if (session.memberships.length !== 1) throw new AuthError("TENANT_FORBIDDEN");
      await resolveVerifiedTenantContext(identity.provider, {
        sessionToken: token, requestedTenantId: session.memberships[0]!.tenantId,
        csrfToken: request.headers.get("x-csrf-token") ?? undefined,
        origin: request.headers.get("origin") ?? undefined,
      }, identity.allowedOrigin);
    }
    const sessionId = (await cookies()).get("jg_session")?.value;
    const app = new RamsApplication(syntheticPool(), sessionId);
    const jobId = (await context.params).id;
    const result = write ? await app.command(jobId, await request.json().catch(() => null)) : await app.read(jobId);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
    if (error instanceof AuthError) return NextResponse.json({ code: error.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN" }, { status: error.code === "UNAUTHENTICATED" ? 401 : 403, headers });
    const denied = practiceFailure(error); if (denied) return denied;
    const code = error instanceof RamsError || error instanceof WorkPlanError ? error.code : "DATABASE_UNAVAILABLE";
    return NextResponse.json({ code }, { status: code === "RAMS_INVALID_COMMAND" ? 400 : code === "DATABASE_UNAVAILABLE" ? 503 : 409, headers });
  }
}
export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => handle(request, context, false);
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handle(request, context, true);
