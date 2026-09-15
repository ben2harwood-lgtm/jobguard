import { NextRequest, NextResponse } from "next/server";
import { closeSyntheticPool } from "../../../lib/synthetic-server";

export async function POST(request: NextRequest) {
  const expected = process.env.JOBGUARD_E2E_SHUTDOWN_TOKEN;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  await closeSyntheticPool();
  return new NextResponse(null, { status: 204 });
}
