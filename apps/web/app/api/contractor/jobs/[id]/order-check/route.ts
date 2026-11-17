import "server-only";
import { NextResponse } from "next/server";
import { SorSiteExtraError, parseOrderCheckQuery } from "@jobguard/core";
import { assertSiteExtraMode, sorSiteExtraHttpFailure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = sorSiteExtraHttpFailure(error); return NextResponse.json(body, { status, headers }); };
/** ENT-3c: the order check before logging. Only `sorCode`, `quantity` and `orderLine` are read from the query; anything else in the URL is ignored. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  try { assertSiteExtraMode(); } catch { throw new SorSiteExtraError("MODE_FORBIDDEN"); }
  const params = new URL(request.url).searchParams, orderLine = params.get("orderLine");
  const query = parseOrderCheckQuery({ sorCode: params.get("sorCode") ?? undefined, quantity: params.get("quantity") ?? undefined, ...(orderLine === null ? {} : { orderLine }) });
  const { id } = await context.params;
  return NextResponse.json(await (await workspaceApplication()).siteExtras.orderCheck(id, query), { status: 200, headers });
 } catch (error) { return failure(error); }
}
