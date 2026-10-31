import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ReceiptCaseAllocationApplication, receiptCaseAllocationFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../lib/synthetic-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "no-store" };
async function run(request: Request, { params }: Context, write: boolean) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "SYNTHETIC_MODE_REQUIRED" }, { status: 403, headers });
 try {
  if (request.headers.has("x-tenant-id")) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers });
  const application = new ReceiptCaseAllocationApplication(syntheticPool(), (await cookies()).get("jg_session")?.value);
  const jobId = (await params).id;
  // Authenticate even malformed queries, before reporting command diagnostics.
  if (new URL(request.url).searchParams.size) {
   await application.view(jobId, Object.fromEntries(new URL(request.url).searchParams));
   return NextResponse.json({ code: "INVALID_RECEIPT_CASE_QUERY" }, { status: 400, headers });
  }
  return NextResponse.json(write ? await application.command(jobId, () => request.json()) : await application.view(jobId), { headers });
 } catch (error) {
  const failure = receiptCaseAllocationFailure(error);
  return NextResponse.json({ code: failure.code }, { status: failure.status, headers });
 }
}
export function GET(request: Request, context: Context) { return run(request, context, false); }
export function POST(request: Request, context: Context) { return run(request, context, true); }
