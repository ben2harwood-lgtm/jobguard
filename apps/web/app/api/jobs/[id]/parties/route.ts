import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { JobPartiesError } from "@jobguard/api/workspace";
import { hasSyntheticSession, practiceFailure } from "../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../lib/workspace-server";
async function handle(request: NextRequest, context: { params: Promise<{ id: string }> }, write: boolean) {
  const cookie = (await cookies()).get("jg_session")?.value;
  if (!hasSyntheticSession(cookie)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const tenant = request.nextUrl.searchParams.get("requested_tenant_id");
  const principal = { sessionId: cookie!, ...(tenant ? { requestedTenantId: tenant } : {}) };
  try {
    const id = (await context.params).id;
    return NextResponse.json(write ? await (await workspaceApplication()).parties.command(principal, id, await request.json().catch(() => null)) : await (await workspaceApplication()).parties.view(principal, id));
  } catch (error) {
    const denied = practiceFailure(error); if (denied) return denied;
    const code = error instanceof JobPartiesError ? error.code : error instanceof SyntaxError ? "INVALID_PARTIES" : "DATABASE_UNAVAILABLE";
    const status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "INVALID_PARTIES" ? 400 : code === "DATABASE_UNAVAILABLE" ? 503 : 409;
    return NextResponse.json({ code, recoverable: status === 503 }, { status });
  }
}
export const GET = (request: NextRequest, context: { params: Promise<{ id: string }> }) => handle(request, context, false);
export const POST = (request: NextRequest, context: { params: Promise<{ id: string }> }) => handle(request, context, true);
