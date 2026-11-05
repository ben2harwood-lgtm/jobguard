import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { MerchantOrderApplication } from "@jobguard/api/merchant-order";
import { practiceFailure, syntheticPool } from "./synthetic-server";
import { isRouteValidationError, routeErrorCode } from "./route-error-code";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

export async function merchantOrderReply(request: Request, jobId: string) {
  const headers = { "Cache-Control": "no-store" };
  // Commercial practice actions are same-origin; a cookie alone cannot authorize CSRF.
  if (!isTrustedBrowserOrigin(request))
    return NextResponse.json({ code: "ORIGIN_FORBIDDEN" }, { status: 403, headers });
  try {
    const app = new MerchantOrderApplication(syntheticPool(), (await cookies()).get("jg_session")?.value);
    return NextResponse.json(await app.execute(jobId, await request.json()), { headers });
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) { denied.headers.set("Cache-Control", "no-store"); return denied; }
    const failure = isRouteValidationError(error) ? "INVALID_ORDER_INPUT" : routeErrorCode(error, "UNAVAILABLE");
    if (!["ORDER_AUTHORITY_STALE", "ORDER_ACTION_INVALID", "ORDER_ALREADY_COMMITTED", "NOT_FOUND", "INVALID_ORDER_INPUT"].includes(failure)) {
      console.error("Merchant order unavailable", error);
      return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503, headers });
    }
    const code = failure === "ORDER_AUTHORITY_STALE" ? "NOT_FOUND" : failure;
    return NextResponse.json({ code }, { status: code === "NOT_FOUND" ? 404 : code === "ORDER_ALREADY_COMMITTED" ? 409 : 400, headers });
  }
}
