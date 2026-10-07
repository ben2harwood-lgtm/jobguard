import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recoveryCommandFailure, recoveryReadFailure } from "@jobguard/api/workspace";
import { hasSyntheticSession, practiceFailure } from "../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../lib/workspace-server";
const auth = async () => hasSyntheticSession((await cookies()).get("jg_session")?.value);
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
 if (!await auth()) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
 try { return NextResponse.json(await (await workspaceApplication()).recoveryCases.list((await params).id)); }
 catch (error) { const denied = practiceFailure(error); if(denied)return denied; const failure = recoveryReadFailure(error); return NextResponse.json(failure.body, { status: failure.status }); }
}
export async function POST(r: Request, { params }: { params: Promise<{ id: string }> }) {
 if (!await auth()) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
 let body: unknown;
 try { body = await r.json(); }
 catch { return NextResponse.json({ code: "INVALID_COMMAND" }, { status: 400 }); }
 try { return NextResponse.json(await (await workspaceApplication()).recoveryCases.command((await params).id, body)); }
 catch (error) { const denied = practiceFailure(error); if(denied)return denied; const failure = recoveryCommandFailure(error); return NextResponse.json(failure.body, { status: failure.status }); }
}
