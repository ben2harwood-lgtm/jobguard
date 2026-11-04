import "server-only";
import { NextResponse } from "next/server";
import { SorSiteExtraError } from "@jobguard/core";
import { assertSiteExtraMode, sorSiteExtraHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
const headers = { "cache-control": "no-store" };
/** No query keys or request authority are read. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  try { assertSiteExtraMode(); } catch { throw new SorSiteExtraError("MODE_FORBIDDEN"); }
  const { id } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.sorRecentItems(id), { status: 200, headers });
 } catch (error) {
  const { status, body } = sorSiteExtraHttpFailure(error);
  return NextResponse.json(body, { status, headers });
 }
}
