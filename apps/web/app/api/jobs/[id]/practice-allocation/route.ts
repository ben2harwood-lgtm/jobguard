import { NextResponse } from "next/server";
import { practiceAllocationHttpError, practiceAllocationHttpQuery, practiceAllocationSession } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
function session(request: Request) {
  if (request.headers.has("x-tenant-id")) throw Object.assign(new Error("TENANT_FORBIDDEN"), { code: "TENANT_FORBIDDEN" });
  return practiceAllocationSession(request.headers.get("cookie") ?? undefined);
}
function failure(error: unknown) {
  const result = practiceAllocationHttpError(error);
  return NextResponse.json(result.body, { status: result.status });
}
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const query = practiceAllocationHttpQuery(new URL(request.url).searchParams);
    return NextResponse.json(await workspaceApplication().practiceAllocation.view(session(request), (await params).id, query));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const currentSession = session(request);
    let body: unknown;
    try { body = await request.json(); }
    catch { throw Object.assign(new Error("INVALID_COMMAND"), { code: "INVALID_COMMAND" }); }
    return NextResponse.json(await workspaceApplication().practiceAllocation.command(currentSession, (await params).id, body));
  } catch (error) { return failure(error); }
}
