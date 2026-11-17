import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { recoveryCaseTermsCommandV1, recoveryCaseTermsV1, type RecoveryCaseTerms } from "@jobguard/core";
import { CommandError, UserCommandDispatcher } from "./commands.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
const CODES=["RECOVERY_TERMS_FORBIDDEN","RECOVERY_TERMS_COMMAND_CONFLICT","RECOVERY_TERMS_CASE_NOT_FOUND","RECOVERY_TERMS_NOT_APPLICABLE","RECOVERY_TERMS_POLICY_MISMATCH","RECOVERY_TERMS_ALREADY_APPROVED","RECOVERY_TERMS_AUTHORIZATION_INVALID"] as const;
export class RecoveryCaseTermsError extends Error {
 constructor(readonly code:(typeof CODES)[number]) { super(code);this.name="RecoveryCaseTermsError"; }
}
const uuid=(value:string)=>z.string().uuid().parse(value).toLowerCase();
const rowSchema=z.object({id:z.string(),tenant_id:z.string(),job_id:z.string(),case_id:z.string(),terms_version:z.string(),fee_policy_version:z.string(),eligibility_policy_version:z.string(),policy_status:z.string(),environment:z.string(),terms_hash:z.string(),actor_membership_id:z.string(),command_id:z.string(),authorization_id:z.string(),approved_at:z.coerce.date()});
function fromRow(raw:unknown):RecoveryCaseTerms {
 const r=rowSchema.parse(raw);
 return recoveryCaseTermsV1.parse({version:"recovery-case-terms.v1",id:r.id,tenantId:r.tenant_id,jobId:r.job_id,caseId:r.case_id,termsVersion:r.terms_version,feePolicyVersion:r.fee_policy_version,eligibilityPolicyVersion:r.eligibility_policy_version,policyStatus:r.policy_status,environment:r.environment,termsHash:r.terms_hash.trim(),actorMembershipId:r.actor_membership_id,commandId:r.command_id,authorizationId:r.authorization_id,approvedAt:r.approved_at.toISOString(),realExternalActions:0});
}
function translate(error:unknown):never {
 if(error instanceof CommandError)throw new RecoveryCaseTermsError(error.code==="FORBIDDEN"?"RECOVERY_TERMS_FORBIDDEN":error.code==="COMMAND_CONFLICT"?"RECOVERY_TERMS_COMMAND_CONFLICT":"RECOVERY_TERMS_AUTHORIZATION_INVALID");
 const pg=error as {code?:string;message?:string};
 const code=CODES.find(code=>code===pg?.message);
 if(code&&["42501","23514","40001"].includes(pg.code??""))throw new RecoveryCaseTermsError(code);
 // A foreign actor receipt fails its tenant-qualified FK before the dispatcher's owner lookup.
 if(pg?.code==="23503"&&(error as {constraint?:string}).constraint==="command_receipt_tenant_id_actor_membership_id_fkey")throw new RecoveryCaseTermsError("RECOVERY_TERMS_FORBIDDEN");
 throw error;
}
export class RecoveryCaseTermsRepository {
 constructor(private readonly pool:Pool){}
 async approve(context:VerifiedTenantContext,jobId:string,raw:unknown,actor:Readonly<{membershipId:string;identityUserId:string}>):Promise<RecoveryCaseTerms> {
  const parsed=recoveryCaseTermsCommandV1.parse(raw),job=uuid(jobId),caseId=uuid(parsed.caseId),commandId=uuid(parsed.commandId),membershipId=uuid(actor.membershipId);
  try {
   const result = await new UserCommandDispatcher(this.pool).dispatch(context,{version:"command.v1",commandId,commandType:"recovery.terms.approve",semanticKey:`recovery-terms-approve:${caseId}:${parsed.termsVersion}`,actorMembershipId:membershipId,subjectType:"recovery_case",subjectRef:caseId,
    action:{actionType:"recovery.terms.approve",recipient:null,amountPence:null,currency:null,aggregateRevision:1,policyVersion:parsed.feePolicyVersion,contentHash:parsed.termsHash,expiresAt:new Date("2099-01-01T00:00:00.000Z")}}, {
    mutate:async(db,command)=>{
     // Receipt first, shared case advisory key next; no pre-receipt lock hook.
     await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.tenantId,caseId]);
     return fromRow((await db.$client.query("SELECT * FROM app.approve_recovery_case_terms($1,$2,$3,$4,$5,$6,$7)",[context.tenantId,randomUUID(),job,caseId,membershipId,command.commandId,command.authorizationId])).rows[0]);
    },
    auditEvents:result=>[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${membershipId}`,eventType:"recovery.terms.approved",subjectType:"recovery_case",subjectRef:caseId,payload:{references:{jobId:job,commandId,termsApprovalId:result.id,authorizationId:result.authorizationId},hashes:{terms:result.termsHash},classifications:{recovery:"financial"}}}],
   });
   if(result.jobId!==job)throw new RecoveryCaseTermsError("RECOVERY_TERMS_CASE_NOT_FOUND");
   return result;
  }catch(error){return translate(error);}
 }
 async read(context:VerifiedTenantContext,jobId:string,caseId:string):Promise<RecoveryCaseTerms|null> {
  return withTenant(this.pool,context,async db=>{const row=(await db.$client.query("SELECT * FROM app.recovery_case_terms_approval WHERE tenant_id=$1 AND job_id=$2 AND case_id=$3 AND terms_version='synthetic_recovery_fee_terms.v1'",[context.tenantId,uuid(jobId),uuid(caseId)])).rows[0];return row?fromRow(row):null;});
 }
}
