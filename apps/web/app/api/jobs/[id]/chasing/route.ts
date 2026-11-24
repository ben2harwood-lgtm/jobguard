import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { V2ChaseRepository, V2ChaseError, requireV2Chasing } from "@jobguard/db";
import { enforcePracticePair } from "../../../../lib/linked-practice-entry";
import { practiceFailure, syntheticPool } from "../../../../lib/synthetic-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function execute(request: Request, params: Promise<{ id: string }>, write: boolean) {
  try {
    requireV2Chasing();
    const token = (await cookies()).get("jg_session")?.value;
    await enforcePracticePair(syntheticPool(), token);
    if (write && request.headers.get("origin") !== new URL(request.url).origin)
      return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
    const repository = new V2ChaseRepository(syntheticPool());
    const { id } = await params;
    return NextResponse.json(write ? await repository.command(token, id, await request.json().catch(() => null))
      : await repository.read(token, id), { headers });
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    const code = error instanceof V2ChaseError ? error.code : "CHASE_UNAVAILABLE";
    return NextResponse.json({ version: "v2-chase-error.v1", code }, {
      status: code === "CHASE_INVALID" ? 400 : code === "CHASE_DARK" ? 404 : code === "CHASE_CONFLICT" ? 409 : 503, headers,
    });
  }
}
export const GET = (request: Request, { params }: { params: Promise<{ id: string }> }) => execute(request, params, false);
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) => execute(request, params, true);
