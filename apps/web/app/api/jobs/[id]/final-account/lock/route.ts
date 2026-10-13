import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSyntheticSession, practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";

const authenticated = async () => hasSyntheticSession((await cookies()).get("jg_session")?.value);
function failure(error: unknown) {
  const denied = practiceFailure(error); if (denied) return denied;
  const code = error instanceof Error ? error.message : "DATABASE_UNAVAILABLE";
  const existingLockId = error !== null && typeof error === "object" && "existingLockId" in error ? error.existingLockId : undefined;
  return NextResponse.json({ code, ...(existingLockId ? { existingLockId } : {}) }, { status: /ALREADY_LOCKED|IDEMPOTENCY|STALE|SOURCE_CHANGED/u.test(code) ? 409 : 400 });
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authenticated()) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try { return NextResponse.json(await (await workspaceApplication()).finalAccountLock.get((await params).id)); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authenticated()) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const body: unknown = await request.json();
    const app = (await workspaceApplication()).finalAccountLock;
    const result = body !== null && typeof body === "object" && "version" in body && body.version === "lock-bound-invoice.issue.v1"
      ? await app.issueInvoice((await params).id, body)
      : await app.lock((await params).id, body);
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}
