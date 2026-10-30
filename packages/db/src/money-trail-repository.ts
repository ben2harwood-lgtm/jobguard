import type { Pool } from "pg";
import { z } from "zod";
import { MoneyTrailError, moneyTrailAvailabilityV1, parseExactPence, MAX_MONEY_PENCE } from "@jobguard/core";
import { practiceMaterialPool } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const sourceId=z.string().uuid(),sourceHash=z.string().regex(/^[a-f0-9]{64}$/u);
const storedPence=z.string().regex(/^-?(?:0|[1-9]\d*)$/u).max(14).pipe(z.string().refine(s=>{const n=BigInt(s);return n>=-BigInt(MAX_MONEY_PENCE)&&n<=BigInt(MAX_MONEY_PENCE);}));
const storedExact=z.custom<{numerator:string;denominator:string}>(value=>{try{parseExactPence(value);return true;}catch{return false;}});
const rule=z.enum(["explicit","separate_invoice","pro_rata"]);
const source=<K extends string,S extends z.ZodRawShape>(kind:K,values:S)=>z.object({kind:z.literal(kind),id:sourceId,tenantId:sourceId,jobId:sourceId,values:z.object(values).strict()}).strict();
/** Mirrors named existing facts only. No new economic source/qualification contract. */
const availableSource=z.union([
 source("customer_invoice",{finalAccountRevisionId:sourceId,sourceHash,netPence:storedPence,taxPence:storedPence,grossPence:storedPence}),
 source("customer_credit_note",{invoiceId:sourceId,amountPence:storedPence}),
 source("customer_payment",{invoiceId:sourceId,amountPence:storedPence}),
 source("customer_payment_reversal",{paymentId:sourceId}),
 source("recovery_allocation_review",{caseId:sourceId,paymentId:sourceId,allocationId:sourceId.nullable(),commandId:sourceId,action:z.enum(["allocate","reverse"]),approvalHash:sourceHash}),
 source("recovery_allocation_line_source",{invoiceId:sourceId,lineId:sourceId,netPence:storedPence,grossPence:storedPence,rule,sourceRef:z.string().min(1).max(300)}),
 source("recovery_case_allocation",{caseId:sourceId,paymentId:sourceId,invoiceId:sourceId,reviewId:sourceId,authorizationId:sourceId,evidenceId:sourceId,objectVersionId:z.string().min(1).max(1024),evidenceHash:sourceHash,movementId:sourceId,movementHash:sourceHash,policyVersion:z.string().min(1).max(80),grossPence:storedPence,netPence:storedPence,taxPence:storedPence}),
 source("recovery_case_allocation_reversal",{allocationId:sourceId,sourceKind:z.enum(["payment_reversal","credit_note"]),sourceId,grossPence:storedPence,netPence:storedPence,taxPence:storedPence}),
 source("receipt_line_allocation",{paymentId:sourceId,invoiceId:sourceId,lineId:sourceId,allocationId:sourceId,reversalId:sourceId.nullable(),reversesId:sourceId.nullable(),sourceId,rule,sourceRef:z.string().min(1).max(300),gross:storedExact,net:storedExact}),
 source("recovery_allocation_command",{caseId:sourceId,payloadHash:sourceHash}),
]);
// Closed server-owned projections. No caller may supply a table, expression or field list.
const projections=[
 ["customer_invoice","id","'finalAccountRevisionId',s.final_account_revision_id,'sourceHash',s.source_hash,'netPence',s.net_pence::text,'taxPence',s.tax_pence::text,'grossPence',s.total_pence::text"],
 ["customer_credit_note","id","'invoiceId',s.invoice_id,'amountPence',s.amount_pence::text"],
 ["customer_payment","id","'invoiceId',s.invoice_id,'amountPence',s.amount_pence::text"],
 ["customer_payment_reversal","id","'paymentId',s.payment_id"],
 ["recovery_allocation_review","id","'caseId',s.case_id,'paymentId',s.payment_id,'allocationId',s.allocation_id,'commandId',s.command_id,'action',s.action,'approvalHash',s.approval_hash"],
 ["recovery_allocation_line_source","id","'invoiceId',s.invoice_id,'lineId',s.line_id,'netPence',s.net_pence::text,'grossPence',s.gross_pence::text,'rule',s.rule,'sourceRef',s.source_ref"],
 ["recovery_case_allocation","id","'caseId',s.case_id,'paymentId',s.payment_id,'invoiceId',s.invoice_id,'reviewId',s.review_id,'authorizationId',s.authorization_id,'evidenceId',s.evidence_id,'objectVersionId',s.object_version_id,'evidenceHash',s.evidence_hash,'movementId',s.movement_id,'movementHash',s.movement_hash,'policyVersion',s.policy_version,'grossPence',s.gross_pence::text,'netPence',s.eligible_net_pence::text,'taxPence',s.tax_pence::text"],
 ["recovery_case_allocation_reversal","id","'allocationId',s.allocation_id,'sourceKind',s.source_kind,'sourceId',s.source_id,'grossPence',s.gross_pence::text,'netPence',s.eligible_net_pence::text,'taxPence',s.tax_pence::text"],
 ["receipt_line_allocation","id","'paymentId',s.payment_id,'invoiceId',s.invoice_id,'lineId',s.line_id,'allocationId',s.allocation_id,'reversalId',s.reversal_id,'reversesId',s.reverses_id,'sourceId',s.source_id,'rule',s.rule,'sourceRef',s.source_ref,'gross',jsonb_build_object('numerator',s.gross_numerator,'denominator',s.gross_denominator),'net',jsonb_build_object('numerator',s.net_numerator,'denominator',s.net_denominator)"],
 ["recovery_allocation_command","command_id","'caseId',s.case_id,'payloadHash',s.payload_hash"],
] as const;
const sourceSql=`SELECT coalesce(jsonb_agg(source ORDER BY (source->>'kind') COLLATE "C",(source->>'id') COLLATE "C"),'[]'::jsonb) sources FROM (${projections.map(([table,id,values])=>`SELECT jsonb_build_object('kind','${table}','id',s.${id},'tenantId',s.tenant_id,'jobId',s.job_id,'values',jsonb_build_object(${values})) source FROM app.${table} s WHERE s.tenant_id=$1 AND s.job_id=$2`).join(" UNION ALL ")}) available_money_trail_sources`;

/** Read-only dependency availability. No run, command, source adapter or review authority. */
export class MoneyTrailRepository {
 constructor(private readonly pool:Pool){}
 /** One statement snapshot of already-readable customer/M4-8-S facts. Explicitly incomplete, never a run. */
 async availableSources(context:VerifiedTenantContext,jobId:string,digest:string){
  const job=z.string().uuid().parse(jobId);
  return withTenant(practiceMaterialPool(this.pool,digest),context,async db=>{
   const access=(await db.$client.query<{result:unknown}>("SELECT app.read_money_trail_availability($1,$2) result",[job,digest])).rows[0];
   const status=moneyTrailAvailabilityV1.parse(access?.result);
   if(status.jobId!==job)throw new MoneyTrailError("MONEY_TRAIL_FORBIDDEN");
   const row=(await db.$client.query<{sources:unknown}>(sourceSql,[context.tenantId,job])).rows[0];
   const parsed=z.array(availableSource).max(10_000).safeParse(row?.sources);
   if(!parsed.success)throw new MoneyTrailError("MONEY_TRAIL_SOURCE_UNAVAILABLE");
   for(const source of parsed.data){
    if(source.tenantId!==context.tenantId||source.jobId!==job)throw new MoneyTrailError("MONEY_TRAIL_FORBIDDEN");
   }
   return {version:"money-trail-available-sources.v1" as const,environment:"synthetic_demo" as const,jobId:job,incomplete:true as const,realExternalActions:0 as const,
    unavailableFamilies:["eligibility","fee_postings","fee_statements","fee_events","subscription"] as const,sources:parsed.data};
  });
 }

 async availability(context:VerifiedTenantContext,jobId:string,digest:string){
  const job=z.string().uuid().parse(jobId);
  try{return await withTenant(practiceMaterialPool(this.pool,digest),context,async db=>{
   const row=(await db.$client.query<{result:unknown}>("SELECT app.read_money_trail_availability($1,$2) result",[job,digest])).rows[0];
   const result=moneyTrailAvailabilityV1.parse(row?.result);
   if(result.jobId!==job)throw new MoneyTrailError("MONEY_TRAIL_FORBIDDEN");
   return result;
  });}catch(error){
   if(error instanceof Error&&"code" in error&&error.code==="42501")throw new MoneyTrailError("MONEY_TRAIL_FORBIDDEN");
   throw error;
  }
 }
}
