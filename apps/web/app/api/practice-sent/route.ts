import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticatePracticeSession, PracticeSentRepository } from "@jobguard/db";
import { practiceFailure, syntheticPool } from "../../lib/synthetic-server";

const headers = { "Cache-Control": "no-store" };

/** V2-SQ-A: this practice firm's "sent" items, newest first. Read only; nothing here sends anything. */
export async function GET() {
  try {
    const pool = syntheticPool();
    const { context } = await authenticatePracticeSession(pool, (await cookies()).get("jg_session")?.value);
    return NextResponse.json({ items: await new PracticeSentRepository(pool).list(context) }, { headers });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "UNAUTHENTICATED" || (error instanceof Error && error.message === "UNAUTHENTICATED")) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers });
    return practiceFailure(error) ?? NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers });
  }
}
