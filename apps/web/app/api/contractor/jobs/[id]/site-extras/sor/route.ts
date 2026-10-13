import "server-only";
import { NextResponse } from "next/server";
import { SorSiteExtraError, parseLogSorSiteExtra } from "@jobguard/core";
import { assertSiteExtraMode, sorSiteExtraHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
import { isTrustedBrowserOrigin } from "../../../../origin";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = sorSiteExtraHttpFailure(error); return NextResponse.json(body, { status, headers }); };
/** ENT-3c: log a schedule-item site extra. The Origin check comes first, then the mode, then the body; the job is the path and nothing else names an actor. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return failure(new SorSiteExtraError("ORIGIN_FORBIDDEN"));
 try {
  try { assertSiteExtraMode(); } catch { throw new SorSiteExtraError("MODE_FORBIDDEN"); }
  let raw: unknown; try { raw = await request.json(); } catch { throw new SorSiteExtraError("INVALID_COMMAND"); }
  const body = parseLogSorSiteExtra(raw);
  const { id } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.logSor(id, body), { status: 201, headers });
 } catch (error) { return failure(error); }
}
