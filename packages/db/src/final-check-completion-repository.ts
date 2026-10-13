import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
const uuid=z.string().uuid(), hash=z.string().regex(/^[a-f0-9]{64}$/u), policy=z.string().min(1).max(80);
const freezeInput=z.object({version:z.literal("final-check-manifest.v1"),jobId:uuid,manifestId:uuid,detectorVersion:policy,reconciliationVersion:policy}).strict();
const emptyInput=z.object({version:z.literal("final-check-empty-run.v1"),jobId:uuid,manifestId:uuid,runId:uuid,executionId:uuid}).strict();
const bindingInput=emptyInput.extend({version:z.literal("final-check-run.v1")}).strict();
const resultInput=z.object({version:z.literal("final-check-result-record.v1"),jobId:uuid,runId:uuid,resultId:uuid,signalId:uuid.nullable(),classificationId:uuid.nullable(),descriptor:z.union([z.object({version:z.literal("final-check-result.v1"),outcome:z.literal("zero_result")}).strict(),z.object({version:z.literal("final-check-result.v1"),signalId:uuid,classificationId:uuid,outcome:z.enum(["already_in_original_scope","builder_captured","already_on_final_account","duplicate_signal","not_enough_evidence","reveal"])}).strict()])}).strict();
const publicationInput=z.object({version:z.literal("final-check-publication.v1"),jobId:uuid,runId:uuid,checkId:uuid}).strict();
const attemptInput=z.object({version:z.literal("final-check-attempt.v1"),jobId:uuid,manifestId:uuid,sourceId:uuid,attemptId:uuid,executionId:uuid,stage:z.enum(["detection","reconciliation"]),processingVersion:policy,inputHash:hash,outcome:z.enum(["succeeded","failed","pending","invalidated"]),failureCode:z.string().min(1).max(80).nullable(),resultHash:hash.nullable(),resultSignalIds:z.array(uuid),evidenceId:uuid.nullable(),objectVersionId:z.string().min(1).max(1024).nullable(),sha256:hash.nullable(),sourceReceivedAt:z.string().datetime({offset:true}).nullable()}).strict();
const errorCodes=["INVALID_FINAL_CHECK_INPUT","FINAL_ACCOUNT_LOCK_REQUIRED","FINAL_CHECK_NOT_COMPLETE","FINAL_CHECK_FAILED","FINAL_CHECK_INVENTORY_INCOMPLETE","FINAL_CHECK_INPUT_UNAVAILABLE","FINAL_CHECK_INPUT_MISMATCH","FINAL_CHECK_DETECTION_REQUIRED","FINAL_CHECK_SIGNAL_BINDING_INVALID","FINAL_CHECK_LOCK_BINDING_INVALID","FINAL_CHECK_SOURCE_IDENTITY_CHANGED","FINAL_CHECK_RESULT_UNAVAILABLE","IDEMPOTENCY_PAYLOAD_CONFLICT","FORBIDDEN","DISCLOSURE_TERMS_NOT_ACCEPTED"] as const;
export type FinalCheckPersistenceErrorCode=typeof errorCodes[number];
export class FinalCheckPersistenceError extends Error {
 constructor(readonly code:FinalCheckPersistenceErrorCode){super(code);this.name="FinalCheckPersistenceError";}
}
const codes=new Set<string>(errorCodes);
function typed(error:unknown):never { const message=(error as {message?:string}).message;if(message&&codes.has(message))throw new FinalCheckPersistenceError(message as FinalCheckPersistenceErrorCode);throw error; }
function parse<T>(schema:z.ZodType<T>,raw:unknown):T{const result=schema.safeParse(raw);if(!result.success)throw new FinalCheckPersistenceError("INVALID_FINAL_CHECK_INPUT");return result.data;}
export type FinalCheckManifestView={id:string;lockId:string;cutoff:string;sourceCount:number;inventoryHash:string;detectorVersion:string;reconciliationVersion:string};
/** Worker proof storage. Every invocation requires the existing stamped context; none is retained or reconstructed. */
export class FinalCheckCompletionRepository {
 constructor(private readonly pool:Pool){}
 async freeze(context:VerifiedTenantContext,raw:z.infer<typeof freezeInput>):Promise<FinalCheckManifestView>{
  const c=parse(freezeInput,raw);
  try{return await withTenant(this.pool,context,async db=>{
   const prior=(await db.$client.query("SELECT * FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[context.tenantId,c.jobId,c.manifestId])).rows[0];
   if(prior&&(prior.detector_version!==c.detectorVersion||prior.reconciliation_version!==c.reconciliationVersion))throw new FinalCheckPersistenceError("IDEMPOTENCY_PAYLOAD_CONFLICT");
   if(!prior)await db.$client.query(`INSERT INTO app.final_check_manifest(tenant_id,job_id,id,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5)`,[context.tenantId,c.jobId,c.manifestId,c.detectorVersion,c.reconciliationVersion]);
   const row=(await db.$client.query(`SELECT *,to_char(evidence_cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cutoff FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[context.tenantId,c.jobId,c.manifestId])).rows[0];
   if(!row)throw new FinalCheckPersistenceError("FINAL_ACCOUNT_LOCK_REQUIRED");
   return {id:row.id,lockId:row.lock_id,cutoff:row.cutoff,sourceCount:row.source_count,inventoryHash:row.inventory_hash,detectorVersion:row.detector_version,reconciliationVersion:row.reconciliation_version};
  });}catch(error){return typed(error);}
 }
 async sources(context:VerifiedTenantContext,jobId:string,manifestId:string){
  parse(uuid,jobId);parse(uuid,manifestId);
  return withTenant(this.pool,context,async db=>(await db.$client.query(`SELECT id,upload_id,evidence_id,object_version_id,sha256,frozen_input_hash,adapter_version,to_char(source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') source_received_at FROM app.final_check_manifest_source WHERE tenant_id=$1 AND job_id=$2 AND manifest_id=$3 ORDER BY id`,[context.tenantId,jobId,manifestId])).rows);
 }
 async recordAttempt(context:VerifiedTenantContext,raw:z.infer<typeof attemptInput>){
  const c=parse(attemptInput,raw);
  try{await withTenant(this.pool,context,async db=>{await db.$client.query(`INSERT INTO app.final_check_source_attempt(tenant_id,job_id,manifest_id,source_id,id,execution_id,stage,version,input_hash,outcome,failure_code,result_hash,result_signal_ids,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::timestamptz)`,[context.tenantId,c.jobId,c.manifestId,c.sourceId,c.attemptId,c.executionId,c.stage,c.processingVersion,c.inputHash,c.outcome,c.failureCode,c.resultHash,c.resultSignalIds,c.evidenceId,c.objectVersionId,c.sha256,c.sourceReceivedAt]);});}catch(error){return typed(error);}
 }
 /** Explicit zero descriptor is allowed only for an independently server-inventoried empty manifest. */
 async bindEmptyRun(context:VerifiedTenantContext,raw:z.infer<typeof emptyInput>){
  const c=parse(emptyInput,raw);
  try{await withTenant(this.pool,context,async db=>{
   const m=(await db.$client.query("SELECT * FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[context.tenantId,c.jobId,c.manifestId])).rows[0];
   if(!m||m.source_count!==0)throw new FinalCheckPersistenceError("FINAL_CHECK_NOT_COMPLETE");
   const prior=(await db.$client.query("SELECT execution_id,manifest_id FROM app.final_check_run_binding WHERE tenant_id=$1 AND job_id=$2 AND run_id=$3",[context.tenantId,c.jobId,c.runId])).rows[0];
   if(prior){if(prior.execution_id!==c.executionId||prior.manifest_id!==c.manifestId)throw new FinalCheckPersistenceError("IDEMPOTENCY_PAYLOAD_CONFLICT");return;}
   await db.$client.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at,status) SELECT tenant_id,job_id,$4,reconciliation_version,evidence_cutoff_at,'completed' FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[context.tenantId,c.jobId,c.manifestId,c.runId]);
   await db.$client.query("INSERT INTO app.final_check_reveal_proof(tenant_id,job_id,run_id,id,projection_version,result_descriptor) VALUES($1,$2,$3,$3,'final-check-result.v1',$4::jsonb)",[context.tenantId,c.jobId,c.runId,JSON.stringify({version:"final-check-result.v1",outcome:"zero_result"})]);
   await db.$client.query(`INSERT INTO app.final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version) SELECT tenant_id,job_id,$4,id,lock_id,evidence_cutoff_at,$5,detector_version,reconciliation_version FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[context.tenantId,c.jobId,c.manifestId,c.runId,c.executionId]);
  });}catch(error){return typed(error);}
 }
 /** Final-check orchestration supplies classifications first; this records only reconstructible result proof. */
 async recordResult(context:VerifiedTenantContext,raw:z.infer<typeof resultInput>){
  const c=parse(resultInput,raw);
  try{await withTenant(this.pool,context,async db=>{await db.$client.query("INSERT INTO app.final_check_reveal_proof(tenant_id,job_id,run_id,id,signal_id,classification_id,projection_version,result_descriptor) VALUES($1,$2,$3,$4,$5,$6,'final-check-result.v1',$7::jsonb)",[context.tenantId,c.jobId,c.runId,c.resultId,c.signalId,c.classificationId,JSON.stringify(c.descriptor)]);});}catch(error){return typed(error);}
 }
 /** Bind an existing reconciliation run after source processing and result-proof persistence. */
 async bindRun(context:VerifiedTenantContext,raw:z.infer<typeof bindingInput>){
  const c=parse(bindingInput,raw);
  try{await withTenant(this.pool,context,async db=>{await db.$client.query(`INSERT INTO app.final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version) SELECT tenant_id,job_id,$4,id,lock_id,evidence_cutoff_at,$5,detector_version,reconciliation_version FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[context.tenantId,c.jobId,c.manifestId,c.runId,c.executionId]);});}catch(error){return typed(error);}
 }
 async publish(context:VerifiedTenantContext,raw:z.infer<typeof publicationInput>){
  const c=parse(publicationInput,raw);
  try{return await withTenant(this.pool,context,async db=>{
   // The certificate trigger rechecks qualified identity, stages, inventory and available results under locks.
   await db.$client.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,run_id,status) VALUES($1,$2,$4,$3,'completed')",[context.tenantId,c.jobId,c.runId,c.checkId]);
   return {checkId:c.checkId,runId:c.runId};
  });}catch(error){return typed(error);}
 }
}
