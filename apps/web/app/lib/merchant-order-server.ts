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
    const statuses: Record<string, number> = {
      ORDER_AUTHORITY_STALE: 404, ORDER_ACTION_INVALID: 400, ORDER_ALREADY_COMMITTED: 409,
      NOT_FOUND: 404, INVALID_ORDER_INPUT: 400, SYNTHETIC_MODE_REQUIRED: 403,
      JOB_NOT_FOUND: 404, JOB_NOT_LIVE: 409, IDEMPOTENCY_CONFLICT: 409,
      FORBIDDEN: 403, COMMAND_CONFLICT: 409, AUTHORIZATION_INVALID: 400,
    };
    const typedCode = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    const failure = isRouteValidationError(error) ? "INVALID_ORDER_INPUT"
      : typeof typedCode === "string" ? typedCode : routeErrorCode(error, "UNAVAILABLE");
    if (!Object.hasOwn(statuses, failure)) {
      console.error("Merchant order unavailable", error);
      return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503, headers });
    }
    const code = failure === "ORDER_AUTHORITY_STALE" ? "NOT_FOUND" : failure;
    return NextResponse.json({ code }, { status: statuses[failure]!, headers });
  }
}
