import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recoveryCommandFailure } from "@jobguard/api/workspace";
import { hasSyntheticSession, practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export async function POST(r: Request, { params }: { params: Promise<{ id: string }> }) {
 const sessionId = (await cookies()).get("jg_session")?.value;
 if (!hasSyntheticSession(sessionId)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
 try { return NextResponse.json(await (await workspaceApplication()).recoveryCases.eligibility((await params).id, () => r.json(), sessionId)); }
 catch (error) { const denied = practiceFailure(error); if(denied)return denied; const failure = recoveryCommandFailure(error); return NextResponse.json(failure.body, { status: failure.status }); }
}
