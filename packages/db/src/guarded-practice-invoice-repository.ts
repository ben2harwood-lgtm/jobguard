import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { FinalAccountLockError, type FinalAccountLockErrorCode } from "@jobguard/core";
import { PracticeInvoiceRepository } from "./practice-invoice-repository.js";
import { practiceMaterialPool } from "./practice-session.js";
import { withTenant } from "./tenant-context.js";
import { appendAuditBatch } from "./audit.js";

const invoiceRefusals = new Set<FinalAccountLockErrorCode>([
 "FINAL_ACCOUNT_LOCK_REQUIRED", "FINAL_CHECK_NOT_COMPLETE", "FINAL_CHECK_FAILED",
 "FINAL_INVOICE_REVISION_MISMATCH", "FINAL_INVOICE_ALREADY_ISSUED", "INVOICE_SOURCE_CORRECTION_REQUIRED",
]);
/** Keeps merged projections and carries the existing persisted-session digest into SQL. */
export class GuardedPracticeInvoiceRepository extends PracticeInvoiceRepository {
 constructor(pool: Pool, sessionId?: string) {
  super(sessionId ? practiceMaterialPool(pool,createHash("sha256").update(sessionId).digest("hex")) : pool);
 }
 override async issue(context: Parameters<PracticeInvoiceRepository["issue"]>[0], input: Parameters<PracticeInvoiceRepository["issue"]>[1]) {
  try {
   return await withTenant(this.pool,context,async db=>{
    const existing=(await db.$client.query("SELECT 1 FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3",[context.tenantId,input.jobId,input.finalAccountRevisionId])).rowCount;
    const result=(await db.$client.query("SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)",[context.tenantId,input.jobId,input.finalAccountRevisionId,input.actorMembershipId,input.commandId,input.recipient,input.issuedOn])).rows[0];
    // The routine holds the job lock. Replays see the first committed audit and append nothing.
    const audited=(await db.$client.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_invoice.synthetic_issued' AND payload->'references'->>'invoiceId'=$2",[context.tenantId,result.invoice_id])).rowCount;
    if(!existing&&!audited) await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${input.actorMembershipId}`,eventType:"customer_invoice.synthetic_issued",subjectType:"job",subjectRef:input.jobId,payload:{references:{invoiceId:result.invoice_id,finalAccountRevisionId:input.finalAccountRevisionId},hashes:{pdfSha256:result.pdf_sha256,sourceHash:result.source_hash},classifications:{action:"commercial",delivery:"operational"}}}]);
    const row=(await db.$client.query("SELECT * FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2",[context.tenantId,result.invoice_id])).rows[0];
    const pence=(raw:unknown)=>{const n=Number(raw);if(!Number.isSafeInteger(n)||n<0||n>1_000_000_000_000)throw new Error("INVOICE_AMOUNT_INVALID");return n;};
    return {id:row.id,number:row.invoice_number,issuedOn:new Date(row.issued_on).toISOString().slice(0,10),recipient:"practice-customer@example.invalid",pdfSha256:row.pdf_sha256.trim(),finalAccountRevisionId:row.final_account_revision_id,sourceHash:row.source_hash.trim(),netPence:pence(row.net_pence),taxPence:pence(row.tax_pence),totalPence:pence(row.total_pence),balancePence:pence(row.total_pence),customerCreditPence:0,paidPence:0,creditedPence:0,delivery:"simulated_delivery" as const};
   });
  } catch (error) {
   const message = error instanceof Error ? error.message : undefined;
   if (message && invoiceRefusals.has(message as FinalAccountLockErrorCode)) throw new FinalAccountLockError(message as FinalAccountLockErrorCode);
   throw error;
  }
 }
}
