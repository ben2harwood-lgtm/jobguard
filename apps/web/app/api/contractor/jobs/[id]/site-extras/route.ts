import "server-only";
import { NextResponse } from "next/server";
import { logSiteExtraV1, logSiteExtraV2, logSiteExtraV3, SiteExtraError } from "@jobguard/core";
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
  // v2 (visit) and v3 (evidence) are separate extensions of v1.
  const body = (raw as { version?: unknown } | null)?.version === "log-site-extra.v2" ? logSiteExtraV2.safeParse(raw) : logSiteExtraV1.safeParse(raw);
  const parsed = body.success ? body : logSiteExtraV3.safeParse(raw); if (!parsed.success) throw new SiteExtraError("INVALID_COMMAND");
  const { id } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.log(id, parsed.data), { status: 201, headers });
 } catch (error) { return failure(error); }
}
