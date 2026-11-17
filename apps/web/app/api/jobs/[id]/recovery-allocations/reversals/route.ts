import { NextResponse } from "next/server";
import { practiceFeedSession, recoveryAllocationHttpError } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (request.headers.has("x-tenant-id")) throw Object.assign(new Error("TENANT_FORBIDDEN"), { code: "TENANT_FORBIDDEN" });
    const session = practiceFeedSession(request.headers.get("cookie") ?? undefined);
    return NextResponse.json(await (await workspaceApplication()).recoveryAllocations.command(session, (await params).id, () => request.json(), true));
  } catch (error) { const result = recoveryAllocationHttpError(error); return NextResponse.json(result.body, { status: result.status }); }
}
