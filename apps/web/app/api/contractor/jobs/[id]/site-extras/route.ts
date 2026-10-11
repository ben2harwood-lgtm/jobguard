import "server-only";
import { NextResponse } from "next/server";
import { logSiteExtraV1, SiteExtraError } from "@jobguard/core";
import { assertSiteExtraMode, siteExtraHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";
import { isTrustedBrowserOrigin } from "../../../origin";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = siteExtraHttpFailure(error); return NextResponse.json(body, { status, headers }); };
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return failure(new SiteExtraError("ORIGIN_FORBIDDEN"));
 try {
  assertSiteExtraMode();
  let raw: unknown; try { raw = await request.json(); } catch { throw new SiteExtraError("INVALID_COMMAND"); }
  const body = logSiteExtraV1.safeParse(raw); if (!body.success) throw new SiteExtraError("INVALID_COMMAND");
  const { id } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.log(id, body.data), { headers });
 } catch (error) { return failure(error); }
}
