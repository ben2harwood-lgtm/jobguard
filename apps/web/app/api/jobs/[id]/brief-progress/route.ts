import { NextResponse } from "next/server";
import { BriefProgressError } from "@jobguard/api/workspace";
import { isTrustedBrowserOrigin } from "../../../contractor/origin";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";

const headers = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  const denied = practiceFailure(error);
  if (denied) return denied;
  if (error instanceof BriefProgressError) {
    const status = error.code === "BRIEF_PROGRESS_INVALID_COMMAND" ? 400
      : error.code === "BRIEF_PROGRESS_EDITOR_REQUIRED" ? 403 : 409;
    return NextResponse.json({ code: error.code,
      ...(error.code === "BRIEF_PROGRESS_REGENERATE" && { message: "This brief needs regenerating" }) }, { status, headers });
  }
  const code = error instanceof Error && "code" in error ? error.code : null;
  const stage = error instanceof Error ? error.message : "";
  if (["JOB_WORK_CLOSED", "POST_LOCK_WORK_REQUIRES_LINKED_JOB"].includes(stage)) {
    return NextResponse.json({ code: stage }, { status: 409, headers });
  }
  if (code === "JOB_NOT_LIVE" || code === "JOB_NOT_FOUND") {
    return NextResponse.json({ code }, { status: code === "JOB_NOT_LIVE" ? 409 : 404, headers });
  }
  return NextResponse.json({ code: "BRIEF_PROGRESS_UNAVAILABLE" }, { status: 503, headers });
}
export async function GET(_request: Request, { params }: RouteContext) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers });
  try { return NextResponse.json(await (await workspaceApplication()).briefProgress.read((await params).id), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: RouteContext) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers });
  if (!isTrustedBrowserOrigin(request)) return NextResponse.json({ code: "ORIGIN_REFUSED" }, { status: 403, headers });
  const body: unknown = await request.json().catch(() => null);
  try { return NextResponse.json(await (await workspaceApplication()).briefProgress.record((await params).id, body), { headers }); }
  catch (error) { return failure(error); }
}
