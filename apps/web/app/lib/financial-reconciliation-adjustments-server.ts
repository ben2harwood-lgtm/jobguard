import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { financialReconciliationAdjustmentV1 } from "@jobguard/core";
import { contractorSessionContext, FinancialReconciliationQueueRepository, type VerifiedTenantContext } from "@jobguard/db";
import { syntheticPool } from "./synthetic-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

const uuid = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/u);
// Scope is injected only after session resolution. Unknown authority fields fail
// closed at every nesting level; the repository validates the bound command too.
const adjustment = z.object({
 version: financialReconciliationAdjustmentV1.shape.version, commandId: uuid,
 reportHash: hash, invoiceRevision: uuid,
 fact: financialReconciliationAdjustmentV1.shape.fact.unwrap().omit({ tenantId: true, jobId: true }).optional(),
 correction: financialReconciliationAdjustmentV1.shape.correction.unwrap().omit({ tenantId: true, jobId: true }).optional(),
}).strict().refine(c => (c.fact !== undefined) !== (c.correction !== undefined));
const propose = z.object({ version: z.literal("financial-reconciliation-propose.v1"), runId: uuid, adjustment }).strict();
const approve = z.object({ version: z.literal("financial-reconciliation-approve.v1"), commandId: uuid, jobId: uuid, adjustmentId: uuid, contentHash: hash }).strict();
const command = z.union([propose, approve]);
const headers = { "cache-control": "no-store" };
const messages: Record<string, string> = {
 NOT_FOUND: "This reconciliation run is unavailable.",
 RECONCILIATION_FORBIDDEN: "Your current session does not have finance access to this run.",
 RECONCILIATION_CONFLICT: "The report or adjustment has changed. Reload and review the exact content before trying again.",
 RECONCILIATION_SELF_APPROVAL: "Another finance user must approve your proposal.",
 INVALID_RECONCILIATION: "The correction was refused. Check its fields; company, actor, status and approval flags cannot be supplied.",
 ORIGIN_FORBIDDEN: "This request must come from the JobGuard page.",
 OUTCOME_UNKNOWN: "The result is uncertain. Retry the same command to check its outcome.",
};
function refuse(code: string): never { throw new Error(code); }
export async function financialReconciliationAdjustmentsResponse(request: Request, params: Promise<{ id: string; runId: string }>) {
 try {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") refuse("NOT_FOUND");
  if (request.method === "POST" && !isTrustedBrowserOrigin(request)) refuse("ORIGIN_FORBIDDEN");
  const { id, runId } = z.object({ id: uuid, runId: uuid }).strict().parse(await params);
  const session = (await cookies()).get("jg_session")?.value;
  if (!session || !uuid.safeParse(session).success) refuse("RECONCILIATION_FORBIDDEN");
  const pool = syntheticPool();
  const context: VerifiedTenantContext = await contractorSessionContext(pool, session!);
  const repo = new FinancialReconciliationQueueRepository(pool);
  const stored = await repo.read(context, session!, id, runId);
  if (!stored) refuse("NOT_FOUND");
  if (request.method === "GET") {
   const adjustments = await repo.readAdjustments(context, session!, id, runId);
   if (!adjustments) refuse("NOT_FOUND");
   // A starting example, never an automatic proposal or a client calculation.
   const payment = stored.snapshot.provider.find(p => p.kind === "payment" && stored.report.queue.some(q => q.code === "MISSING_OR_DUPLICATE_JOURNAL" && q.refs.includes(p.id)));
   const invoice = stored.snapshot.invoices.find(i => i.id === payment?.invoiceId);
   const template = payment && invoice ? {
    version: "financial-reconciliation-adjustment.v1", reportHash: stored.report.sourceHash, invoiceRevision: invoice.revision,
    fact: { id: crypto.randomUUID(), invoiceId: invoice.id, kind: "payment", amount: payment.amount, sourceId: payment.id },
   } : null;
   return NextResponse.json({ runId, report: stored.report, adjustments, template }, { headers });
  }
  const input = command.parse(await request.json().catch(() => refuse("INVALID_RECONCILIATION")));
  let result: unknown;
  if (input.version === "financial-reconciliation-propose.v1") {
   if (input.runId !== runId) refuse("RECONCILIATION_CONFLICT");
   const a = input.adjustment, scope = { tenantId: context.tenantId, jobId: id };
   result = await repo.propose(context, session!, { ...input, adjustment: { ...a, ...scope,
    ...(a.fact ? { fact: { ...a.fact, ...scope } } : {}), ...(a.correction ? { correction: { ...a.correction, ...scope } } : {}),
   } });
  } else {
   if (input.jobId !== id) refuse("RECONCILIATION_FORBIDDEN");
   const rows = await repo.readAdjustments(context, session!, id, runId);
   if (!rows?.some(r => r.adjustmentId === input.adjustmentId)) refuse("NOT_FOUND");
   result = await repo.approve(context, session!, input);
  }
  return NextResponse.json({ result, message: "Saved for simulation review only. Nothing is posted or collected." }, { headers });
 } catch (error) {
  const message = error instanceof Error ? error.message : "";
  const sqlCode = error && typeof error === "object" && "code" in error ? error.code : null;
  const code = sqlCode === "23505" ? "RECONCILIATION_CONFLICT" : error instanceof z.ZodError ? "INVALID_RECONCILIATION" : messages[message] ? message
   : ["UNAUTHENTICATED", "EXTRA_FORBIDDEN", "ENTERPRISE_FEE_FORBIDDEN", "MODE_FORBIDDEN"].includes(message) ? "RECONCILIATION_FORBIDDEN" : "OUTCOME_UNKNOWN";
  const status = code === "NOT_FOUND" ? 404 : code === "INVALID_RECONCILIATION" ? 422 : code === "RECONCILIATION_CONFLICT" ? 409 : code === "OUTCOME_UNKNOWN" ? 503 : 403;
  return NextResponse.json({ version: "financial-reconciliation-adjustments-error.v1", code, message: messages[code] }, { status, headers });
 }
}
