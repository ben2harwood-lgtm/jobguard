import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { ZodError } from "zod";
import { V2ChaseRepository, V2ChaseError, requireV2Chasing } from "@jobguard/db";
import { authenticateLinkedPractice, enforcePracticePair } from "../../../../lib/linked-practice-entry";
import { practiceFailure, syntheticPool } from "../../../../lib/synthetic-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function execute(request: Request, params: Promise<{ id: string }>, write: boolean) {
  try {
    requireV2Chasing();
    const pool = syntheticPool();
    const jar = await cookies();
    const token = jar.get("jg_session")?.value;
    if (write) {
      if (!process.env.AUTH_ALLOWED_ORIGIN) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
      const { application, session } = await authenticateLinkedPractice(pool, token);
      // Linked owner lookup already verified the single owner membership and the exact practice pair.
      const tenantId = session.memberships[0]!.tenantId;
      const verified = await resolveVerifiedTenantContext(application.provider, {
        sessionToken: jar.get("jobguard_session")?.value,
        requestedTenantId: tenantId,
        csrfToken: request.headers.get("x-csrf-token") ?? undefined,
        origin: request.headers.get("origin") ?? undefined,
      }, application.allowedOrigin);
      if (verified.tenantId !== tenantId) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
    } else {
      await enforcePracticePair(pool, token);
    }
    const repository = new V2ChaseRepository(pool);
    const { id } = await params;
    return NextResponse.json(write ? await repository.command(token, id, await request.json().catch(() => null))
      : await repository.read(token, id), { headers });
  } catch (error) {
    if (error instanceof AuthError || error instanceof ZodError) {
      const unauthenticated = error instanceof AuthError && error.code === "UNAUTHENTICATED";
      return NextResponse.json({ code: unauthenticated ? "UNAUTHENTICATED" : "FORBIDDEN" },
        { status: unauthenticated ? 401 : 403, headers });
    }
    const denied = practiceFailure(error);
    if (denied) return denied;
    const code = error instanceof V2ChaseError ? error.code : "CHASE_UNAVAILABLE";
    return NextResponse.json({ version: "v2-chase-error.v1", code }, {
      status: code === "CHASE_INVALID" ? 400 : code === "CHASE_DARK" ? 404 : code === "CHASE_CONFLICT" ? 409 : 503, headers,
    });
  }
}
export const GET = (request: Request, { params }: { params: Promise<{ id: string }> }) => execute(request, params, false);
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) => execute(request, params, true);
