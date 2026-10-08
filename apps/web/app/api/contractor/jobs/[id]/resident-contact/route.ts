import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createContractorPartiesApplication, contractorPartiesHttpFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../lib/synthetic-server";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const principal = { version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value };
    return NextResponse.json(await createContractorPartiesApplication({ pool: syntheticPool() }).readResident(principal, id), { headers: { "cache-control": "no-store" } });
  } catch (error) { const failure = contractorPartiesHttpFailure(error); return NextResponse.json(failure.body, { status: failure.status, headers: { "cache-control": "no-store" } }); }
}
