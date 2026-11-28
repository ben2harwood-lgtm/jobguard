import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { V2JobProfitApplication } from "@jobguard/api/workspace";
import { enforcePracticePair } from "../../../../lib/linked-practice-entry";
import { practiceFailure, syntheticPool } from "../../../../lib/synthetic-server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
    return NextResponse.json({ code: "SYNTHETIC_MODE_REQUIRED" }, { status: 403, headers });
  }
  try {
    const pool = syntheticPool(), token = (await cookies()).get("jg_session")?.value;
    await enforcePracticePair(pool, token);
    return NextResponse.json(await new V2JobProfitApplication(pool, token).read((await params).id), { headers });
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    return NextResponse.json({ code: "PROFIT_UNAVAILABLE" }, { status: 503, headers });
  }
}
