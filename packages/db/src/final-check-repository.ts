import { z } from "zod";
import type { Pool } from "pg";
import { FinalCheckError, finalCheckDispositionV1, type FinalCheckDisposition, type FinalCheckOutcome } from "@jobguard/core";
import { withTenant,type VerifiedTenantContext } from "./tenant-context.js";
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/u);
const sourceV1=z.object({id:uuid,evidenceId:uuid.nullable(),sourceKind:z.string(),sourceRef:uuid,objectVersionId:z.string().nullable(),sha256:hash.nullable(),receivedAt:z.string(),inputHash:hash,processable:z.boolean(),input:z.unknown(),status:z.enum(["pending","failed","unsupported","zero_result","detected"])}).strict();
const manifestV1=z.object({version:z.literal("final-check.manifest.v1"),id:uuid,lockId:uuid,cutoff:z.string(),hash,detectorVersion:z.string(),policyVersion:z.literal("final-check.reconciliation.v1"),sources:z.array(sourceV1),excludedUploads:z.array(z.object({uploadId:uuid,state:z.enum(["rejected","quarantined","expired"]),reason:z.string().min(1).max(200)}).strict()).optional(),comparisons:z.object({tenantId:uuid,jobId:uuid,captures:z.array(z.unknown()),baselineItemIds:z.array(uuid),lines:z.array(z.object({id:uuid,scopeItemId:uuid}).passthrough()),baselineRecordedAt:z.string(),baseline:z.array(z.record(z.string(),z.unknown()))}).strict(),result:z.object({runId:uuid,lockId:uuid,zeroResult:z.boolean(),classifications:z.array(z.unknown())}).strict().nullable(),signals:z.array(z.object({signalId:uuid,revision:z.number().int().nonnegative(),description:z.string(),scopeItemId:uuid.nullable(),coalescedIntoSignalId:uuid.nullable(),permanentExclusion:z.boolean(),evidenceIds:z.array(uuid)}).strict())}).strict();
export type FinalCheckManifest=z.infer<typeof manifestV1>;
export const finalCheckSourceResultV1=z.object({version:z.literal("final-check.source-result.v1"),inputHash:hash,status:z.enum(["failed","unsupported","zero_result","detected"]),failureCode:z.enum(["UNSUPPORTED_SOURCE","SOURCE_INVALID","PROCESSING_FAILED"]).nullable(),signalIds:z.array(uuid)}).strict().refine(v=>(v.status==="failed"||v.status==="unsupported")===(v.failureCode!==null)&&(v.status==="detected")===(v.signalIds.length>0));
export type FinalCheckSourceResult=z.infer<typeof finalCheckSourceResultV1>;
export type FinalCheckClassification={signalId:string;expectedRevision:number;outcome:FinalCheckOutcome;references:readonly string[];comparisons:{baselineItemIds:readonly string[];captureIds:readonly string[];lockedLineIds:readonly string[]}};
export type FinalCheckView=z.infer<typeof viewV1>;
const viewV1=z.object({state:z.enum(["unlocked","pending","failed","completed"]),lockId:uuid.optional(),runId:uuid.optional(),items:z.array(z.record(z.string(),z.unknown())),postLockItems:z.array(z.record(z.string(),z.unknown())).optional(),lockedLines:z.array(z.object({id:uuid,kind:z.enum(["baseline","variation"]),scopeItemId:uuid,description:z.string()}).strict()).optional()}).strict();
const codes=new Set(["INVALID_FINAL_CHECK_INPUT","FINAL_CHECK_FORBIDDEN","FINAL_CHECK_PENDING","FINAL_CHECK_SOURCE_CHANGED","FINAL_CHECK_FAILED","IDEMPOTENCY_CONFLICT","STALE_REVISION","FINAL_ACCOUNT_LOCK_REQUIRED"]);
const prerequisitePending=new Set(["FINAL_CHECK_NOT_COMPLETE","FINAL_CHECK_INVENTORY_INCOMPLETE","FINAL_CHECK_INPUT_UNAVAILABLE","FINAL_CHECK_INPUT_MISMATCH","FINAL_CHECK_DETECTION_REQUIRED","FINAL_CHECK_SIGNAL_BINDING_INVALID","FINAL_CHECK_LOCK_BINDING_INVALID","FINAL_CHECK_SOURCE_IDENTITY_CHANGED","FINAL_CHECK_RESULT_UNAVAILABLE"]);
function typed(e:unknown):never{
 const error=e as {message?:string;code?:string};
 if(error.message&&prerequisitePending.has(error.message))throw new FinalCheckError("FINAL_CHECK_PENDING");
 if(error.message==="FORBIDDEN"||error.message==="DISCLOSURE_TERMS_NOT_ACCEPTED")throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
 if(error.message==="IDEMPOTENCY_PAYLOAD_CONFLICT")throw new FinalCheckError("IDEMPOTENCY_CONFLICT");
 if(error.message&&codes.has(error.message))throw new FinalCheckError(error.message as FinalCheckError['code']);
 if(error.code==="22P02")throw new FinalCheckError("INVALID_FINAL_CHECK_INPUT");
 throw e;
}
/** All mutations use checked routines; no saved context, actor, provider or direct business DML. */
export class FinalCheckRepository{
 constructor(private readonly pool:Pool){}
 private async call(context:VerifiedTenantContext,sql:string,values:readonly unknown[]):Promise<unknown>{try{return await withTenant(this.pool,context,async db=>(await db.$client.query<{result:unknown}>(sql,[context.tenantId,...values])).rows[0]?.result);}catch(e){return typed(e);}}
 async begin(context:VerifiedTenantContext,jobId:string,detector="shadow-detection.v1"):Promise<FinalCheckManifest>{return manifestV1.parse(await this.call(context,"SELECT app.begin_final_check($1,$2,$3,$4) result",[uuid.parse(jobId),detector,"final-check.reconciliation.v1"]));}
 async manifest(context:VerifiedTenantContext,jobId:string,manifestId:string):Promise<FinalCheckManifest>{return manifestV1.parse(await this.call(context,"SELECT app.read_final_check_manifest($1,$2,$3) result",[uuid.parse(jobId),uuid.parse(manifestId)]));}
 async record(context:VerifiedTenantContext,jobId:string,manifestId:string,sourceId:string,attemptId:string,raw:FinalCheckSourceResult){const p=finalCheckSourceResultV1.safeParse(raw);if(!p.success)throw new FinalCheckError("INVALID_FINAL_CHECK_INPUT");return this.call(context,"SELECT app.record_final_check_source_result($1,$2,$3,$4,$5,$6::jsonb) result",[uuid.parse(jobId),uuid.parse(manifestId),uuid.parse(sourceId),uuid.parse(attemptId),JSON.stringify(p.data)]);}
 async reconcile(context:VerifiedTenantContext,jobId:string,manifestId:string,classifications:readonly FinalCheckClassification[]){return this.call(context,"SELECT app.complete_final_check($1,$2,$3,$4::jsonb) result",[uuid.parse(jobId),uuid.parse(manifestId),JSON.stringify(classifications)]);}
 async read(context:VerifiedTenantContext,jobId:string,digest:string):Promise<FinalCheckView>{return viewV1.parse(await this.call(context,"SELECT app.read_final_check_reveal($1,$2,$3) result",[uuid.parse(jobId),hash.parse(digest)]));}
 async disposition(context:VerifiedTenantContext,jobId:string,digest:string,raw:FinalCheckDisposition){const p=finalCheckDispositionV1.safeParse(raw);if(!p.success)throw new FinalCheckError("INVALID_FINAL_CHECK_INPUT");return this.call(context,"SELECT app.record_final_check_disposition($1,$2,$3,$4::jsonb) result",[uuid.parse(jobId),hash.parse(digest),JSON.stringify(p.data)]);}
 async disputes(context:VerifiedTenantContext,jobId:string,digest:string){return z.array(z.record(z.string(),z.unknown())).parse(await this.call(context,"SELECT app.read_final_check_disputes($1,$2,$3) result",[uuid.parse(jobId),hash.parse(digest)]));}
}
