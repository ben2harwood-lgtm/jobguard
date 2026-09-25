import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; packId: string }> }) {
  try {
    const { id, packId } = await params;
    return NextResponse.json(await workspaceApplication().evidencePacks.inspect((await cookies()).get("jg_session")?.value, id, packId, Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_QUERY";
    return NextResponse.json({ code }, { status: code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code.includes("NOT_FOUND") ? 404 : 400 });
  }
}
