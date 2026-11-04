import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ShadowDemoGuideApplication, shadowDemoGuideFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ id: string }> };
// Demo-only (DEMO-J3): the worker holds signals from saved sources. Its answer never says what it held.
async function run({ params }: Context, write: boolean) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "SYNTHETIC_MODE_REQUIRED" }, { status: 403, headers });
 try {
  const app = new ShadowDemoGuideApplication(syntheticPool(), (await cookies()).get("jg_session")?.value), id = (await params).id;
  return NextResponse.json(write ? await app.requestSourceHold(id) : await app.sourceHoldState(id), { headers });
 } catch (error) { const failure = shadowDemoGuideFailure(error); return NextResponse.json({ code: failure.code }, { status: failure.status, headers }); }
}
export function GET(_request: Request, context: Context) { return run(context, false); }
export function POST(_request: Request, context: Context) { return run(context, true); }
