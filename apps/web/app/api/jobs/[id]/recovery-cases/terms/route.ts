import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RecoveryCaseApplication, recoveryCommandFailure } from "@jobguard/api/workspace";
import { hasSyntheticSession, practiceFailure, syntheticPool } from "../../../../../lib/synthetic-server";
export async function POST(r: Request, { params }: { params: Promise<{ id: string }> }) {
 const sessionId = (await cookies()).get("jg_session")?.value;
 if (!hasSyntheticSession(sessionId)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
 try { return NextResponse.json(await new RecoveryCaseApplication(syntheticPool(), sessionId).terms((await params).id, () => r.json())); }
 catch (error) { const denied = practiceFailure(error); if(denied)return denied; const failure = recoveryCommandFailure(error); return NextResponse.json(failure.body, { status: failure.status }); }
}
