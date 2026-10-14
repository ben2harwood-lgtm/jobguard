import "server-only";
import { NextResponse } from "next/server";
import { SorSiteExtraError, parseSorItemsQuery } from "@jobguard/core";
import { assertSiteExtraMode, sorSiteExtraHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = sorSiteExtraHttpFailure(error); return NextResponse.json(body, { status, headers }); };
/** ENT-3c: search of this job's price list. Only the `q` key of the query is read; anything else in the URL is ignored. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  try { assertSiteExtraMode(); } catch { throw new SorSiteExtraError("MODE_FORBIDDEN"); }
  const query = parseSorItemsQuery({ q: new URL(request.url).searchParams.get("q") ?? undefined });
  const { id } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.sorItems(id, query), { status: 200, headers });
 } catch (error) { return failure(error); }
}
