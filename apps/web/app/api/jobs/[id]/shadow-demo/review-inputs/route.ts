import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ShadowDemoGuideApplication, shadowDemoGuideFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
// Demo-only (DEMO-J3): after lock, the work identity and exact review hash of confirmed catches.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "SYNTHETIC_MODE_REQUIRED" }, { status: 403, headers });
 try { return NextResponse.json(await new ShadowDemoGuideApplication(syntheticPool(), (await cookies()).get("jg_session")?.value).reviewInputs((await params).id), { headers }); }
 catch (error) { const failure = shadowDemoGuideFailure(error); return NextResponse.json({ code: failure.code }, { status: failure.status, headers }); }
}
