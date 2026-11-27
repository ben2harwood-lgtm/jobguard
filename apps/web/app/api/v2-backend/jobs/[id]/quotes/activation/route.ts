import { NextResponse } from "next/server";
import { POST as activate } from "../../../../../jobs/[id]/quotes/activation/route";

// Use the existing web activation handler so it recognizes the linked practice session.
export function POST(request: Request, context: Parameters<typeof activate>[1]) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return activate(request, context);
}
