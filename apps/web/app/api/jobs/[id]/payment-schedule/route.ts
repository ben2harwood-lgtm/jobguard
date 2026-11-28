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
    if (!code.startsWith("SCHEDULE_")) {
      return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers });
    }
    return NextResponse.json({ code }, { status: code.includes("STALE") || code.includes("CONFLICT") ? 409 : 400, headers });
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
