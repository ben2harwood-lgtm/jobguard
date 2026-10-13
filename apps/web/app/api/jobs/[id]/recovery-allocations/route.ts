import { NextResponse } from "next/server";
import { practiceFeedSession, recoveryAllocationHttpError } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
function session(request: Request) { if (request.headers.has("x-tenant-id")) throw Object.assign(new Error("TENANT_FORBIDDEN"), { code: "TENANT_FORBIDDEN" }); return practiceFeedSession(request.headers.get("cookie") ?? undefined); }
function failure(error: unknown) { const result = recoveryAllocationHttpError(error); return NextResponse.json(result.body, { status: result.status }); }
export async function GET(request: Request, { params }: Context) {
  try { const current = session(request); if (new URL(request.url).searchParams.size > 0) throw Object.assign(new Error("INVALID_QUERY"), { code: "INVALID_QUERY" }); return NextResponse.json(await (await workspaceApplication()).recoveryAllocations.view(current, (await params).id)); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try { const current = session(request); return NextResponse.json(await (await workspaceApplication()).recoveryAllocations.command(current, (await params).id, () => request.json())); }
  catch (error) { return failure(error); }
}
