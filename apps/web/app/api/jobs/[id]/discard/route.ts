import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CaptureApplication, CaptureApplicationError } from "@jobguard/api/workspace";
import { hasSyntheticSession, practiceFailure, syntheticPool } from "../../../../lib/synthetic-server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  const sessionId = (await cookies()).get("jg_session")?.value;
  if (!hasSyntheticSession(sessionId)) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  try {
    const capture = new CaptureApplication(syntheticPool(), sessionId);
    return NextResponse.json(await capture.discard((await params).id, body));
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    const code = error instanceof CaptureApplicationError ? error.code : "DATABASE_UNAVAILABLE";
    const status = code === "REVIEW_REVISION_CONFLICT" || code === "COMMAND_CONFLICT" ? 409
      : code === "DATABASE_UNAVAILABLE" ? 503 : 400;
    return NextResponse.json({ code }, { status });
  }
}
