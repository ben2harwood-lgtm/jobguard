import { NextResponse, type NextRequest } from "next/server";
/** Customer cookies never authorize any builder API, even alongside a legacy practice cookie. */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (request.cookies.has("jobguard_customer") && !/^\/api\/customer-portal\/(?:issue|revoke|signin|signout|read|messages|quote|quote-accept|stages|stage-acknowledge|variations\/read|variation-approvals|extra-approvals|practice-pay-now)$/u.test(path)
    // V2-F6 customer extra links are authorized by their own capability in the path, never by a cookie.
    && !/^\/api\/v2\/extra-links\/[a-f0-9]{64}\.[a-f0-9]{64}(?:\/photos\/[0-9a-f-]{36})?$/u.test(path)) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
