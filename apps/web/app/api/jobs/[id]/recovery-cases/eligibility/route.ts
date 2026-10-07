import { practiceFailure } from "../../../../../lib/synthetic-server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export async function POST(r: Request, { params }: { params: Promise<{ id: string }> }) {
 const sessionId = (await cookies()).get("jg_session")?.value;
 if (!hasSyntheticSession(sessionId)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
 try { return NextResponse.json(await (await workspaceApplication()).recoveryCases.eligibility((await params).id, await r.json(), sessionId)); }
 catch (e) {const denied=practiceFailure(e);if(denied)return denied;
  const code = e instanceof Error ? e.message : "INVALID_COMMAND";
  const requiresReview = code === "ELIGIBILITY_STALE_REVISION" || code === "ELIGIBILITY_REVIEW_REQUIRED";
  return NextResponse.json({ code, message: requiresReview ? "Review the changed evidence before approving" : code }, {
   status: code === "ELIGIBILITY_REVIEWER_FORBIDDEN" ? 403 : requiresReview || code.includes("IDEMPOTENCY") ? 409 : 400,
  });
 }
}
