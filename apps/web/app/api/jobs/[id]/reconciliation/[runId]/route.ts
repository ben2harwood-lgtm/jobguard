import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { contractorSessionContext, FinancialReconciliationQueueRepository, type VerifiedTenantContext } from "@jobguard/db";
import { syntheticPool } from "../../../../../lib/synthetic-server";
import { reconciliationReportResponseV1 } from "../../../../../lib/financial-reconciliation-report";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
 const headers = { "Cache-Control": "no-store" };
 const error = (code: string, status: number) => NextResponse.json({ version: "financial-reconciliation-screen-error.v1", code }, { status, headers });
 try {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return error("MODE_FORBIDDEN", 403);
  const session = (await cookies()).get("jg_session")?.value;
  if (!z.string().uuid().safeParse(session).success) return error("UNAUTHENTICATED", 401);
  const parsed = z.object({ id: z.string().uuid(), runId: z.string().uuid() }).strict().safeParse(await params);
  if (!parsed.success) return error("INVALID_RECONCILIATION", 400);
  const { id, runId } = parsed.data, pool = syntheticPool();
  const context: VerifiedTenantContext = await contractorSessionContext(pool, session!);
  const stored = await new FinancialReconciliationQueueRepository(pool).read(context, session!, id, runId);
  if (!stored) return error("NOT_FOUND", 404);
  return NextResponse.json(reconciliationReportResponseV1.parse({ version: "financial-reconciliation-screen.v1", jobId: id, runId, report: stored.report }), { headers });
 } catch (e) {
  const code = (e as { code?: string })?.code;
  if (code === "UNAUTHENTICATED") return error(code, 401);
  if (["42501", "FORBIDDEN", "RECONCILIATION_FORBIDDEN"].includes(code ?? "")) return error("RECONCILIATION_FORBIDDEN", 403);
  if (code === "NOT_FOUND") return error(code, 404);
  return error("REPORT_UNAVAILABLE", 503);
 }
}
