import { createHash } from "node:crypto";
import { z } from "zod";
import { confirmedVariationPriceV1, priceVariation, instantV1 } from "@jobguard/core";
import{randomUUID}from"node:crypto";import{appendAuditBatch}from"./audit.js";import{withTenant,type TenantTransaction,type VerifiedTenantContext}from"./tenant-context.js";import type{Pool}from"pg";import{variationProposalV1,type VariationApproval,type VariationRevision}from"@jobguard/core";
export async function insertVariationProposal(db:TenantTransaction,tenantId:string,raw:unknown){const p=variationProposalV1.parse(raw);if(!p.existingScopeItemId){await db.$client.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'reserved') ON CONFLICT DO NOTHING`,[p.scopeItemId,tenantId,p.jobId]);if(p.lineageParentScopeItemId)await db.$client.query(`INSERT INTO app.scope_lineage(tenant_id,job_id,parent_scope_item_id,child_scope_item_id,kind)VALUES($1,$2,$3,$4,'variation') ON CONFLICT DO NOTHING`,[tenantId,p.jobId,p.lineageParentScopeItemId,p.scopeItemId]);}const s=p.suggestion;await db.$client.query(`INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,existing_scope_item_id,lineage_parent_scope_item_id,capture_kind,capture_text,description,ai_rate_pence,ai_source_ref,ai_source_hash,ai_rate_version)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[p.id,tenantId,p.jobId,p.scopeItemId,p.existingScopeItemId,p.lineageParentScopeItemId,p.captureKind,p.captureText,p.description,s?.unitRatePence??null,s?.sourceRef??null,s?.sourceHash??null,s?.rateVersion??null]);return p;}
export async function insertPricedVariation(db:TenantTransaction,tenantId:string,r:VariationRevision){const current=await db.$client.query(`SELECT state,current_revision_id FROM app.variation WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[tenantId,r.variationId]);if(!current.rowCount)throw new Error("VARIATION_NOT_FOUND");await db.$client.query(`INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,previous_revision_id,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)SELECT $1,$2,job_id,id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 FROM app.variation WHERE tenant_id=$2 AND id=$17`,[r.id,tenantId,r.scopeItemId,r.revision,r.previousRevisionId,r.description,r.quantity,r.unit,r.unitRatePence,r.signedDeltaPence,r.contentHash,r.confirmedByMembershipId,r.rateProvenance.kind,r.rateProvenance.sourceRef,r.rateProvenance.sourceHash,r.rateProvenance.rateVersion,r.variationId]);await db.$client.query(`INSERT INTO app.variation_rate_observation(id,tenant_id,job_id,variation_id,revision_id,unit,unit_rate_pence,provenance_kind,source_ref,source_hash,rate_version)SELECT $1,$2,job_id,id,$3,$4,$5,$6,$7,$8,$9 FROM app.variation WHERE tenant_id=$2 AND id=$10`,[randomUUID(),tenantId,r.id,r.unit,r.unitRatePence,r.rateProvenance.kind,r.rateProvenance.sourceRef,r.rateProvenance.sourceHash,r.rateProvenance.rateVersion,r.variationId]);await db.$client.query(`UPDATE app.variation SET state='priced',current_revision_id=$1 WHERE tenant_id=$2 AND id=$3`,[r.id,tenantId,r.variationId]);return r;}
export async function approvePricedVariation(db:TenantTransaction,tenantId:string,variationId:string,a:VariationApproval){const v=await db.$client.query(`SELECT job_id,current_revision_id,state FROM app.variation WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[tenantId,variationId]);const row=v.rows[0];if(!row||row.state!=="priced"&&row.state!=="approved"||row.current_revision_id!==a.revisionId)throw new Error("EXACT_CURRENT_PRICED_REVISION_REQUIRED");const exact=await db.$client.query(`SELECT 1 FROM app.variation_revision WHERE tenant_id=$1 AND id=$2 AND revision=$3 AND content_hash=$4 AND signed_delta_pence=$5`,[tenantId,a.revisionId,a.revision,a.contentHash,a.signedDeltaPence]);if(!exact.rowCount)throw new Error("EXACT_CURRENT_PRICED_REVISION_REQUIRED");const inserted=await db.$client.query(`INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,evidence_id,approved_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(tenant_id,revision_id) DO NOTHING RETURNING id`,[a.id,tenantId,row.job_id,variationId,a.revisionId,a.revision,a.contentHash,a.signedDeltaPence,a.method,a.actorMembershipId,a.evidenceId,a.approvedAt]);if(inserted.rowCount){await db.$client.query(`UPDATE app.variation SET state='approved' WHERE tenant_id=$1 AND id=$2`,[tenantId,variationId]);await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${a.actorMembershipId}`,eventType:"variation.approved",subjectType:"variation",subjectRef:variationId,payload:{references:{revisionId:a.revisionId,method:a.method},hashes:{contentHash:a.contentHash},classifications:{action:"commercial"}}}]);}return{...a,id:inserted.rows[0]?.id??(await db.$client.query(`SELECT id FROM app.variation_approval WHERE tenant_id=$1 AND revision_id=$2`,[tenantId,a.revisionId])).rows[0].id};}

export type VariationWorkspaceRow={id:string;scopeItemId:string;existingScopeItemId:string|null;lineageParentScopeItemId:string|null;description:string;captureText:string;state:string;currentRevisionId:string|null;revisions:Array<{id:string;revision:number;description:string;quantity:string;unit:string;unitRatePence:number;signedDeltaPence:number;contentHash:string;approved:boolean;rejected:boolean;actor:string;source:string}>};
const builderCaptureV1 = z.object({
 version: z.literal("log-builder-extra.v1"), proposal: z.unknown(), actorMembershipId: z.string().uuid(),
 price: z.unknown(), deviceId: z.string().min(1).max(200).nullable(), deviceCapturedAt: z.string().nullable(),
}).strict();
const withdrawalV1 = z.object({
 version: z.literal("variation-withdrawal.v1"), id: z.string().uuid(), jobId: z.string().uuid(), variationId: z.string().uuid(),
 actorMembershipId: z.string().uuid(), reasonCode: z.enum(["not_completed", "duplicate_capture", "entered_in_error", "builder_withdrawn"]),
}).strict();
export class BuilderCaptureError extends Error {
 constructor(readonly code: "INVALID_BUILDER_CAPTURE" | "FORBIDDEN" | "COMMAND_CONFLICT") { super(code); }
}
const captureCanonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value)
 ? `[${value.map(captureCanonical).join(",")}]`
 : `{${Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>`${JSON.stringify(key)}:${captureCanonical(child)}`).join(",")}}`;
export class VariationRepository{
 constructor(private readonly pool:Pool){}

 /** Non-commercial capture: same receipt/origin contract as SH-1, without send or fee authority. */
 async logBuilderExtra(context: VerifiedTenantContext, raw: unknown): Promise<{variationId:string}> {
  const parsed=builderCaptureV1.safeParse(raw);
  if(!parsed.success)throw new BuilderCaptureError("INVALID_BUILDER_CAPTURE");
  const proposalResult=variationProposalV1.safeParse(parsed.data.proposal);
  const priceResult=confirmedVariationPriceV1.nullable().safeParse(parsed.data.price);
  if(!proposalResult.success || !priceResult.success || !instantV1.nullable().safeParse(parsed.data.deviceCapturedAt).success)throw new BuilderCaptureError("INVALID_BUILDER_CAPTURE");
  const input={...parsed.data,proposal:proposalResult.data,price:priceResult.data},p=input.proposal;
  if(input.price && input.price.confirmedByMembershipId!==input.actorMembershipId)throw new BuilderCaptureError("FORBIDDEN");
  const requestHash=createHash("sha256").update(captureCanonical(input)).digest("hex");
  return withTenant(this.pool,context,async db=>{
   const member=(await db.$client.query<{role:string}>(`SELECT role FROM app.membership WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[context.tenantId,input.actorMembershipId])).rows[0];
   if(!member || member.role!=="owner")throw new BuilderCaptureError("FORBIDDEN");
   const claimed=await db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
    VALUES($1,$2,'LogBuilderExtra',$3,$4,'processing',$5) ON CONFLICT DO NOTHING RETURNING command_id`,[context.tenantId,p.id,`extra-origin:${p.jobId}:${p.id}`,requestHash,input.actorMembershipId]);
   if(!claimed.rowCount){
    const prior=(await db.$client.query<{request_hash:string;status:string;result:{variationId:string}}>(`SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND (command_id=$2 OR (command_type='LogBuilderExtra' AND semantic_key=$3))`,[context.tenantId,p.id,`extra-origin:${p.jobId}:${p.id}`])).rows[0];
    if(!prior || prior.request_hash!==requestHash || prior.status!=="succeeded")throw new BuilderCaptureError("COMMAND_CONFLICT");
    return prior.result;
   }
   const job=await db.$client.query(`SELECT j.id FROM app.job j JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=$1 AND j.id=$2 AND j.status='live' AND t.job_track='small_builder' AND t.environment='synthetic_demo' FOR UPDATE OF j`,[context.tenantId,p.jobId]);
   if(!job.rowCount)throw new BuilderCaptureError("FORBIDDEN");
   await insertVariationProposal(db,context.tenantId,p);
   await db.$client.query(`INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,device_id,device_captured_at,provenance)
    VALUES($1,$2,$3,'small_builder','builder_logged',$3,$4,$5,$6,$7,'command')`,[context.tenantId,p.jobId,p.id,input.actorMembershipId,member.role,input.deviceId,input.deviceCapturedAt]);
   if(input.price){
    const revision=priceVariation({id:randomUUID(),variationId:p.id,previous:null,proposal:p,description:p.description,
     contentHash:createHash("sha256").update(captureCanonical({description:p.description,price:input.price})).digest("hex"),confirmed:input.price});
    await insertPricedVariation(db,context.tenantId,revision);
   }
   const result={variationId:p.id};
   await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${input.actorMembershipId}`,eventType:"variation.builder_logged",subjectType:"variation",subjectRef:p.id,payload:{references:{jobId:p.jobId,commandId:p.id,origin:"builder_logged"},hashes:{capture:createHash("sha256").update(p.captureText).digest("hex")}}}]);
   await db.$client.query("UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2",[context.tenantId,p.id,JSON.stringify(result)]);
   return result;
  });
 }
 /** Persistence seam only; SV-2 adds no Withdraw command, route or screen. */
 async recordWithdrawal(context: VerifiedTenantContext, raw: unknown): Promise<void> {
  const parsed=withdrawalV1.safeParse(raw);
  if(!parsed.success)throw new BuilderCaptureError("INVALID_BUILDER_CAPTURE");
  const input=parsed.data;
  await withTenant(this.pool,context,async db=>{
   const member=await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[context.tenantId,input.actorMembershipId]);
   if(!member.rowCount)throw new BuilderCaptureError("FORBIDDEN");
   const row=await db.$client.query("SELECT id FROM app.variation WHERE tenant_id=$1 AND job_id=$2 AND id=$3 FOR UPDATE",[context.tenantId,input.jobId,input.variationId]);
   if(!row.rowCount)throw new BuilderCaptureError("FORBIDDEN");
   await db.$client.query(`INSERT INTO app.variation_withdrawal(tenant_id,job_id,id,variation_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,$5,$6)`,[context.tenantId,input.jobId,input.id,input.variationId,input.actorMembershipId,input.reasonCode]);
   await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${input.actorMembershipId}`,eventType:"variation.withdrawal_recorded",subjectType:"variation",subjectRef:input.variationId,payload:{references:{withdrawalId:input.id,jobId:input.jobId}}}]);
  });
 }
 async read(context:VerifiedTenantContext,jobId:string){return withTenant(this.pool,context,async db=>{const activation=await db.$client.query(`SELECT accepted_net_value_pence AS accepted_net_pence,recovery_cap_pence FROM app.job WHERE tenant_id=$1 AND id=$2 AND status='live'`,[context.tenantId,jobId]);if(!activation.rowCount)throw new Error("ACTIVATION_REQUIRED");const scope=await db.$client.query(`SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed' ORDER BY id LIMIT 1`,[context.tenantId,jobId]);if(!scope.rowCount)throw new Error("SCOPE_REQUIRED");const values=await db.$client.query(`SELECT v.id,v.scope_item_id,v.existing_scope_item_id,v.lineage_parent_scope_item_id,v.description,v.capture_text,v.state,v.current_revision_id,r.id revision_id,r.revision,r.description revision_description,r.quantity_decimal,r.unit,r.unit_rate_pence,r.signed_delta_pence,r.content_hash,r.confirmed_by_membership_id,r.rate_source_ref,(a.id IS NOT NULL) approved,(x.id IS NOT NULL) rejected FROM app.variation v LEFT JOIN app.variation_revision r ON r.tenant_id=v.tenant_id AND r.variation_id=v.id LEFT JOIN app.variation_approval a ON a.tenant_id=r.tenant_id AND a.revision_id=r.id LEFT JOIN app.variation_rejection x ON x.tenant_id=r.tenant_id AND x.revision_id=r.id WHERE v.tenant_id=$1 AND v.job_id=$2 ORDER BY v.created_at,r.revision`,[context.tenantId,jobId]);const map=new Map<string,VariationWorkspaceRow>();for(const row of values.rows){let item=map.get(row.id);if(!item){item={id:row.id,scopeItemId:row.scope_item_id,existingScopeItemId:row.existing_scope_item_id,lineageParentScopeItemId:row.lineage_parent_scope_item_id,description:row.description,captureText:row.capture_text,state:row.state,currentRevisionId:row.current_revision_id,revisions:[]};map.set(row.id,item)}if(row.revision_id)item.revisions.push({id:row.revision_id,revision:row.revision,description:row.revision_description,quantity:row.quantity_decimal,unit:row.unit,unitRatePence:Number(row.unit_rate_pence),signedDeltaPence:Number(row.signed_delta_pence),contentHash:row.content_hash,approved:row.approved,rejected:row.rejected,actor:`membership:${row.confirmed_by_membership_id}`,source:row.rate_source_ref});}return{baselinePence:Number(activation.rows[0].accepted_net_pence),capPence:Number(activation.rows[0].recovery_cap_pence),parentScopeItemId:scope.rows[0].id,variations:[...map.values()]};})}
 async transact<T>(context:VerifiedTenantContext,fn:(db:TenantTransaction)=>Promise<T>){return withTenant(this.pool,context,fn)}
 async reject(db:TenantTransaction,tenantId:string,input:{id:string;variationId:string;revisionId:string;actorMembershipId:string}){const row=await db.$client.query(`SELECT job_id FROM app.variation WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[tenantId,input.variationId]);if(!row.rowCount)throw new Error("VARIATION_NOT_FOUND");await db.$client.query(`INSERT INTO app.variation_rejection(id,tenant_id,job_id,variation_id,revision_id,actor_membership_id,reason_code,rejected_at)VALUES($1,$2,$3,$4,$5,$6,'customer_did_not_approve',transaction_timestamp()) ON CONFLICT(tenant_id,variation_id,revision_id) DO NOTHING`,[input.id,tenantId,row.rows[0].job_id,input.variationId,input.revisionId,input.actorMembershipId]);await db.$client.query(`UPDATE app.variation SET state='rejected' WHERE tenant_id=$1 AND id=$2 AND current_revision_id=$3`,[tenantId,input.variationId,input.revisionId]);return input}
}
