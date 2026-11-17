import{createHash,randomUUID}from"node:crypto";import type{Pool}from"pg";import{z}from"zod";import{createSyntheticInvoicePdf,formatCustomerInvoiceNumber,projectInvoiceBalance,CUSTOMER_INVOICE_POLICY_VERSION,REAL_CUSTOMER_INVOICE_ISSUE_ENABLED,SYNTHETIC_INVOICE_WATERMARK,customerPaymentV1,customerPaymentReversalV1,money}from"@jobguard/core";import{appendOutboundAction}from"./outbox.js";import{appendAuditBatch}from"./audit.js";import{CommandError,UserCommandDispatcher,consequentialCommandV1Schema,type ConsequentialCommand}from"./commands.js";import{withTenant,type VerifiedTenantContext}from"./tenant-context.js";
const uuid=z.guid({ error: "Invalid uuid" }),issuer=z.object({legalName:z.string().trim().min(1).max(160),address:z.string().trim().min(1).max(500),vatNumber:z.string().trim().max(32).nullable()}).strict();
export const issueCustomerInvoiceV1=z.object({version:z.literal("customer-invoice.issue.v1"),command:consequentialCommandV1Schema,finalAccountRevisionId:uuid,issuedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),issuer}).strict();
export const creditCustomerInvoiceV1=z.object({version:z.literal("customer-credit-note.issue.v1"),command:consequentialCommandV1Schema,invoiceId:uuid,amountPence:z.number().int().positive(),reason:z.string().trim().min(1).max(240)}).strict();
const sha=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
export class CustomerBillingCommandService{
 private readonly dispatcher:UserCommandDispatcher;constructor(private readonly pool:Pool){this.dispatcher=new UserCommandDispatcher(pool)}
 async issue(context:VerifiedTenantContext,raw:unknown){const input=issueCustomerInvoiceV1.parse(raw),c=input.command;if(REAL_CUSTOMER_INVOICE_ISSUE_ENABLED)throw new Error("REAL_ISSUE_GATE_CONFIGURATION_INVALID");if(c.commandType!=="customer_invoice.issue"||c.action.actionType!=="final_account.issue"||c.action.policyVersion!==CUSTOMER_INVOICE_POLICY_VERSION||c.action.recipient!==null)throw new Error("SYNTHETIC_ISSUE_ACTION_REQUIRED");return this.dispatcher.dispatch(context,c,{mutate:async(db,command)=>{const row=(await db.$client.query<any>(`SELECT r.*,d.current_revision_id FROM app.final_account_revision r JOIN app.final_account_draft d ON(d.tenant_id,d.id)=(r.tenant_id,r.final_account_draft_id) WHERE r.tenant_id=$1 AND r.id=$2 AND r.job_id=$3`,[context.tenantId,input.finalAccountRevisionId,command.subjectRef])).rows[0];if(!row||row.issue_blocked||row.current_revision_id!==row.id||Number(row.revision)!==command.action.aggregateRevision||Number(row.total_pence)!==command.action.amountPence)throw new Error("STALE_OR_BLOCKED_FINAL_ACCOUNT_APPROVAL");const prior=(await db.$client.query<any>(`SELECT id,invoice_number,pdf_sha256 FROM app.customer_invoice WHERE tenant_id=$1 AND final_account_revision_id=$2`,[context.tenantId,row.id])).rows[0];if(prior)return{invoiceId:prior.id,invoiceNumber:prior.invoice_number,pdfSha256:prior.pdf_sha256,reused:true,synthetic:true};const n=Number((await db.$client.query(`SELECT app.reserve_customer_invoice_number($1) n`,[context.tenantId])).rows[0].n),invoiceNumber=formatCustomerInvoiceNumber(n,input.issuedOn),evidence=(await db.$client.query<any>(`SELECT evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=$1 AND final_account_revision_id=$2 ORDER BY evidence_id`,[context.tenantId,row.id])).rows,pdf=createSyntheticInvoicePdf({invoiceNumber,issuerName:input.issuer.legalName,total:money(Number(row.total_pence)),sourceRevisionId:row.id,evidenceVersionIds:evidence.map((x:any)=>x.object_version_id)}),pdfSha256=sha(pdf),invoiceId=randomUUID(),authorizationId=command.authorizationId!;if(command.action.contentHash!==pdfSha256)throw new Error("APPROVED_PDF_HASH_MISMATCH");await db.$client.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'GBP',$10,$11,$12,$13,$14,$15,true,$16)`,[invoiceId,context.tenantId,command.subjectRef,row.id,authorizationId,invoiceNumber,input.issuedOn,JSON.stringify(input.issuer),row.tax_policy_version,row.net_pence,row.tax_pence,row.total_pence,row.source_hash,pdfSha256,Buffer.from(pdf),SYNTHETIC_INVOICE_WATERMARK]);for(const e of evidence)await db.$client.query(`INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),context.tenantId,command.subjectRef,invoiceId,e.evidence_id,e.object_version_id,e.sha256,e.scope_item_id]);await appendOutboundAction(db,context.tenantId,{version:"outbound-action.v1",id:randomUUID(),authorizationId,adapter:"fake_invoice_delivery",providerEffectKey:`invoice:${invoiceId}`,actionType:command.action.actionType,recipient:null,contentHash:pdfSha256,immutableContent:new TextDecoder().decode(pdf),aggregateRevision:Number(row.revision),amountPence:Number(row.total_pence),currency:"GBP",policyVersion:row.tax_policy_version,authorizationExpiresAt:command.action.expiresAt});return{invoiceId,invoiceNumber,pdfSha256,reused:false,synthetic:true}},auditEvents:(result)=>[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${c.actorMembershipId}`,eventType:"customer_invoice.synthetic_issued",subjectType:"job",subjectRef:c.subjectRef,payload:{references:{invoiceId:result.invoiceId,finalAccountRevisionId:input.finalAccountRevisionId},hashes:{pdfSha256:result.pdfSha256},classifications:{action:"commercial",delivery:"operational",billingBook:"financial"}}}]});}
 async recordPayment(context:VerifiedTenantContext,raw:unknown){
  const p=customerPaymentV1.parse(raw);
  try{return await withTenant(this.pool,context,async db=>{
   const member=(await db.$client.query<{role:string}>(`SELECT role FROM app.membership WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[context.tenantId,p.actorMembershipId])).rows[0];
   if(!member||member.role!=="owner")throw new CommandError("FORBIDDEN");
   // Previously dispatched service receipts used a different request hash from
   // the controlled routine. Preserve their exact retries without rewriting
   // history: the original authorization bound the entire parsed receipt.
   const legacy=(await db.$client.query<any>(`SELECT r.command_type,r.actor_membership_id,r.status,r.result,a.content_hash
    FROM app.command_receipt r LEFT JOIN app.customer_payment payment
      ON payment.tenant_id=r.tenant_id AND payment.id::text=r.result->>'paymentId'
    LEFT JOIN app.action_authorization a ON(a.tenant_id,a.id)=(payment.tenant_id,payment.authorization_id)
    WHERE r.tenant_id=$1 AND r.command_id=$2 AND r.semantic_key LIKE 'payment:%'`,[context.tenantId,p.commandId])).rows[0];
   if(legacy){
    if(legacy.command_type!=="customer_payment.record"||legacy.actor_membership_id!==p.actorMembershipId||legacy.status!=="succeeded"||!legacy.result?.paymentId||legacy.content_hash?.trim()!==sha(JSON.stringify(p)))throw new CommandError("COMMAND_CONFLICT");
    return{paymentId:legacy.result.paymentId as string,provenance:"manual_builder_attestation",qualifyingRecoveryProof:false,platformFeeSettlement:false};
   }
   // The existing checked routine identifies a receipt by command, never by its
   // descriptive bank reference; its request hash also survives a later replay.
   const row=(await db.$client.query<{payment_id:string}>(`SELECT * FROM app.record_practice_customer_receipt($1,$2,$3,$4,$5,$6::date,$7,$8,$9)`,[context.tenantId,p.jobId,p.invoiceId,p.actorMembershipId,p.commandId,p.paidOn,p.amountPence,p.method,p.reference])).rows[0]!;
   const seen=(await db.$client.query(`SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_payment.recorded' AND payload->'references'->>'paymentId'=$2`,[context.tenantId,row.payment_id])).rowCount;
   if(!seen){
    const authorization=(await db.$client.query<{authorization_id:string}>(`SELECT authorization_id FROM app.customer_payment WHERE tenant_id=$1 AND id=$2`,[context.tenantId,row.payment_id])).rows[0]!;
    await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${p.actorMembershipId}`,eventType:"customer_payment.recorded",subjectType:"job",subjectRef:p.jobId,payload:{references:{paymentId:row.payment_id,invoiceId:p.invoiceId},classifications:{action:"financial",provenance:"operational",billingBook:"financial"}}},
     {id:randomUUID(),version:"audit.v1",actorRef:`membership:${p.actorMembershipId}`,eventType:"command.succeeded",subjectType:"job",subjectRef:p.jobId,payload:{references:{commandId:p.commandId,authorizationId:authorization.authorization_id},classifications:{action:"commercial"}}}]);
   }
   return{paymentId:row.payment_id,provenance:"manual_builder_attestation",qualifyingRecoveryProof:false,platformFeeSettlement:false};
  });}catch(error){if((error as {code?:string;message?:string}).code==="23505"&&(error as Error).message.includes("IDEMPOTENCY_PAYLOAD_CONFLICT"))throw new CommandError("COMMAND_CONFLICT");throw error;}
 }
 async credit(context:VerifiedTenantContext,raw:unknown){
  const input=creditCustomerInvoiceV1.parse(raw),c=input.command;
  if(c.commandType!=="customer_credit_note.issue"||c.action.actionType!=="customer_credit_note.issue"||c.action.amountPence!==input.amountPence||c.action.currency!=="GBP")throw new Error("CREDIT_ACTION_MISMATCH");
  const result=await this.dispatcher.dispatch(context,c,{
   // One shared invoice lock protects remaining debt. Receipt uniqueness serializes
   // command and semantic identities, including retries targeting another invoice.
   lock:async db=>{
    await db.$client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text,0))`,[context.tenantId,input.invoiceId]);
   },
   mutate:async(db,command)=>{
    const invoice=(await db.$client.query<any>(`SELECT i.*,COALESCE((SELECT sum(amount_pence) FROM app.customer_credit_note n WHERE(n.tenant_id,n.invoice_id)=(i.tenant_id,i.id)),0) credited FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2 AND i.id=$3`,[context.tenantId,command.subjectRef,input.invoiceId])).rows[0];
    if(!invoice||BigInt(invoice.credited)+BigInt(input.amountPence)>BigInt(invoice.total_pence))throw new Error("INVALID_CREDIT_AMOUNT");
    if(invoice.tax_policy_version!==CUSTOMER_INVOICE_POLICY_VERSION)throw new Error("INVALID_CREDIT_AMOUNT");
    // Invert the EXISTING candidate standard-rate rule in 0028: tax=(net+2)/5.
    // Some gross penny amounts have no exact inverse; refuse rather than invent
    // a tax allocation or silently change the approved gross amount.
    const gross=BigInt(money(input.amountPence).pence),net=(gross*5n+3n)/6n,tax=(net+2n)/5n;
    if(net<=0n||net+tax!==gross)throw new Error("INVALID_CREDIT_AMOUNT");
    const id=randomUUID(),creditNumber=`CN-${command.commandId}`,sourceInvoiceHash=invoice.pdf_sha256.trim();
    const previewHash=sha(`${command.subjectRef}${input.invoiceId}${net}${invoice.credited}${sourceInvoiceHash}`);
    const pdf=createSyntheticCreditPdf({creditNumber,invoiceNumber:invoice.invoice_number,reason:input.reason,netPence:-Number(net),taxPence:-Number(tax),totalPence:-input.amountPence,sourceInvoiceHash}),pdfSha256=sha(pdf);
    const approvedAt=(await db.$client.query<{approved_at:Date}>(`SELECT transaction_timestamp() AS approved_at`)).rows[0]!.approved_at;
    await db.$client.query(`INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason,net_pence,tax_pence,total_pence,source_invoice_hash,preview_hash,pdf_sha256,pdf_bytes,tax_policy_version,approved_at)VALUES($1,$2,$3,$4,$5,$6,$7,'GBP',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[id,context.tenantId,command.subjectRef,input.invoiceId,command.authorizationId,creditNumber,input.amountPence,input.reason,-Number(net),-Number(tax),-input.amountPence,sourceInvoiceHash,previewHash,pdfSha256,Buffer.from(pdf),invoice.tax_policy_version,approvedAt]);
    return{creditNoteId:id,creditNumber,originalInvoiceUnchanged:true};
   }
  });
  // Receipt uniqueness waits for competing command/semantic inserts to commit.
  // Dispatcher replay has no effects; bind its returned immutable credit before returning.
  // Do this after dispatch releases its invoice lock, with no further business lock.
  return withTenant(this.pool,context,async db=>{
   const credit=(await db.$client.query<{job_id:string;invoice_id:string;amount_pence:string;reason:string}>(`SELECT job_id,invoice_id,amount_pence,reason FROM app.customer_credit_note WHERE tenant_id=$1 AND id=$2`,[context.tenantId,result.creditNoteId])).rows[0];
   if(!credit||credit.job_id!==c.subjectRef||credit.invoice_id!==input.invoiceId||BigInt(credit.amount_pence)!==BigInt(input.amountPence)||credit.reason!==input.reason)throw new CommandError("COMMAND_CONFLICT");
   return result;
  });
 }
 async reversePayment(context:VerifiedTenantContext,raw:unknown){const p=customerPaymentReversalV1.parse(raw),command:ConsequentialCommand={version:"command.v1",commandId:p.commandId,commandType:"customer_payment.reverse",semanticKey:`payment-reversal:${p.paymentId}`,actorMembershipId:p.actorMembershipId,subjectType:"job",subjectRef:p.jobId,authorizationId:randomUUID(),action:{actionType:"customer_payment.reverse",recipient:null,contentHash:sha(JSON.stringify(p)),aggregateRevision:0,amountPence:null,currency:null,policyVersion:"manual_receipt_v1",expiresAt:new Date(Date.now()+300000)}};return this.dispatcher.dispatch(context,command,{mutate:async(db,c)=>{const row=(await db.$client.query<any>(`SELECT p.invoice_id FROM app.customer_payment p JOIN app.customer_invoice i ON(i.tenant_id,i.id)=(p.tenant_id,p.invoice_id) WHERE p.tenant_id=$1 AND p.job_id=$2 AND p.id=$3`,[context.tenantId,p.jobId,p.paymentId])).rows[0];if(!row)throw new Error("PAYMENT_NOT_FOUND");const id=randomUUID();await db.$client.query(`INSERT INTO app.customer_payment_reversal(id,tenant_id,job_id,payment_id,authorization_id,reason)VALUES($1,$2,$3,$4,$5,$6)`,[id,context.tenantId,p.jobId,p.paymentId,c.authorizationId,p.reason]);return{reversalId:id,invoiceId:row.invoice_id}}});}
 async balance(context:VerifiedTenantContext,invoiceId:string){return withTenant(this.pool,context,async db=>{const r=(await db.$client.query<any>(`SELECT i.total_pence,COALESCE((SELECT sum(amount_pence) FROM app.customer_credit_note c WHERE(c.tenant_id,c.invoice_id)=(i.tenant_id,i.id)),0) credit_pence,COALESCE((SELECT sum(p.amount_pence) FROM app.customer_payment p WHERE(p.tenant_id,p.invoice_id)=(i.tenant_id,i.id)),0) receipt_pence,COALESCE((SELECT sum(p.amount_pence) FROM app.customer_payment p JOIN app.customer_payment_reversal r ON(r.tenant_id,r.payment_id)=(p.tenant_id,p.id) WHERE(p.tenant_id,p.invoice_id)=(i.tenant_id,i.id)),0) reversed_pence FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.id=$2`,[context.tenantId,invoiceId])).rows[0];if(!r)throw new Error("INVOICE_NOT_FOUND");return projectInvoiceBalance({totalPence:Number(r.total_pence),creditPence:Number(r.credit_pence),receiptPence:Number(r.receipt_pence),reversedReceiptPence:Number(r.reversed_pence)})})}
}

/** Synthetic credit artifact; ASCII PDF text keeps stream lengths and offsets exact. */
function createSyntheticCreditPdf(input:{creditNumber:string;invoiceNumber:string;reason:string;netPence:number;taxPence:number;totalPence:number;sourceInvoiceHash:string}):Uint8Array{
 const safe=(v:string)=>v.replace(/[^\x20-\x7e]/gu,"?").replace(/[()\\]/gu," ");
 const lines=[SYNTHETIC_INVOICE_WATERMARK,"Practice sandbox - synthetic data; nothing is sent or charged",`Credit note ${input.creditNumber}`,`Corrects invoice ${input.invoiceNumber}`,`Reason: ${input.reason}`,`Net pence: ${input.netPence}`,`VAT pence: ${input.taxPence}`,`Total GBP pence: ${input.totalPence}`,`Original invoice hash: ${input.sourceInvoiceHash}`].map(safe);
 const stream=`BT /F1 10 Tf 40 760 Td ${lines.map((line,index)=>`${index?"0 -24 Td ":""}(${line}) Tj`).join(" ")} ET`;
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
 let pdf="%PDF-1.4\n";const offsets:number[]=[];
 for(const [index,object]of objects.entries()){offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>`${offset.toString().padStart(10,"0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(pdf);
}
