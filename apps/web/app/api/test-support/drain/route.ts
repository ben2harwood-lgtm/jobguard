import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { closeSyntheticPool } from "../../../lib/synthetic-server";

import { closeIdentityApplication } from "../../../lib/identity-server";

export async function POST(request: NextRequest) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  const expected = process.env.JOBGUARD_E2E_SHUTDOWN_TOKEN;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const authorized = Buffer.from(`Bearer ${expected ?? ""}`);
  if (!expected || supplied.length !== authorized.length || !timingSafeEqual(supplied, authorized)) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  await Promise.all([closeSyntheticPool(),closeIdentityApplication()]);
  return new NextResponse(null, { status: 204 });
}
