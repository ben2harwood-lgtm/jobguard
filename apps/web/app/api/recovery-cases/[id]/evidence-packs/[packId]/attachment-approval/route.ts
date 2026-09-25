import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; packId: string }> }) {
  try {
    const { id, packId } = await params;
    return NextResponse.json(await workspaceApplication().evidencePacks.approveAttachment((await cookies()).get("jg_session")?.value, id, packId, await request.json()));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_COMMAND";
    return NextResponse.json({ code }, { status: code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code.includes("NOT_FOUND") ? 404 : /CONFLICT|STALE/u.test(code) ? 409 : 400 });
  }
}
