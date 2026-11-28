import { NextResponse, type NextRequest } from "next/server";
/** Customer cookies never authorize any builder API, even alongside a legacy practice cookie.
 * V2-G3: the handover receipt is authorized by its link token in the body, not by any cookie,
 * so a recipient who also holds a portal cookie can still acknowledge it. Exact path only. */
export function proxy(request: NextRequest) {
  if (request.cookies.has("jobguard_customer") && request.nextUrl.pathname !== "/api/v2/handover" && !/^\/api\/customer-portal\/(?:issue|revoke|signin|signout|read|messages|quote|quote-accept|stages|stage-acknowledge|variations\/read|variation-approvals|variation-photo|extra-approvals|practice-pay-now)$/u.test(request.nextUrl.pathname)) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
