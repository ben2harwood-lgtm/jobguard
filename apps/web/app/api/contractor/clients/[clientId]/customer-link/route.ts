import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createContractorPartiesApplication, contractorPartiesHttpFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../origin";
export async function POST(request: Request, context: { params: Promise<{ clientId: string }> }) {
  if (!isTrustedBrowserOrigin(request)) return NextResponse.json({ version: "contractor-parties-error.v1", code: "NOT_FOUND", recoverable: false }, { status: 404 });
  try {
    const { clientId } = await context.params;
    const principal = { version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value };
    const body: unknown = await request.json().catch(() => undefined);
    return NextResponse.json(await createContractorPartiesApplication({ pool: syntheticPool() }).linkCustomer(principal, clientId, body), { headers: { "cache-control": "no-store" } });
  } catch (error) { const failure = contractorPartiesHttpFailure(error); return NextResponse.json(failure.body, { status: failure.status, headers: { "cache-control": "no-store" } }); }
}
