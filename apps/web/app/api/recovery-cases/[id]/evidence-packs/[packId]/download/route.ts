import { practiceFailure } from "../../../../../../lib/synthetic-server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; packId: string }> }) {
  const { id, packId } = await params;
  try {
    const body = await (await workspaceApplication()).evidencePacks.download((await cookies()).get("jg_session")?.value, id, packId);
    return new NextResponse(body, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="jobguard-evidence-pack-${packId}.txt"`, "cache-control": "private, no-store" } });
  } catch (error) {const denied=practiceFailure(error);if(denied)return denied;
    const { status, code } = (await workspaceApplication()).evidencePacks.failure(error);
    return NextResponse.json({ code }, { status });
  }
}
