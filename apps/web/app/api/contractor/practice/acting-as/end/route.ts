import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PracticeWorkerSwitchError } from "@jobguard/core";
import { createPracticeWorkerSwitchApplication, assertPracticeWorkerSwitchMode, practiceWorkerSwitchHttpFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../origin";
const headers = { "cache-control": "no-store" };
function failure(error: unknown) { const result = practiceWorkerSwitchHttpFailure(error); return NextResponse.json(result.body, { status: result.status, headers }); }
export async function POST(request: Request) {
 if (!isTrustedBrowserOrigin(request)) return failure(new PracticeWorkerSwitchError("ORIGIN_FORBIDDEN"));
 try {
  assertPracticeWorkerSwitchMode();
  const raw: unknown = await request.json().catch(() => undefined);
  if (raw === undefined) throw new PracticeWorkerSwitchError("INVALID_COMMAND");
  const principal = { version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value };
  const application = createPracticeWorkerSwitchApplication({ pool: syntheticPool() });
  return NextResponse.json(await application.end(principal, raw), { headers });
 } catch (error) { return failure(error); }
}
