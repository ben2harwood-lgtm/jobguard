import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BaselineError, EnterpriseDashboardError } from "@jobguard/core";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

const headers = { "cache-control": "no-store" };
/** All requests are same-origin POSTs, including reports, so queries never enter URL/history caches. */
export async function enterpriseRequest(request: Request, work: (principal: { sessionId: string }, body: unknown) => Promise<unknown>) {
  try {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseDashboardError("MODE_FORBIDDEN");
    if (!isTrustedBrowserOrigin(request)) throw new EnterpriseDashboardError("NOT_FOUND");
    const sessionId = (await cookies()).get("jg_session")?.value;
    if (!sessionId) throw new EnterpriseDashboardError("NOT_FOUND");
    const body: unknown = await request.json().catch(() => { throw new EnterpriseDashboardError("DASHBOARD_INVALID"); });
    return NextResponse.json(await work({ sessionId }, body), { headers });
  } catch (error) {
    const known = error instanceof EnterpriseDashboardError || error instanceof BaselineError;
    const code = known ? error.code : "DASHBOARD_UNAVAILABLE";
    const status = code === "MODE_FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "BASELINE_CONFLICT" ? 409
      : code === "DASHBOARD_UNAVAILABLE" ? 503 : 422;
    return NextResponse.json(known ? error.toJSON() : { version: "enterprise-dashboard-error.v1", code }, { status, headers });
  }
}
