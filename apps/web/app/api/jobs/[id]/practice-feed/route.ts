import { NextResponse } from "next/server";
import { practiceFeedHttpError, practiceFeedHttpQuery, practiceFeedSession } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/** A thin authenticated adapter: the same application service as the Nest controller, composed in-process. */
function session(request: Request) {
  if (request.headers.has("x-tenant-id")) throw Object.assign(new Error("TENANT_FORBIDDEN"), { code: "TENANT_FORBIDDEN" });
  return practiceFeedSession(request.headers.get("cookie") ?? undefined);
}
function failure(error: unknown) {
  const result = practiceFeedHttpError(error);
  return NextResponse.json(result.body, { status: result.status });
}
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const query = practiceFeedHttpQuery(new URL(request.url).searchParams);
    return NextResponse.json(await workspaceApplication().practiceFeed.view(session(request), (await params).id, query));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const currentSession = session(request);
    let body: unknown;
    try { body = await request.json(); }
    catch { throw Object.assign(new Error("INVALID_COMMAND"), { code: "INVALID_COMMAND" }); }
    return NextResponse.json(await workspaceApplication().practiceFeed.command(currentSession, (await params).id, body));
  } catch (error) { return failure(error); }
}
