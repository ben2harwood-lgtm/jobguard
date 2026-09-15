import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SYNTHETIC_SESSION, WorkspaceServiceError } from "@jobguard/api/workspace";
import { hasSyntheticSession } from "../../../lib/synthetic-server";
import { workspaceApplication } from "../../../lib/workspace-server";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const sessionId = (await cookies()).get("jg_session")?.value;
  const requestedTenantId = request.nextUrl.searchParams.get("requested_tenant_id");
  const principal = hasSyntheticSession(sessionId) ? { sessionId: SYNTHETIC_SESSION, ...(requestedTenantId ? { requestedTenantId } : {}) } : null;
  try { return NextResponse.json(await workspaceApplication().jobs.get(principal, (await context.params).id)); }
  catch (error) { const code = error instanceof WorkspaceServiceError ? error.code : "DATABASE_UNAVAILABLE"; const status = code === "UNAUTHENTICATED" ? 401 : code === "TENANT_FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 503; return NextResponse.json({ code, recoverable: status === 503 }, { status }); }
}
