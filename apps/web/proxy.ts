import { NextResponse, type NextRequest } from "next/server";
/** Customer cookies never authorize any builder API, even alongside a legacy practice cookie. */
// V2-F7M: /api/v2/brief is authorized only by the crew-link token in its body and reads no cookie, so a customer cookie in the
// same browser must not block a crew press. Exact path only.
const CREW_LINK_PATH = "/api/v2/brief";
export function proxy(request: NextRequest) {
  if (request.cookies.has("jobguard_customer") && request.nextUrl.pathname !== CREW_LINK_PATH && !/^\/api\/customer-portal\/(?:issue|revoke|signin|signout|read|messages|quote|quote-accept|stages|stage-acknowledge|variations\/read|variation-approvals|extra-approvals|practice-pay-now)$/u.test(request.nextUrl.pathname)) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
