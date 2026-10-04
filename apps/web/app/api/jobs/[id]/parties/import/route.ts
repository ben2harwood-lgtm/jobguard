import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { JobPartiesError, SYNTHETIC_SESSION } from "@jobguard/api/workspace";
import { hasSyntheticSession } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try { return NextResponse.json(await workspaceApplication().parties.adopt({ sessionId: SYNTHETIC_SESSION }, (await context.params).id, await request.json())); }
  catch(error) { const code = error instanceof JobPartiesError ? error.code : error instanceof SyntaxError ? "INVALID_PARTIES" : "DATABASE_UNAVAILABLE";
    return NextResponse.json({code}, {status: code==="FORBIDDEN"?403:code==="NOT_FOUND"?404:code==="INVALID_PARTIES"?400:code==="DATABASE_UNAVAILABLE"?503:409}); }
}
