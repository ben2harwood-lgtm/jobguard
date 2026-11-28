import { NextResponse } from "next/server";
import { isTrustedBrowserOrigin } from "../../../../../contractor/origin";
import { POST as activate } from "../../../../../jobs/[id]/quotes/activation/route";

// Use the existing web activation handler so it recognizes the linked practice session.
// It builds the workspace, which checks a linked session's exact browser pairing (V2-PAIR-1).
export function POST(request: Request, context: Parameters<typeof activate>[1]) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  // V2-PAIR-1, rule 21: configured origins only, never the request URL or forwarded headers.
  if (!isTrustedBrowserOrigin(request)) {
    return NextResponse.json({ code: "ORIGIN_FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return activate(request, context);
}
