import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticatePracticeSession, PracticeSentRepository } from "@jobguard/db";
import { practiceFailure, syntheticPool } from "../../lib/synthetic-server";
import { enforcePracticePair } from "../../lib/linked-practice-entry";

const headers = { "Cache-Control": "no-store" };

/** V2-SQ-A: this practice firm's "sent" items, newest first. Read only; nothing here sends anything. */
export async function GET() {
  try {
    const pool = syntheticPool(), token = (await cookies()).get("jg_session")?.value;
    const { context, digest } = await authenticatePracticeSession(pool, token);
    // A linked practice session must still carry its exact browser pairing (as the workspace and RAMS reads do).
    await enforcePracticePair(pool, token);
    // Only this session's own jobs: a shared practice tenant holds other sessions' jobs.
    return NextResponse.json({ items: await new PracticeSentRepository(pool).list(context, digest) }, { headers });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "UNAUTHENTICATED" || (error instanceof Error && error.message === "UNAUTHENTICATED")) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers });
    return practiceFailure(error) ?? NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers });
  }
}
