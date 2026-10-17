import "server-only";
import { NextResponse } from "next/server";
import { startSiteVisitV1, SiteVisitError } from "@jobguard/core";
import { assertSiteExtraMode, siteVisitHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
import { isTrustedBrowserOrigin } from "../../../../origin";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = siteVisitHttpFailure(error); return NextResponse.json(body, { status, headers }); };
/** ENT-3b: start a site visit. The job comes from the path; the actor, tenant and every time come from the server. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return failure(new SiteVisitError("ORIGIN_FORBIDDEN"));
 try {
  assertSiteExtraMode();
  let raw: unknown; try { raw = await request.json(); } catch { throw new SiteVisitError("INVALID_COMMAND"); }
  const body = startSiteVisitV1.safeParse(raw); if (!body.success) throw new SiteVisitError("INVALID_COMMAND");
  const { id } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.startVisit(id, body.data), { status: 201, headers });
 } catch (error) { return failure(error); }
}
