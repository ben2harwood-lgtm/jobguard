import "server-only";
import { NextResponse } from "next/server";
import { assertSiteExtraMode, siteVisitHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = siteVisitHttpFailure(error); return NextResponse.json(body, { status, headers }); };
/** ENT-3b: the jobs the signed-in site worker is named on. */
export async function GET() {
 try {
  assertSiteExtraMode();
  return NextResponse.json(await (await workspaceApplication()).siteExtras.assignedJobs(), { status: 200, headers });
 } catch (error) { return failure(error); }
}
