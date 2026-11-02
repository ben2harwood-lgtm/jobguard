import { NextResponse, type NextRequest } from "next/server";
/** Customer cookies never authorize any builder API, even alongside a legacy practice cookie. */
export function proxy(request: NextRequest) {
  if (request.cookies.has("jobguard_customer") && !/^\/api\/customer-portal\/(?:issue|revoke|signin|signout|read|variations\/read|variation-approvals)$/u.test(request.nextUrl.pathname)) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
