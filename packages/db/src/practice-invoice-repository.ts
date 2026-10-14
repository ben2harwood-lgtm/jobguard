import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const amounts = `COALESCE((SELECT sum(c.amount_pence) FROM app.customer_credit_note c WHERE(c.tenant_id,c.invoice_id)=(i.tenant_id,i.id)),0) credited_pence,
 COALESCE((SELECT sum(p.amount_pence) FROM app.customer_payment p WHERE(p.tenant_id,p.invoice_id)=(i.tenant_id,i.id) AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE(r.tenant_id,r.payment_id)=(p.tenant_id,p.id))),0) paid_pence`;
function checkedPence(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000_000_000) throw new Error("INVOICE_AMOUNT_INVALID");
  return n;
}
export class PracticeInvoiceRepository {
 constructor(readonly pool: Pool) {}
 private map(row: any) {
  const total=checkedPence(row.total_pence), credited=checkedPence(row.credited_pence??0), paid=checkedPence(row.paid_pence??0), debt=Math.max(0,total-credited);
  return {id:row.id,number:row.invoice_number,issuedOn:new Date(row.issued_on).toISOString().slice(0,10),recipient:"practice-customer@example.invalid",pdfSha256:row.pdf_sha256.trim(),finalAccountRevisionId:row.final_account_revision_id,sourceHash:row.source_hash.trim(),netPence:checkedPence(row.net_pence),taxPence:checkedPence(row.tax_pence),totalPence:total,balancePence:Math.max(0,debt-paid),customerCreditPence:Math.max(0,paid-debt),paidPence:paid,creditedPence:credited,delivery:"simulated_delivery" as const};
 }
 async list(context:VerifiedTenantContext,jobId:string) {
  return withTenant(this.pool,context,async db=>(await db.$client.query<any>(`SELECT i.*,${amounts} FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2 ORDER BY i.created_at,i.id`,[context.tenantId,jobId])).rows.map(row=>this.map(row)));
 }
 async issue(context:VerifiedTenantContext,input:{jobId:string;finalAccountRevisionId:string;actorMembershipId:string;commandId:string;recipient:string;issuedOn:string}) {
  return withTenant(this.pool,context,async db=>{
   // Serialize repository issuers for this job, before checking any revision.
   // Command replays and already-issued revisions still go to the routine for
   // its original payload/authorization checks; they cannot create a new bill.
   await db.$client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text||':'||$2::uuid::text,0))`,[context.tenantId,input.jobId]);
   const prior=(await db.$client.query<{rebill_blocked:boolean}>(`SELECT EXISTS(
    SELECT 1 FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2 AND i.final_account_revision_id<>$3
    AND i.total_pence>COALESCE((SELECT sum(c.amount_pence) FROM app.customer_credit_note c WHERE(c.tenant_id,c.invoice_id)=(i.tenant_id,i.id)),0)
   ) AND NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$4)
   AND NOT EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3) AS rebill_blocked`,[context.tenantId,input.jobId,input.finalAccountRevisionId,input.commandId])).rows[0]!;
   if(prior.rebill_blocked)throw new Error("INVOICE_CORRECTION_OR_SUPPLEMENTARY_REQUIRED");
   const r=(await db.$client.query<any>(`SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)`,[context.tenantId,input.jobId,input.finalAccountRevisionId,input.actorMembershipId,input.commandId,input.recipient,input.issuedOn])).rows[0];
   await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${input.actorMembershipId}`,eventType:"customer_invoice.synthetic_issued",subjectType:"job",subjectRef:input.jobId,payload:{references:{invoiceId:r.invoice_id,finalAccountRevisionId:input.finalAccountRevisionId},hashes:{pdfSha256:r.pdf_sha256,sourceHash:r.source_hash},classifications:{action:"commercial",delivery:"operational"}}}]);
   return this.map((await db.$client.query<any>(`SELECT * FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2`,[context.tenantId,r.invoice_id])).rows[0]);
  });
 }
 async artifact(context:VerifiedTenantContext,jobId:string,invoiceId:string) {
  return withTenant(this.pool,context,async db=>(await db.$client.query<{pdf_bytes:Buffer}>(`SELECT pdf_bytes FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[context.tenantId,jobId,invoiceId])).rows[0]?.pdf_bytes??null);
 }
 async creditView(context:VerifiedTenantContext,jobId:string,invoiceId:string) {
  return withTenant(this.pool,context,async db=>{
   // Balance and history must share a statement snapshot under READ COMMITTED.
   const invoice=(await db.$client.query<any>(`SELECT i.*,${amounts},COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',c.id,'credit_number',c.credit_number,'net_pence',c.net_pence,
     'tax_pence',c.tax_pence,'total_pence',c.total_pence,'reason',c.reason,'pdf_sha256',c.pdf_sha256,
     'approved_at',c.approved_at,'source_invoice_hash',c.source_invoice_hash) ORDER BY c.created_at,c.id) FROM app.customer_credit_note c
    WHERE(c.tenant_id,c.job_id,c.invoice_id)=(i.tenant_id,i.job_id,i.id)
   ),'[]'::jsonb) credits FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2 AND i.id=$3`,[context.tenantId,jobId,invoiceId])).rows[0];
   if(!invoice)throw new Error("INVOICE_NOT_FOUND");
   const credits=(invoice.credits as any[]).map(c=>({id:c.id,number:c.credit_number,netPence:Number(c.net_pence),taxPence:Number(c.tax_pence),totalPence:Number(c.total_pence),reason:c.reason,pdfSha256:c.pdf_sha256.trim(),approvedAt:new Date(c.approved_at).toISOString(),sourceInvoiceHash:c.source_invoice_hash.trim()}));
   return {invoice:this.map(invoice),credits};
  });
 }
 private async lockCredits(db:TenantTransaction,context:VerifiedTenantContext,invoiceId:string) {
  // The exact transaction lock used by the persisted credit issuer (0028).
  await db.$client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text||':'||$2::uuid::text,0))`,[context.tenantId,invoiceId]);
 }
 private async creditAmounts(db:TenantTransaction,context:VerifiedTenantContext,input:{jobId:string;invoiceId:string;netPence:number}) {
  const row=(await db.$client.query<any>(`SELECT i.pdf_sha256,i.invoice_number,i.net_pence,i.total_pence,
   COALESCE((SELECT sum(c.amount_pence) FROM app.customer_credit_note c WHERE(c.tenant_id,c.invoice_id)=(i.tenant_id,i.id)),0) credited,
   COALESCE((SELECT -sum(c.net_pence) FROM app.customer_credit_note c WHERE(c.tenant_id,c.invoice_id)=(i.tenant_id,i.id)),0) credited_net
   FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2 AND i.id=$3`,[context.tenantId,input.jobId,input.invoiceId])).rows[0];
  if(!row)throw new Error("INVOICE_NOT_FOUND");
  // Independent net ceiling: split VAT rounding must never create principal.
  if(BigInt(row.credited_net)+BigInt(input.netPence)>BigInt(row.net_pence))throw new Error("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
  return row;
 }
 async previewCredit(context:VerifiedTenantContext,input:{jobId:string;invoiceId:string;netPence:number;reason:string}) {
  return withTenant(this.pool,context,async db=>{
   await this.lockCredits(db,context,input.invoiceId);
   const row=await this.creditAmounts(db,context,input);
   const tax=Math.floor((input.netPence+2)/5),gross=input.netPence+tax;
   if(gross>Number(row.total_pence)-Number(row.credited))throw new Error("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
   return {previewHash:createHash("sha256").update(`${input.jobId}${input.invoiceId}${input.netPence}${row.credited}${row.pdf_sha256.trim()}`).digest("hex"),invoiceNumber:row.invoice_number,netPence:-input.netPence,taxPence:-tax,totalPence:-gross,reason:input.reason,availablePence:Number(row.total_pence)-Number(row.credited)};
  });
 }
 async issueCredit(context:VerifiedTenantContext,input:{jobId:string;invoiceId:string;actorMembershipId:string;commandId:string;netPence:number;reason:string;previewHash:string}) {
  return withTenant(this.pool,context,async db=>{
   await this.lockCredits(db,context,input.invoiceId);
   // Completed commands must reach the routine's exact replay/conflict check,
   // even when that original credit has since exhausted the available net.
   const replay=(await db.$client.query(`SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,input.commandId])).rowCount;
   if(!replay)await this.creditAmounts(db,context,input);
   const row=(await db.$client.query<any>(`SELECT * FROM app.issue_practice_customer_credit_note($1,$2,$3,$4,$5,$6,$7,$8)`,[context.tenantId,input.jobId,input.invoiceId,input.actorMembershipId,input.commandId,input.netPence,input.reason,input.previewHash])).rows[0];
   const seen=(await db.$client.query(`SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_credit_note.synthetic_approved' AND payload->'references'->>'creditNoteId'=$2`,[context.tenantId,row.credit_note_id])).rowCount;
   if(!seen)await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${input.actorMembershipId}`,eventType:"customer_credit_note.synthetic_approved",subjectType:"job",subjectRef:input.jobId,payload:{references:{creditNoteId:row.credit_note_id,invoiceId:input.invoiceId,commandId:input.commandId},hashes:{pdfSha256:row.pdf_sha256,previewHash:input.previewHash},classifications:{action:"commercial",environment:"operational"}}}]);
   return {creditNoteId:row.credit_note_id,creditNumber:row.credit_number,pdfSha256:row.pdf_sha256.trim(),totalPence:Number(row.total_pence)};
  });
 }
 async receiptView(context:VerifiedTenantContext,jobId:string,invoiceId:string) {
  // One SQL statement means balances and their receipt history use one snapshot,
  // including when another connection records or reverses a payment concurrently.
  return withTenant(this.pool,context,async db=>{
   const row=(await db.$client.query<any>(`SELECT i.*,${amounts},COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
     'id',p.id,'paidOn',to_char(p.paid_on,'YYYY-MM-DD'),'amountPence',p.amount_pence,
     'method',p.method,'reference',p.reference,'recordedAt',p.created_at,
     'reversal',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'reason',r.reason,'reversedAt',r.created_at) END
    ) ORDER BY p.created_at,p.id)
    FROM app.customer_payment p LEFT JOIN app.customer_payment_reversal r ON(r.tenant_id,r.payment_id)=(p.tenant_id,p.id)
    WHERE p.tenant_id=i.tenant_id AND p.job_id=i.job_id AND p.invoice_id=i.id
   ),'[]'::jsonb) receipts FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2 AND i.id=$3`,[context.tenantId,jobId,invoiceId])).rows[0];
   if(!row)throw new Error("INVOICE_NOT_FOUND");
   return {invoice:this.map(row),receipts:row.receipts as Array<{id:string;paidOn:string;amountPence:number;method:string;reference:string;recordedAt:string;reversal:{id:string;reason:string;reversedAt:string}|null}>,eligibleRecoveryPrincipalPence:0 as const,baseCreditPence:0 as const};
  });
 }
 async recordReceipt(context:VerifiedTenantContext,input:{jobId:string;invoiceId:string;actorMembershipId:string;commandId:string;paidOn:string;amountPence:number;method:string;reference:string}) {
  return withTenant(this.pool,context,async db=>{
   const row=(await db.$client.query<{payment_id:string}>(`SELECT * FROM app.record_practice_customer_receipt($1,$2,$3,$4,$5,$6::date,$7,$8,$9)`,[context.tenantId,input.jobId,input.invoiceId,input.actorMembershipId,input.commandId,input.paidOn,input.amountPence,input.method,input.reference])).rows[0]!;
   const seen=(await db.$client.query(`SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_payment.synthetic_recorded' AND payload->'references'->>'paymentId'=$2`,[context.tenantId,row.payment_id])).rowCount;
   if(!seen)await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${input.actorMembershipId}`,eventType:"customer_payment.synthetic_recorded",subjectType:"job",subjectRef:input.jobId,payload:{references:{paymentId:row.payment_id,invoiceId:input.invoiceId,commandId:input.commandId},classifications:{action:"financial",environment:"operational"}}}]);
   return {paymentId:row.payment_id};
  });
 }
 async reverseReceipt(context:VerifiedTenantContext,input:{jobId:string;invoiceId:string;paymentId:string;actorMembershipId:string;commandId:string;reason:string}) {
  return withTenant(this.pool,context,async db=>{
   const row=(await db.$client.query<{reversal_id:string}>(`SELECT * FROM app.reverse_practice_customer_receipt($1,$2,$3,$4,$5,$6,$7)`,[context.tenantId,input.jobId,input.invoiceId,input.paymentId,input.actorMembershipId,input.commandId,input.reason])).rows[0]!;
   const seen=(await db.$client.query(`SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_payment.synthetic_reversed' AND payload->'references'->>'reversalId'=$2`,[context.tenantId,row.reversal_id])).rowCount;
   if(!seen)await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${input.actorMembershipId}`,eventType:"customer_payment.synthetic_reversed",subjectType:"job",subjectRef:input.jobId,payload:{references:{paymentId:input.paymentId,invoiceId:input.invoiceId,reversalId:row.reversal_id,commandId:input.commandId},classifications:{action:"financial",environment:"operational"}}}]);
   return {reversalId:row.reversal_id};
  });
 }
}
