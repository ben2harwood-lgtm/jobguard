import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recoveryCommandFailure } from "@jobguard/api/workspace";
import { hasSyntheticSession, practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export async function POST(r: Request, { params }: { params: Promise<{ id: string }> }) {
 const sessionId = (await cookies()).get("jg_session")?.value;
 if (!hasSyntheticSession(sessionId)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
 let body: unknown;
 try { body = await r.json(); }
 catch { return NextResponse.json({ code: "INVALID_COMMAND" }, { status: 400 }); }
 try { return NextResponse.json(await (await workspaceApplication()).recoveryCases.eligibility((await params).id, body, sessionId)); }
 catch (error) { const denied = practiceFailure(error); if(denied)return denied; const failure = recoveryCommandFailure(error); return NextResponse.json(failure.body, { status: failure.status }); }
}
