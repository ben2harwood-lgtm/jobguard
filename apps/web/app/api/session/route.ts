import { practiceFailure } from "../../lib/synthetic-server";
import { issuePracticeSession } from "@jobguard/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { syntheticPool, hasSyntheticSession, syntheticWorkspace } from "../../lib/synthetic-server";

export async function GET() {
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try { const workspace = await syntheticWorkspace(); return NextResponse.json({ version: 1, principal: { displayName: "Alex Builder" }, tenants: workspace.tenants }); }
  catch (practiceError){const denied=practiceFailure(practiceError);if(denied)return denied; return NextResponse.json({ code: "DATABASE_UNAVAILABLE", recoverable: true }, { status: 503 }); }
}
export async function POST(request: Request) {
  let token:string;
  try { token=await issuePracticeSession(syntheticPool()); } catch (practiceError){const denied=practiceFailure(practiceError);if(denied)return denied; return NextResponse.json({ code: "DATABASE_UNAVAILABLE", recoverable: true }, { status: 503 }); }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("jg_session", token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/" });
  return response;
}
