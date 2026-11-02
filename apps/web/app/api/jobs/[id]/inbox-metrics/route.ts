import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readInboxDashboard } from "../../../../lib/inbox-metrics-server";
import { hasSyntheticSession, practiceFailure, syntheticPool } from "../../../../lib/synthetic-server";

const headers = { "Cache-Control": "no-store" };
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "SYNTHETIC_MODE_REQUIRED" }, { status: 403, headers });
  const sessionId = (await cookies()).get("jg_session")?.value;
  if (!hasSyntheticSession(sessionId)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers });
  try {
    return NextResponse.json(await readInboxDashboard(syntheticPool(), sessionId, (await params).id), { headers });
  } catch (error) {
    return practiceFailure(error) ?? NextResponse.json({ code: "INBOX_METRICS_UNAVAILABLE" }, { status: 503, headers });
  }
}
