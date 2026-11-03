import { NextResponse } from "next/server";
import { PreventionCheckError } from "@jobguard/core";
import { preventionHttpStatus } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";

type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  return practiceFailure(error) ?? NextResponse.json({ code: error instanceof PreventionCheckError ? error.code : "EXPOSURE_UNAVAILABLE" },
    { status: error instanceof PreventionCheckError ? preventionHttpStatus(error.code) : 503, headers });
}
export async function GET(_request: Request, { params }: Context) {
  try { return NextResponse.json(await (await workspaceApplication()).preventionChecks.exposureSchedule((await params).id), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const app = await workspaceApplication();
    let body: unknown;
    try { body = await request.json(); } catch { throw new PreventionCheckError("INVALID_PREVENTION_COMMAND"); }
    return NextResponse.json(await app.preventionChecks.exposureSchedule((await params).id, body), { headers });
  } catch (error) { return failure(error); }
}
