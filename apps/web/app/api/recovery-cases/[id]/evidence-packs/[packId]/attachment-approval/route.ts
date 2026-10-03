import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; packId: string }> }) {
  try {
    const { id, packId } = await params;
    return NextResponse.json(await workspaceApplication().evidencePacks.approveAttachment((await cookies()).get("jg_session")?.value, id, packId, await request.json()));
  } catch (error) {
    const { status, code } = workspaceApplication().evidencePacks.failure(error);
    return NextResponse.json({ code }, { status });
  }
}
