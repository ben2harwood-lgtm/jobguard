import "server-only";
import { NextResponse } from "next/server";
import { assertSiteExtraMode, siteVisitHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = siteVisitHttpFailure(error); return NextResponse.json(body, { status, headers }); };
/** ENT-3b: the lines of one assigned job's current order, without prices. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  assertSiteExtraMode();
  const { id } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.orderLines(id), { status: 200, headers });
 } catch (error) { return failure(error); }
}
