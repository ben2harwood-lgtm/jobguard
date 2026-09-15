import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SYNTHETIC_SESSION, hasSyntheticSession, syntheticWorkspace } from "../../lib/synthetic-server";

export async function GET() {
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const workspace = await syntheticWorkspace();
  return NextResponse.json({ version: 1, principal: { displayName: "Alex Builder" }, tenants: workspace.tenants });
}
export async function POST() {
  await syntheticWorkspace();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("jg_session", SYNTHETIC_SESSION, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return response;
}
