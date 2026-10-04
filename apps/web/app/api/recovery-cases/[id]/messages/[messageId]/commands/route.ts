import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const { id, messageId } = await params;
    return NextResponse.json(await workspaceApplication().recoveryMessages.command((await cookies()).get("jg_session")?.value, id, messageId, await request.json()));
  } catch (error) {
    const { status, code } = workspaceApplication().recoveryMessages.failure(error);
    return NextResponse.json({ code }, { status });
  }
}
