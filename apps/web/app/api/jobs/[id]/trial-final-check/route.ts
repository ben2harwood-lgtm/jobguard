import { NextResponse } from "next/server";
import { z } from "zod";
import { identityStatus } from "@jobguard/api/identity";
import { CompanyFinalCheckError, CompanyFinalCheckRepository } from "@jobguard/db";
import { identityApplication, identityCredentials } from "../../../../lib/identity-server";
import { syntheticPool } from "../../../../lib/synthetic-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const envelope = z.object({ action: z.enum(["read", "acceptTerms", "disposition", "lock", "requestRun", "reveal"]), input: z.object({ jobId: z.string().uuid() }).passthrough() }).strict();
/** Company credentials only. The six existing SQL routines own all job/replay authority. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 try {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "DEMO_SYNTHETIC_ONLY" }, { status: 403, headers });
  const context = await identityApplication().context(await identityCredentials(request));
  const parsed = envelope.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new URL(request.url).search || parsed.data.input.jobId !== (await params).id) return NextResponse.json({ code: "INVALID_COMPANY_FINAL_CHECK_INPUT" }, { status: 400, headers });
  const repository = new CompanyFinalCheckRepository(syntheticPool());
  const result = await repository[parsed.data.action](context, parsed.data.input);
  return NextResponse.json(result, { headers });
 } catch (error) {
  if (error instanceof CompanyFinalCheckError) {
   const status = error.code === "COMPANY_FINAL_CHECK_FORBIDDEN" ? 403 : /STALE|CONFLICT|ALREADY|BUSY/u.test(error.code) ? 409 : 400;
   return NextResponse.json({ code: error.code }, { status, headers });
  }
  const identity = identityStatus(error);
  // Unknown database errors must never disclose foreign or hidden sources.
  return NextResponse.json({ code: identity.status < 500 ? identity.code : "FINAL_CHECK_UNAVAILABLE" }, { status: identity.status < 500 ? identity.status : 503, headers });
 }
}
