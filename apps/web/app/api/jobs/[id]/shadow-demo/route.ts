import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ShadowDemoApplication } from "@jobguard/api/workspace";
import { syntheticPool, practiceFailure } from "../../../../lib/synthetic-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const headers = { "Cache-Control": "no-store" };
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "SYNTHETIC_MODE_REQUIRED" }, { status: 403, headers });
 try {
  const report = await new ShadowDemoApplication(syntheticPool(), (await cookies()).get("jg_session")?.value)
   .read((await params).id, Object.fromEntries(new URL(request.url).searchParams));
  return NextResponse.json(report, { headers });
 } catch (error) {
  const denied = practiceFailure(error);
  if (denied) { denied.headers.set("Cache-Control", "no-store"); return denied; }
  if (error instanceof Error && "code" in error && error.code === "INVALID_SHADOW_DEMO_QUERY") return NextResponse.json({ code: "INVALID_SHADOW_DEMO_QUERY" }, { status: 400, headers });
  return NextResponse.json({ code: "SHADOW_DEMO_UNAVAILABLE" }, { status: 503, headers });
 }
}
