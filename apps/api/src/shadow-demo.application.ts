import type { Pool } from "pg";
import { z } from "zod";
import { ShadowDemoApprovalReader, ValueV3Reader } from "@jobguard/db";
import { receiptBaseSources, recoveryAttributionRevisionV1 } from "@jobguard/core";
import { PracticeAccess } from "./practice-access.js";
import { FinalAccountLockApplication } from "./final-account-lock.application.js";
import { FinalCheckApplication } from "./final-check.application.js";
import { RecoveryAttributionApplication } from "./recovery-attribution.application.js";
import { attributionValueReceipt } from "./recovery-attribution-value.js";
import { CustomerInvoiceApplication } from "./customer-invoice.application.js";
import { heldJobValueV3, ValueV3Application, type JobValueResponseV3 } from "./value/value-v3.application.js";
import { EvidencePackApplication } from "./evidence-pack.application.js";

export class ShadowDemoQueryError extends Error {
 readonly code = "INVALID_SHADOW_DEMO_QUERY";
 constructor() { super("INVALID_SHADOW_DEMO_QUERY"); }
}

const total = (values: readonly (number | null)[]) => values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
type ShadowRead = {
 account: Awaited<ReturnType<FinalAccountLockApplication["get"]>>;
 invoices: Awaited<ReturnType<CustomerInvoiceApplication["get"]>>;
 value: JobValueResponseV3;
 customerApproval: { state: string; approvals: readonly unknown[] };
};
type ShadowPosted = {
 finalCheck: Awaited<ReturnType<FinalCheckApplication["get"]>>;
 assessments: { assessment: z.infer<typeof recoveryAttributionRevisionV1> }[];
 packs: { caseId: string; result: Awaited<ReturnType<EvidencePackApplication["listV3"]>> }[];
};
/** DEMO-S shadow-30000: true only when every one of the nine steps is on saved
 * records for this job, at its exact figures. Nothing here reads a client flag. */
export function shadowJourneyComplete({ account: view, invoices, value, customerApproval }: ShadowRead, { finalCheck, assessments, packs }: ShadowPosted) {
 const account = view.account, lock = view.lock;
 if (!account || !lock || finalCheck.state !== "completed" || finalCheck.lockId !== lock.id || value.status !== "mapped") return false;
 const captured = (origin: string) => total(view.captures.filter(row => row.origin === origin && row.state === "approved").map(row => row.netPence));
 const { receipt } = value, invoice = invoices.invoices[0];
 const evidence = finalCheck.items.flatMap(item => item.evidence as { source: string; evidenceAfterLock: boolean }[]);
 const principals = assessments.map(({ assessment }) => assessment.remainingPrincipal);
 const steps = [
  // 1. The £30,000 accepted baseline. 2. £3,200 logged extras.
  total(account.lines.filter(line => line.kind === "baseline").map(line => line.netPence)) === 3000000,
  captured("builder_logged") === 320000,
  // 3. Pre-lock photo and diary signals; the supplier document was kept and examined.
  evidence.length === 2 && evidence.every(row => !row.evidenceAfterLock) && evidence.filter(row => row.source === "job_diary_text").length === 1,
  packs.length === 2 && packs.every(({ result }) => result.packs.some(pack => pack.sources.some(source => source.sourceId.startsWith("supplier_document_version:")))),
  // 4 and 5. £400 at review and the immutable £33,600 lock.
  captured("final_review") === 40000,
  total((lock.snapshot as { lines: { netPence: number }[] }).lines.map(line => line.netPence)) === 3360000,
  // 6. The two revealed extras, each approved by the customer through the portal.
  customerApproval.state === "approved" && customerApproval.approvals.length === 2,
  finalCheck.items.length === 2 && finalCheck.items.every(item => item.disposition === "confirmed_extra"),
  principals.length === 2 && principals.every(net => net.denominator === "1") && principals.map(net => net.numerator).sort().join() === "30000,50000",
  // 7. One paid invoice on the current bill, with a settled, allocated payment behind each catch.
  invoices.invoices.length === 1 && invoice !== undefined && invoice.finalAccountRevisionId === account.id && invoice.netPence === 3440000 && invoice.totalPence === 4128000 && invoice.balancePence === 0,
  assessments.every(({ assessment }) => assessment.assessmentOutcome === "eligible_for_review" && assessment.facts.facts.customer_payment_settled_and_allocated_to_that_line?.holds === true),
  // 8. Current Q, fee and retained figures, not old assessments.
  receiptBaseSources(receipt).foundComplete && receiptBaseSources(receipt).assessments.every(row => row.current) && receipt.found.state === "mapped"
   && receipt.found.recovered?.pence === 80000 && receipt.found.fee?.pence === 8000 && receipt.found.yoursBeforeVatAndTax?.pence === 72000,
  // 9. £3,600 fee-free, and an approved pack proving each catch's own chain.
  receipt.tracked.pence === 360000 && receipt.trackedFee.pence === 0,
  assessments.every(({ assessment }) => packs.find(row => row.caseId === assessment.caseId)?.result.packs.some(pack => pack.attachmentApprovalRecorded && pack.contentMatches
   && pack.manifest.sections.every(section => section.status === "present")
   && pack.sources.some(source => source.sourceId === `recovery_attribution_revision:${assessment.assessmentId}`))),
 ];
 return steps.every(Boolean);
}

/** Compose public producers only. No hidden sources, counts or detector imports.
 * Before lock even the reveal/history/pack ports are unreachable. A saved
 * assessment remains historical and unreviewed, including after a reversal. */
export class ShadowDemoApplication {
 private readonly access: PracticeAccess;
 constructor(private readonly pool: Pool, private readonly sessionId?: string) {
  this.access = new PracticeAccess(pool, sessionId);
 }
 async read(jobId: string, query: unknown = {}) {
  const auth = await this.access.job(jobId);
  if (!z.object({}).strict().safeParse(query).success) throw new ShadowDemoQueryError();
  const account = await new FinalAccountLockApplication(this.pool, this.sessionId).get(jobId);
  const invoices = await new CustomerInvoiceApplication(this.pool, this.sessionId).get(jobId);
  const value = account.lock
   ? await new ValueV3Application(this.pool, this.sessionId, new ValueV3Reader(this.pool, this.sessionId)).readJob(jobId)
   : heldJobValueV3(jobId);
  if (value.status === "mapped" && receiptBaseSources(value.receipt).lockId !== account.lock?.id) throw new Error("SHADOW_DEMO_SOURCE_REJECTED");
  // These are builder-visible records. Holding a signal cannot alter them.
  const visible = {
   version: "shadow-demo-report.v2" as const, environment: "synthetic_demo" as const,
   jobId, status: "incomplete" as "incomplete" | "complete", realExternalActions: 0 as const,
   customerApproval: { state: "not_ready_yet" as "not_ready_yet" | "awaiting_customer" | "approved",
    approvals: [] as { variationId: string; approvedAt: string; method: "customer_portal" }[] }, account, invoices, value,
  };
  if (!account.lock) return visible;
  const finalCheck = await new FinalCheckApplication(this.pool, this.sessionId).get(jobId);
  if (finalCheck.lockId !== account.lock.id) throw new Error("SHADOW_DEMO_SOURCE_REJECTED");
  if (finalCheck.state !== "completed") return { ...visible, finalCheck };
  const customer = await new ShadowDemoApprovalReader(this.pool, this.sessionId).read(jobId);
  visible.customerApproval.approvals = customer.approvals;
  if (customer.complete) visible.customerApproval.state = "approved";
  else if (finalCheck.items.length > 0 || customer.approvals.length > 0) visible.customerApproval.state = "awaiting_customer";
  const history = await new RecoveryAttributionApplication(this.pool, this.sessionId).get(jobId);
  const latest = new Map<string, z.infer<typeof recoveryAttributionRevisionV1>>();
  for (const raw of history.revisions) {
   const revision = recoveryAttributionRevisionV1.parse(raw);
   if (revision.tenantId !== auth.context.tenantId || revision.jobId !== jobId) throw new Error("SHADOW_DEMO_SOURCE_REJECTED");
   if (revision.lockId !== account.lock.id) throw new Error("SHADOW_DEMO_SOURCE_REJECTED");
   const key = JSON.stringify([revision.caseId, revision.workId, revision.lineId, revision.lockId]);
   const previous = latest.get(key);
   if (!previous || revision.revision > previous.revision) latest.set(key, revision);
  }
  // Never sum per-line rounded fees, or call an old eligible assessment current Q.
  const assessments = [...latest.values()].map(revision => ({
   assessment: revision, illustrationAsAssessed: attributionValueReceipt(revision),
  }));
  const packs = [];
  for (const caseId of new Set(assessments.map(item => item.assessment.caseId))) {
   packs.push({ caseId, result: await new EvidencePackApplication(this.pool).listV3(this.sessionId, caseId) });
  }
  return { ...visible, finalCheck, assessments, packs,
   status: shadowJourneyComplete(visible, { finalCheck, assessments, packs }) ? "complete" as const : "incomplete" as const };
 }
}
