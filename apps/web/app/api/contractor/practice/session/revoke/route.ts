import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ContractorPracticeSessionError } from "@jobguard/core";
import { assertContractorPracticeSessionMode, contractorPracticeSessionHttpFailure, createContractorPracticeSessionApplication } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../origin";
export async function POST(request: Request) {
 try {
  if (!isTrustedBrowserOrigin(request)) throw new ContractorPracticeSessionError("ORIGIN_FORBIDDEN");
  assertContractorPracticeSessionMode();
  let body: unknown;
  try { body = await request.json(); } catch { throw new ContractorPracticeSessionError("INVALID_COMMAND"); }
  const principal = { version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value };
  const application = createContractorPracticeSessionApplication({ pool: syntheticPool() });
  return NextResponse.json(await application.revoke(principal, body), { headers: { "cache-control": "no-store" } });
 } catch (error) { const failure = contractorPracticeSessionHttpFailure(error); return NextResponse.json(failure.body, { status: failure.status, headers: { "cache-control": "no-store" } }); }
}
