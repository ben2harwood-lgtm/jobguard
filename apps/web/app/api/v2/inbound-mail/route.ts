import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { V2InboundMailApplication } from "@jobguard/api/workspace";
import { enforcePracticePair } from "../../../lib/linked-practice-entry";
import { syntheticPool, practiceFailure } from "../../../lib/synthetic-server";
import { routeErrorCode } from "../../../lib/route-error-code";

const headers = { "Cache-Control": "no-store" };
async function application() {
  if(process.env.JOBGUARD_LOCAL_V2!=="1" || process.env.JOBGUARD_ENV!=="synthetic_demo")throw Object.assign(new Error("V2_ONLY"),{code:"V2_ONLY"});
  const sessionId = (await cookies()).get("jg_session")?.value;
  const pool = syntheticPool();
  await enforcePracticePair(pool,sessionId);
  return new V2InboundMailApplication(pool,sessionId);
}
function failure(error: unknown) {
  const denied = practiceFailure(error); if (denied) return denied;
  const code = routeErrorCode(error,"INVALID_COMMAND");
  return NextResponse.json({ code }, { status: code === "NOT_FOUND" || code === "V2_ONLY" ? 404 :
    ["STALE_INBOUND","IDEMPOTENCY_CONFLICT","ITEM_CLOSED"].includes(code) ? 409 : 400, headers });
}
export async function GET() {
  try { return NextResponse.json(await (await application()).view(), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    // The practice catcher accepts same-origin authenticated local requests only.
    if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ code:"ORIGIN_FORBIDDEN" },{status:403,headers});
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("action" in body) || !("command" in body)) throw new Error("INVALID_COMMAND");
    const app = await application();
    const result = body.action === "address" ? await app.address(body.command) : body.action === "receive" ? await app.receive(body.command) :
      body.action === "item" ? await app.command(body.command) : (() => { throw new Error("INVALID_COMMAND"); })();
    return NextResponse.json(result,{headers});
  } catch(error) { return failure(error); }
}
