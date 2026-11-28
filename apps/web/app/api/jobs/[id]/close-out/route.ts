import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure, syntheticPool } from "../../../../lib/synthetic-server";
import { enforcePracticePair } from "../../../../lib/linked-practice-entry";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** V2-G6: "Before you close this job". Read only, local V2 practice stack only; nothing here locks or bills. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // A linked practice session must still carry its exact browser pairing (as the RAMS and Sent reads do).
    await enforcePracticePair(syntheticPool(), (await cookies()).get("jg_session")?.value);
    return NextResponse.json(await (await workspaceApplication()).closeOut.review((await params).id), { headers });
  }
  catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers });
  }
}
