import "server-only";
import { z } from "zod";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ContractorError, ExtraCommercialReadError } from "@jobguard/core";
import { contractorSessionContext, ExtraCommercialReadRepository } from "@jobguard/db";
import { syntheticPool } from "../../../lib/synthetic-server";

/** Shared transport for the read-only extra commercial reads (contract extra-commercial-reads-v1). Contractor session cookie only. */
export const commercialJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
export async function commercialReader() {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ExtraCommercialReadError("MODE_FORBIDDEN");
 const session = (await cookies()).get("jg_session")?.value;
 if (!session || !z.guid().safeParse(session).success) throw new ExtraCommercialReadError("UNAUTHENTICATED");
 const pool = syntheticPool();
 const context = await contractorSessionContext(pool, session);
 return { repository: new ExtraCommercialReadRepository(pool), context, session };
}
const STATUS: Record<string, number> = { INVALID_QUERY: 400, UNAUTHENTICATED: 401, PERMISSION_DENIED: 403, MODE_FORBIDDEN: 403, NOT_FOUND: 404, INCONSISTENT_WORK_INPUT: 409, DATABASE_UNAVAILABLE: 503 };
export function commercialFailure(error: unknown) {
 const code = error instanceof ExtraCommercialReadError ? error.code : error instanceof ContractorError && (error.code === "UNAUTHENTICATED" || error.code === "MODE_FORBIDDEN") ? error.code : "DATABASE_UNAVAILABLE";
 const safe = code in STATUS ? code : "DATABASE_UNAVAILABLE";
 return commercialJson({ version: "extra-commercial-read-error.v1", code: safe }, STATUS[safe]);
}
/** Only `clientContractId` may narrow a per-extra read; any other query parameter is refused. */
export function contractOption(request: Request): { clientContractId?: string } {
 const params = new URL(request.url).searchParams;
 for (const key of params.keys()) if (key !== "clientContractId") throw new ExtraCommercialReadError("INVALID_QUERY");
 if (params.getAll("clientContractId").length > 1) throw new ExtraCommercialReadError("INVALID_QUERY");
 const value = params.get("clientContractId");
 return value === null ? {} : { clientContractId: value };
}
const SINGLE = ["orderReference", "rateCode", "clientContractId", "teamId", "raisedFrom", "raisedTo"] as const;
/** Work-list filters from the query string: `state` may repeat; every other filter appears at most once; unknown keys are refused. */
export function workListQuery(request: Request): Record<string, unknown> {
 const params = new URL(request.url).searchParams;
 const query: Record<string, unknown> = { version: "extra-work-list-query.v1" };
 for (const key of new Set(params.keys())) {
  if (key === "state") { query.states = params.getAll("state"); continue; }
  if (!(SINGLE as readonly string[]).includes(key) || params.getAll(key).length !== 1) throw new ExtraCommercialReadError("INVALID_QUERY");
  query[key] = params.get(key);
 }
 return query;
}
