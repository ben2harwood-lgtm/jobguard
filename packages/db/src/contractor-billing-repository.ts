import {contractorBillingReconciliation} from "./contractor-billing-projection.js";
import type { Pool } from "pg";
import { z } from "zod";
import { ContractorBillingError, contractorBillingErrorCodes, billingFinaliseCommandV1, billingImportCommandV1, billingApproveDeliveryCommandV1, normalizeBillingStatus, renderBillingExport, deriveUnambiguousBilling, BillingDataError, type BillingStatus } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { canonicalJson } from "./work-order-repository.js";
export type BillingProjection=ReturnType<typeof deriveUnambiguousBilling>;
export type ExportResult={batchId:string|null;lineCount:number};
export type BillingRead={version:"contractor-billing-projection.v1";exports:{id:string;artifact:ReturnType<typeof renderBillingExport>;jsonHash:string;csvHash:string;csv:string}[];invoices:{source:string;invoiceNumber:string;projection:BillingProjection;runId:string}[];quarantine:{fact_id:string;reason:string}[];deliveries:Record<string,unknown>[];reconciliation:ReturnType<typeof contractorBillingReconciliation>};
function parse<T>(schema:{safeParse(raw:unknown):z.SafeParseReturnType<unknown,T>},raw:unknown):T {const r=schema.safeParse(raw);if(!r.success)throw new ContractorBillingError("BILLING_INVALID");return r.data;}
export function billingDatabaseFailure(error:unknown):never {
 if(error instanceof ContractorBillingError)throw error;
 const e=error as {code?:string;message?:string};const known=contractorBillingErrorCodes.find(c=>c===e.message||c===e.code);if(known)throw new ContractorBillingError(known);
 if(e.code==="23505")throw new ContractorBillingError("BILLING_CONFLICT");
 if(e.code==="42501"||e.code==="P0002"||e.code==="23503")throw new ContractorBillingError("BILLING_FORBIDDEN");
 if(error instanceof BillingDataError||e.code==="23514"||e.code==="22P02")throw new ContractorBillingError("BILLING_INVALID");
 throw new ContractorBillingError("DATABASE_UNAVAILABLE");
}
export class ContractorBillingRepository {
 constructor(private readonly pool:Pool){}
 async finalise(context:VerifiedTenantContext,session:string,job:string,raw:unknown):Promise<ExportResult>{
  const input=parse(billingFinaliseCommandV1,raw);parse(z.string().uuid(),job);parse(z.string().uuid(),session);
  try{return await withTenant(this.pool,context,async db=>{
   const replay=(await db.$client.query("SELECT app.cb_begin($1,$2,$3,'FinaliseExportBatch',$4::jsonb) result",[session,job,input.commandId,canonicalJson(input)])).rows[0].result as ExportResult|null;
   if(replay)return replay;
   const lines=(await db.$client.query("SELECT app.cb_candidates($1,$2,$3) lines",[session,job,input.clientContractId])).rows[0].lines as unknown[];
   const artifact=lines.length?renderBillingExport({version:"billing-export.v1",clientContractId:input.clientContractId,lines}):null;
   // cb_export owns its receipt, final guard and audit. This same transaction already claimed it;
   // the routine accepts exactly this processing command, not a second claim.
   return (await db.$client.query("SELECT app.cb_export($1,$2,$3,$4::jsonb,$5,$6) result",[session,job,input.commandId,canonicalJson(input),artifact?.json??null,artifact?.csv??null])).rows[0].result as ExportResult;
  });}catch(e){billingDatabaseFailure(e);}
 }
 async import(context:VerifiedTenantContext,session:string,job:string,raw:unknown):Promise<{importId:string}>{
  const input=parse(billingImportCommandV1,raw),payload={...input,events:input.events.map((e:BillingStatus)=>normalizeBillingStatus(e).event)};
  try{return await withTenant(this.pool,context,async db=>{
   const replay=(await db.$client.query("SELECT app.cb_begin($1,$2,$3,'ImportBillingStatus',$4::jsonb) result",[session,job,input.commandId,canonicalJson(payload)])).rows[0].result as {importId:string}|null;
   if(replay)return replay;
   const result=(await db.$client.query("SELECT app.cb_ingest($1,$2,$3,$4::jsonb) result",[session,job,input.commandId,canonicalJson(payload)])).rows[0].result as {importId:string};
   const groups=(await db.$client.query("SELECT app.cb_inputs($1,$2) groups",[session,job])).rows[0].groups as {source:string;invoiceNumber:string;inputHash:string;facts:{payload:BillingStatus;match_valid:boolean;ambiguous:boolean}[]}[];
   for(const g of groups){
    const rows=g.facts;
    let projection:BillingProjection;
    const valid=rows.filter(r=>r.match_valid&&!r.ambiguous);
    try{projection=deriveUnambiguousBilling(valid.map(r=>r.payload));}
    catch(e){if(!(e instanceof BillingDataError))throw e;projection={...deriveUnambiguousBilling([]),held:rows.map(r=>({sourceEventId:r.payload.sourceEventId,reason:"COMPOSITION_REQUIRED" as const}))};}
    projection={...projection,held:[...projection.held,...rows.filter(r=>!r.match_valid||r.ambiguous).map(r=>({sourceEventId:r.payload.sourceEventId,reason:"COMPOSITION_REQUIRED" as const}))].sort((a,b)=>a.sourceEventId.localeCompare(b.sourceEventId))};
    await db.$client.query("SELECT app.cb_derive($1,$2,$3,$4,$5,$6,$7::jsonb)",[session,job,input.commandId,g.source,g.invoiceNumber,g.inputHash,canonicalJson(projection)]);
   }
   return (await db.$client.query("SELECT app.cb_complete($1,$2,$3,$4::jsonb) result",[session,job,input.commandId,canonicalJson(result)])).rows[0].result as {importId:string};
  });}catch(e){billingDatabaseFailure(e);}
 }
 async approveDelivery(context:VerifiedTenantContext,session:string,job:string,raw:unknown):Promise<{outboxActionId:string}>{
  const input=parse(billingApproveDeliveryCommandV1,raw);
  try{return await withTenant(this.pool,context,async db=>(await db.$client.query("SELECT app.cb_delivery($1,$2,$3,$4::jsonb) result",[session,job,input.commandId,canonicalJson(input)])).rows[0].result as {outboxActionId:string});}catch(e){billingDatabaseFailure(e);}
 }
 async read(context:VerifiedTenantContext,session:string,job:string):Promise<BillingRead>{
  parse(z.string().uuid(),job);
  try{return await withTenant(this.pool,context,async db=>{
   await db.$client.query("SELECT app.cb_authority($1,$2,false)",[session,job]);
   const exports=(await db.$client.query<{id:string;artifact:{lines:unknown[];clientContractId:string};json_hash:string;csv_hash:string;csv_content:string}>("SELECT id,artifact,json_hash,csv_hash,csv_content FROM app.billing_export_batch WHERE job_id=$1 ORDER BY server_recorded_at,id",[job])).rows;
   const invoices=(await db.$client.query<{id:string;source:string;invoice_number:string;projection:BillingProjection}>(`SELECT r.* FROM app.billing_allocation_run r WHERE r.job_id=$1 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run n WHERE n.tenant_id=r.tenant_id AND n.predecessor_id=r.id) ORDER BY source,invoice_number`,[job])).rows;
   const quarantine=(await db.$client.query<{fact_id:string;reason:string}>("SELECT fact_id,reason FROM app.billing_quarantine WHERE job_id=$1 ORDER BY server_recorded_at,id",[job])).rows;
   const deliveries=(await db.$client.query("SELECT d.id,d.batch_id,o.status,o.adapter FROM app.billing_export_delivery d JOIN app.action_outbox o ON(o.tenant_id,o.id)=(d.tenant_id,d.outbox_action_id) WHERE d.job_id=$1 ORDER BY d.id",[job])).rows as Record<string,unknown>[];
   const approved=(await db.$client.query<{extra_id:string;net_pence:string}>(`SELECT q.variation_id extra_id,q.net_pence::text FROM app.extra_approval_request q JOIN app.extra_approval_outcome o ON(o.tenant_id,o.request_id)=(q.tenant_id,q.id) AND o.kind='approved' WHERE q.job_id=$1 AND q.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE x.tenant_id=q.tenant_id AND x.variation_id=q.variation_id) AND NOT EXISTS(SELECT 1 FROM app.billing_export_line l WHERE l.tenant_id=q.tenant_id AND l.extra_id=q.variation_id) AND (SELECT kind FROM app.extra_event e WHERE e.tenant_id=q.tenant_id AND e.variation_id=q.variation_id ORDER BY sequence DESC LIMIT 1)='approved' ORDER BY q.variation_id`,[job])).rows;
   const exportLines=(await db.$client.query<{id:string;approved_net_pence:string;alert_days:number;overdue:boolean}>(`SELECT l.id,l.approved_net_pence::text,(cv.document->>'exportedNotBilledAlertDays')::int alert_days,clock_timestamp()>b.server_recorded_at+((cv.document->>'exportedNotBilledAlertDays')::int*interval '1 day') overdue FROM app.billing_export_line l JOIN app.billing_export_batch b ON(b.tenant_id,b.id)=(l.tenant_id,l.batch_id) JOIN app.extra_approval_request q ON(q.tenant_id,q.id)=(l.tenant_id,l.approval_request_id) JOIN app.client_contract_version cv ON(cv.tenant_id,cv.id)=(q.tenant_id,q.contract_version_id) WHERE l.job_id=$1 ORDER BY l.id`,[job])).rows;
   const matches=(await db.$client.query<{export_line_id:string;source:string;invoice_number:string;external_invoice_line_id:string}>(`SELECT m.export_line_id,f.source,f.invoice_number,m.external_invoice_line_id FROM app.billing_line_match m JOIN app.billing_fact f ON(f.tenant_id,f.id)=(m.tenant_id,m.fact_id) WHERE f.job_id=$1 AND f.payload->>'factType'='invoiced' ORDER BY m.id`,[job])).rows;
   const currentInvoices=invoices.map(r=>({source:r.source,invoiceNumber:r.invoice_number,projection:r.projection,runId:r.id}));
   const reconciliation=contractorBillingReconciliation({approved,exports:exportLines,matches,invoices:currentInvoices});
   return {version:"contractor-billing-projection.v1",exports:exports.map(e=>({id:e.id,artifact:renderBillingExport({version:"billing-export.v1",clientContractId:e.artifact.clientContractId,lines:e.artifact.lines.map(l=>{const {exportLineId:_,...line}=l as Record<string,unknown>;return line;})}),jsonHash:e.json_hash,csvHash:e.csv_hash,csv:e.csv_content})),invoices:invoices.map(r=>({source:r.source,invoiceNumber:r.invoice_number,projection:r.projection,runId:r.id})),quarantine,deliveries,reconciliation};
  });}catch(e){billingDatabaseFailure(e);}
 }
}
