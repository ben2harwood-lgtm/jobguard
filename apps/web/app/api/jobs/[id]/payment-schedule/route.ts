import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";
import { routeErrorCode } from "../../../../lib/route-error-code";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ id: string }> };
async function invoke(run: () => Promise<unknown>) {
  try { return NextResponse.json(await run(), { headers }); }
  catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    const code = routeErrorCode(error, "DATABASE_UNAVAILABLE");
    if (!code.startsWith("SCHEDULE_") && !code.startsWith("STAGE_") && code !== "FINAL_ACCOUNT_LOCKED") {
      return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers });
    }
    // K5B-1: a stage not due, a live draft or a missing draft is a state conflict, like a stale schedule.
    // V2-G6: after the final account locks, no new stage draft (FINAL_ACCOUNT_LOCKED).
    const conflict = /STALE|CONFLICT|NOT_DUE|DRAFT_LIVE|DRAFT_NOT_FOUND|FINAL_ACCOUNT_LOCKED/u.test(code);
    return NextResponse.json({ code }, { status: conflict ? 409 : 400, headers });
  }
}
export async function GET(_request: Request, { params }: RouteContext) {
  return invoke(async () => (await workspaceApplication()).paymentSchedule.read((await params).id));
}
export async function POST(request: Request, { params }: RouteContext) {
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ code: "SCHEDULE_INVALID" }, { status: 400, headers }); }
  return invoke(async () => (await workspaceApplication()).paymentSchedule.set((await params).id, raw));
}
