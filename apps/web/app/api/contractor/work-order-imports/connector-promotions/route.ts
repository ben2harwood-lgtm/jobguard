import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ConnectorPromotionApplication, workOrderHttpFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../origin";
const headers = { "cache-control": "no-store" };
async function application() {
  const sessionId = (await cookies()).get("jg_session")?.value;
  return { app: new ConnectorPromotionApplication(syntheticPool()), principal: { version: "contractor-principal.v1", sessionId } };
}
function failure(error: unknown) { const {status,body} = workOrderHttpFailure(error); return NextResponse.json(body,{status,headers}); }
export async function GET() {
  try { const {app,principal} = await application(); return NextResponse.json(await app.list(principal),{headers}); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request)) return failure(Object.assign(new Error("NOT_FOUND"),{code:"P0002"}));
  try { const {app,principal} = await application(); return NextResponse.json(await app.promote(principal,await request.json().catch(() => undefined)),{headers}); }
  catch (error) { return failure(error); }
}
