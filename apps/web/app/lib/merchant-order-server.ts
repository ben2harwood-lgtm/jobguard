import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { MerchantOrderApplication } from "@jobguard/api/merchant-order";
import { practiceFailure, syntheticPool } from "./synthetic-server";
import { routeErrorCode } from "./route-error-code";

export async function merchantOrderReply(request: Request, jobId: string) {
  const headers = { "Cache-Control": "no-store" };
  // Commercial practice actions are same-origin; a cookie alone cannot authorize CSRF.
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ code: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
  try {
    const app = new MerchantOrderApplication(syntheticPool(), (await cookies()).get("jg_session")?.value);
    return NextResponse.json(await app.execute(jobId, await request.json()), { headers });
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) { denied.headers.set("Cache-Control", "no-store"); return denied; }
    const failure = routeErrorCode(error, "INVALID_ORDER_INPUT");
    const code = failure === "ORDER_AUTHORITY_STALE" ? "NOT_FOUND" : failure;
    return NextResponse.json({ code }, { status: code === "NOT_FOUND" ? 404 : code === "ORDER_ALREADY_COMMITTED" ? 409 : 400, headers });
  }
}
