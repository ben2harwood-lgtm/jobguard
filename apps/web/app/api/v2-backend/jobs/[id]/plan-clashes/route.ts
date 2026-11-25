import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession, practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";

type Route = { params: Promise<{ id: string }> };

function failure(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
}

// V2-E5A, V2 only. Same-firm double-booking check for one job's plan: for each task with a crew
// record and a date, the firm's other jobs that book that crew record on that day. Writes nothing.
export async function GET(_request: Request, { params }: Route) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return failure("UNAUTHENTICATED", 401);
  try {
    const clashes = await (await workspaceApplication()).planClashes.read((await params).id);
    return NextResponse.json(clashes, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return practiceFailure(error) ?? failure("PLAN_CLASHES_UNAVAILABLE", 503);
  }
}
