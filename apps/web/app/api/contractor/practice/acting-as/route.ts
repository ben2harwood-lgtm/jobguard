import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PracticeWorkerSwitchError } from "@jobguard/core";
import { createPracticeWorkerSwitchApplication, assertPracticeWorkerSwitchMode, practiceWorkerSwitchHttpFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../lib/synthetic-server";
const headers = { "cache-control": "no-store" };
function failure(error: unknown) { const result = practiceWorkerSwitchHttpFailure(error); return NextResponse.json(result.body, { status: result.status, headers }); }
export async function GET(request: Request) {
 try {
  assertPracticeWorkerSwitchMode();
  const principal = { version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value };
  const application = createPracticeWorkerSwitchApplication({ pool: syntheticPool() });
  return NextResponse.json(await application.read(principal), { headers });
 } catch (error) { return failure(error); }
}
