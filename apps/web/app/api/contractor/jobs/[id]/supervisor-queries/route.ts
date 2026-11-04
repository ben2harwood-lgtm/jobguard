import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SorSiteExtraError, recordSiteSupervisorQueryV1 } from "@jobguard/core";
import { SiteExtraApplication, sorSiteExtraHttpFailure, assertSiteExtraMode } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../origin";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = sorSiteExtraHttpFailure(error); return NextResponse.json(body, { status, headers }); };
async function run(context: { params: Promise<{ id: string }> }, body?: unknown) {
 try { assertSiteExtraMode(); } catch { throw new SorSiteExtraError("MODE_FORBIDDEN"); }
 const { id } = await context.params;
 const principal = { version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value };
 return new SiteExtraApplication(syntheticPool()).supervisorQueries(principal, id, body);
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return failure(new SorSiteExtraError("ORIGIN_FORBIDDEN"));
 try {
  try { assertSiteExtraMode(); } catch { throw new SorSiteExtraError("MODE_FORBIDDEN"); }
  let raw: unknown; try { raw = await request.json(); } catch { throw new SorSiteExtraError("INVALID_COMMAND"); }
  const body = recordSiteSupervisorQueryV1.safeParse(raw);
  if (!body.success) throw new SorSiteExtraError("INVALID_COMMAND");
  return NextResponse.json(await run(context, body.data), { status: 201, headers });
 } catch (error) { return failure(error); }
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
 try { return NextResponse.json(await run(context), { headers }); }
 catch (error) { return failure(error); }
}
