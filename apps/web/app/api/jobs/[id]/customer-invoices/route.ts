import { FinalAccountLockError } from "@jobguard/core";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasSyntheticSession, practiceFailure } from "../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../lib/workspace-server";

const noStore = { "Cache-Control": "no-store" };
const auth = async () => hasSyntheticSession((await cookies()).get("jg_session")?.value);
// Preserve the merged route's known failures without publishing arbitrary diagnostics.
const publicFailures = new Map<string, number>([
 ["STALE_FINAL_ACCOUNT_AUTHORIZATION", 409],
 ["STALE_OR_BLOCKED_FINAL_ACCOUNT", 409],
 ["IDEMPOTENCY_PAYLOAD_CONFLICT", 400],
 ["SYNTHETIC_RECIPIENT_REQUIRED", 400],
 ["FORBIDDEN", 400],
 ["NOT_FOUND", 400],
 ["JOB_PARTIES_REQUIRED", 400],
 ["INVOICE_AMOUNT_INVALID", 400],
 ["FINAL_ACCOUNT_TOTAL_MISMATCH", 400],
 ["DATABASE_UNAVAILABLE", 400],
]);
function failure(error: unknown, issuing = false) {
 const denied = practiceFailure(error);
 if (denied) return denied;
 if (error instanceof FinalAccountLockError) {
  return NextResponse.json({ version: "final-check-invoice-error.v1", code: error.code }, { status: 409, headers: noStore });
 }
 if (error instanceof ZodError || error instanceof SyntaxError) {
  return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400, headers: noStore });
 }
 if (!(error instanceof Error)) {
  return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 400, headers: noStore });
 }
 const status = publicFailures.get(error.message);
 if (status !== undefined) {
  return NextResponse.json({ code: error.message }, { status: issuing ? status : 400, headers: noStore });
 }
 // SQL diagnostics and other unexpected failures are never a public error code.
 return NextResponse.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 500, headers: noStore });
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 if (!await auth()) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: noStore });
 try { return NextResponse.json(await (await workspaceApplication()).customerInvoice.get((await params).id), { headers: noStore }); }
 catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 if (!await auth()) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: noStore });
 try { return NextResponse.json(await (await workspaceApplication()).customerInvoice.issue((await params).id, await request.json()), { headers: noStore }); }
 catch (error) { return failure(error, true); }
}
