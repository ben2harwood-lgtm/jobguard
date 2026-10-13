import "server-only";
import { NextResponse } from "next/server";
import { parseCompleteSiteVisit, SiteVisitError } from "@jobguard/core";
import { assertSiteExtraMode, siteVisitHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../../../lib/workspace-server";
import { isTrustedBrowserOrigin } from "../../../../../origin";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = siteVisitHttpFailure(error); return NextResponse.json(body, { status, headers }); };
/** ENT-3b: complete a site visit. A visit cannot be completed without the close-out answer, here, in the API and in the database. */
export async function POST(request: Request, context: { params: Promise<{ id: string; visitId: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return failure(new SiteVisitError("ORIGIN_FORBIDDEN"));
 try {
  assertSiteExtraMode();
  let raw: unknown; try { raw = await request.json(); } catch { throw new SiteVisitError("INVALID_COMMAND"); }
  const body = parseCompleteSiteVisit(raw); if (!body.ok) throw new SiteVisitError(body.code);
  const { id, visitId } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.completeVisit(id, visitId, body.data), { status: 201, headers });
 } catch (error) { return failure(error); }
}
