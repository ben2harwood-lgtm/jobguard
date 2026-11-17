import { practiceFailure } from "../../../../../../lib/synthetic-server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; followUpId: string }> }) {
  try {
    const { id, followUpId } = await params;
    return NextResponse.json(await (await workspaceApplication()).recoveryFollowUps.command((await cookies()).get("jg_session")?.value, id, followUpId, await request.json()));
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    const { status, code } = (await workspaceApplication()).recoveryFollowUps.failure(error);
    return NextResponse.json({ code }, { status });
  }
}
