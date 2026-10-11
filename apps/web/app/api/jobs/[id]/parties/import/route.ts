import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { JobPartiesError } from "@jobguard/api/workspace";
import { hasSyntheticSession, practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const cookie = (await cookies()).get("jg_session")?.value;
  if (!hasSyntheticSession(cookie)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try { return NextResponse.json(await (await workspaceApplication()).parties.adopt({ sessionId: cookie! }, (await context.params).id, await request.json().catch(() => null))); }
  catch(error) { const denied = practiceFailure(error); if (denied) return denied; const code = error instanceof JobPartiesError ? error.code : error instanceof SyntaxError ? "INVALID_PARTIES" : "DATABASE_UNAVAILABLE";
    return NextResponse.json({code}, {status: code==="FORBIDDEN"?403:code==="NOT_FOUND"?404:code==="INVALID_PARTIES"?400:code==="DATABASE_UNAVAILABLE"?503:409}); }
}
