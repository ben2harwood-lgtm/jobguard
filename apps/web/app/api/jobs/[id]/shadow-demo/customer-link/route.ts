import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ShadowDemoGuideApplication, shadowDemoGuideFailure } from "@jobguard/api/workspace";
import { identityApplication } from "../../../../../lib/identity-server";
import { syntheticPool } from "../../../../../lib/synthetic-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
// Demo-only (DEMO-J3): the general customer-portal issue route still needs a signed-in identity.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "SYNTHETIC_MODE_REQUIRED" }, { status: 403, headers });
 try {
  const identity = identityApplication();
  if (request.headers.get("origin") !== identity.allowedOrigin) return NextResponse.json({ code: "CUSTOMER_REFUSED" }, { status: 409, headers });
  const body = await request.json().catch(() => null);
  return NextResponse.json(await new ShadowDemoGuideApplication(syntheticPool(), (await cookies()).get("jg_session")?.value)
   .issueCustomerLink((await params).id, body, value => identity.provider.digest(value)), { headers });
 } catch (error) { const failure = shadowDemoGuideFailure(error); return NextResponse.json({ code: failure.code }, { status: failure.status, headers }); }
}
