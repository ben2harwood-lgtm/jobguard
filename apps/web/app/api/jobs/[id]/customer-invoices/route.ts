import { FinalAccountLockError } from "@jobguard/core";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession, practiceFailure } from "../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../lib/workspace-server";

const noStore = { "Cache-Control": "no-store" };
const auth = async () => hasSyntheticSession((await cookies()).get("jg_session")?.value);
function failure(error: unknown) {
 const denied = practiceFailure(error);
 if (denied) return denied;
 if (error instanceof FinalAccountLockError) {
  return NextResponse.json({ version: "final-check-invoice-error.v1", code: error.code }, { status: 409, headers: noStore });
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
 catch (error) { return failure(error); }
}
