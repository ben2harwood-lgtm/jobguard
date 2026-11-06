import "server-only";
import { z } from "zod";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ContractorRepository, contractorSessionContext, ExtraApprovalError, DuplicateDispositionError } from "@jobguard/db";
import { ExtraPersistenceError } from "@jobguard/core";
import { syntheticPool } from "../../../../../lib/synthetic-server";
export const duplicateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
export async function duplicateActor() {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw Object.assign(new Error(), { code: "MODE_FORBIDDEN" });
 const sessionId = (await cookies()).get("jg_session")?.value;
 if (!sessionId || !z.guid().safeParse(sessionId).success) throw Object.assign(new Error(), { code: "UNAUTHENTICATED" });
 const pool = syntheticPool();
 const actor = await new ContractorRepository(pool).resolveSession(sessionId);
 const context = await contractorSessionContext(pool, sessionId);
 return { pool, actor, context, sessionId };
}
export function duplicateFailure(error: unknown) {
 const code = (error as { code?: string } | null)?.code;
 const known = error instanceof DuplicateDispositionError || error instanceof ExtraApprovalError || error instanceof ExtraPersistenceError || ["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "INVALID_COMMAND"].includes(code ?? "");
 const safe = known ? code! : "DATABASE_UNAVAILABLE";
 const status = safe === "UNAUTHENTICATED" ? 401 : ["MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "PERMISSION_DENIED", "UNLINK_FORBIDDEN", "SELF_DISMISSAL"].includes(safe) ? 403 : safe === "NOT_FOUND" ? 404 : safe === "INVALID_COMMAND" ? 400 : safe === "DATABASE_UNAVAILABLE" ? 503 : 409;
 return duplicateJson({ version: "extra-duplicate-error.v1", code: safe }, status);
}
