import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { assertClaimAmendable, assertRecoverySources, classifyReferenceD03, RecoverySourceError, recoveryCaseCommandV1, recoveryEligibilityCommandV1, transitionRecoveryCase, type RecoveryEligibilityCommand, type RecoveryCaseState } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { resolveRecoverySources, type RecoverySourceView } from "./recovery-case-sources.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value,Object.keys(value as object).sort())).digest("hex");
export type EligibilityView={revision:number;caseRevision:number;evidenceRevision:number;policyVersion:"reference-d03.v1";policyRevision:number;classification:string;eligibleNetPence:number|null;reason:string;citations:string[];status:"reviewed"|"approved"|"superseded";reviewerRef:string};
export type RecoveryCaseView={id:string;jobId:string;caseType:string;state:RecoveryCaseState;claimedNetPence:number;landedNetPence:number;outstandingNetPence:number;writtenOffPence:number;currency:"GBP";counterparty:string;book:string;sourceType:string;sourceRefs:string[];sources:RecoverySourceView[];feeJobLiabilityPence:number;feeObligationsPostedPence:number;feeCompensationsPostedPence:number;approvedLandedNetPence:number;revision:number;reviewerRef:string;createdDate:string;eligibility:EligibilityView|null};

export class RecoveryReviewerError extends Error {
 constructor(readonly code: "RECOVERY_REVIEWER_FORBIDDEN") { super(code); }
}

export class RecoveryEligibilityError extends Error {
 constructor(readonly code: "ELIGIBILITY_REVIEW_REQUIRED" | "ELIGIBILITY_REVIEWER_FORBIDDEN") { super(code); }
}

export class RecoveryCaseRepository{
 constructor(private readonly pool:Pool){}
 async list(context:VerifiedTenantContext,jobId:string):Promise<RecoveryCaseView[]>{return withTenant(this.pool,context,async db=>{
  const rows=await db.$client.query<any>(`SELECT c.*,
   er.revision eligibility_revision,er.case_revision eligibility_case_revision,er.evidence_revision,er.policy_version,er.policy_revision,er.classification,er.eligible_net_pence,er.reason eligibility_reason,er.citations,er.status eligibility_status,er.reviewer_ref eligibility_reviewer,
   (SELECT COALESCE(sum(CASE j.kind WHEN 'fee_obligation' THEN j.amount_pence ELSE -j.amount_pence END),0) FROM app.recovery_fee_journal j WHERE j.tenant_id=c.tenant_id AND j.job_id=c.job_id)::bigint fee_job_liability_pence,
   (SELECT COALESCE(sum(j.amount_pence),0) FROM app.recovery_fee_journal j JOIN app.recovery_fee_derivation d ON(d.tenant_id,d.id)=(j.tenant_id,j.derivation_id) JOIN app.landing_allocation a ON(a.tenant_id,a.id)=(d.tenant_id,d.source_allocation_id) WHERE j.tenant_id=c.tenant_id AND j.kind='fee_obligation' AND a.case_id=c.id)::bigint fee_obligations_posted_pence,
   (SELECT COALESCE(sum(j.amount_pence),0) FROM app.recovery_fee_journal j JOIN app.recovery_fee_derivation d ON(d.tenant_id,d.id)=(j.tenant_id,j.derivation_id) JOIN app.landing_reversal rv ON(rv.tenant_id,rv.id)=(d.tenant_id,d.source_reversal_id) JOIN app.landing_allocation a ON(a.tenant_id,a.id)=(rv.tenant_id,rv.allocation_id) WHERE j.tenant_id=c.tenant_id AND j.kind='compensation' AND a.case_id=c.id)::bigint fee_compensations_posted_pence
   FROM app.recovery_case_current c LEFT JOIN LATERAL(SELECT * FROM app.recovery_eligibility_revision r WHERE r.tenant_id=c.tenant_id AND r.case_id=c.id ORDER BY revision DESC LIMIT 1)er ON true WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.claim_revision IS NOT NULL ORDER BY c.created_at,c.id`,[context.tenantId,jobId]);
  const out:RecoveryCaseView[]=[];for(const x of rows.rows as any[]){const sources=await resolveRecoverySources(db,context.tenantId,jobId,x.source_type,x.source_refs).catch(failure=>{if(failure instanceof RecoverySourceError)return (x.source_refs as string[]).map(ref=>({ref,kind:"Unresolved source",label:ref,recorded:false}));throw failure});out.push(({id:x.id,jobId:x.job_id,caseType:x.case_type,state:x.state,claimedNetPence:Number(x.claim_pence),landedNetPence:Number(x.landed),outstandingNetPence:Number(x.claim_pence)-Number(x.landed)-Number(x.written_off),writtenOffPence:Number(x.written_off),currency:"GBP",counterparty:x.counterparty,book:x.book,sourceType:x.source_type,sourceRefs:x.source_refs,sources,feeJobLiabilityPence:Number(x.fee_job_liability_pence),feeObligationsPostedPence:Number(x.fee_obligations_posted_pence),feeCompensationsPostedPence:Number(x.fee_compensations_posted_pence),approvedLandedNetPence:Number(x.approved_landed),revision:Number(x.revision),reviewerRef:x.reviewer_ref,createdDate:new Date(x.created_at).toISOString().slice(0,10),eligibility:x.eligibility_revision?{revision:Number(x.eligibility_revision),caseRevision:Number(x.eligibility_case_revision),evidenceRevision:Number(x.evidence_revision),policyVersion:x.policy_version,policyRevision:Number(x.policy_revision),classification:x.classification,eligibleNetPence:x.eligible_net_pence===null?null:Number(x.eligible_net_pence),reason:x.eligibility_reason,citations:x.citations,status:x.eligibility_status,reviewerRef:x.eligibility_reviewer}:null}));}return out;
 })}
 async eligibilityCommand(context:VerifiedTenantContext,jobId:string,raw:unknown,reviewer:Readonly<{membershipId:string;identityUserId:string}>):Promise<RecoveryCaseView>{const input=recoveryEligibilityCommandV1.parse(raw),hash=digest(input);const caseId=input.caseId.toLowerCase();await withTenant(this.pool,context,async db=>{
  // Recheck the server-selected principal in the write transaction, including replays.
  // Hold the membership against revocation until the revision and audit commit.
  // FOR SHARE needs UPDATE on app.membership, which jobguard_runtime already holds (0000_tenancy.sql). Do not tighten that grant without replacing this lock.
  const membership=await db.$client.query<{id:string}>(`SELECT id FROM app.membership
   WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND role='owner'
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
   FOR SHARE`,[context.tenantId,reviewer.membershipId,reviewer.identityUserId]);
  if(membership.rowCount!==1)throw new RecoveryEligibilityError("ELIGIBILITY_REVIEWER_FORBIDDEN");
  const authorizedReviewer=`membership:${membership.rows[0]!.id}`;
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.tenantId,caseId]);
  const replay=await db.$client.query<any>("SELECT subject_hash,job_id FROM app.recovery_eligibility_revision WHERE tenant_id=$1 AND command_id=$2",[context.tenantId,input.commandId]);if(replay.rowCount){if(replay.rows[0].subject_hash!==hash||replay.rows[0].job_id!==jobId.toLowerCase())throw new Error("IDEMPOTENCY_PAYLOAD_CONFLICT");return;}
  const current=await db.$client.query<any>(`SELECT c.case_type,c.source_refs,q.claimed_net_pence,q.revision claim_revision,(SELECT count(*) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id) event_count FROM app.recovery_case c JOIN LATERAL(SELECT * FROM app.recovery_claim_revision q WHERE q.tenant_id=c.tenant_id AND q.case_id=c.id ORDER BY revision DESC LIMIT 1)q ON true WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.id=$3`,[context.tenantId,jobId,caseId]);
  if(!current.rowCount)throw new Error("RECOVERY_CASE_NOT_FOUND");const c=current.rows[0],caseRevision=Number(c.claim_revision)+Number(c.event_count);if(input.expectedCaseRevision!==caseRevision)throw new Error("ELIGIBILITY_STALE_REVISION");
  const latest=await db.$client.query<any>("SELECT * FROM app.recovery_eligibility_revision WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision DESC LIMIT 1",[context.tenantId,caseId]);const old=latest.rows[0],revision=Number(old?.revision??0)+1;
  let row:{scenario:string;classification:string;eligibleNetPence:number|null;reason:string;citations:string[];status:string;evidenceRevision:number;policyVersion:string;policyRevision:number};
  if(input.action==="review"){if(old&&(input.evidenceRevision<Number(old.evidence_revision)||input.policyRevision<Number(old.policy_revision)))throw new Error("ELIGIBILITY_STALE_REVISION");const result=classifyReferenceD03(input.scenario,Number(c.claimed_net_pence));row={scenario:input.scenario,...result,citations:c.source_refs,status:"reviewed",evidenceRevision:input.evidenceRevision,policyVersion:input.policyVersion,policyRevision:input.policyRevision};}
  else if(input.action==="approve"){if(!old||old.revision!==input.expectedReviewRevision||old.case_revision!==caseRevision||old.evidence_revision!==input.expectedEvidenceRevision||old.policy_revision!==input.expectedPolicyRevision)throw new Error("ELIGIBILITY_STALE_REVISION");if(old.status!=="reviewed")throw new RecoveryEligibilityError("ELIGIBILITY_REVIEW_REQUIRED");if(old.classification!=="eligible_for_review")throw new Error("ELIGIBILITY_NOT_APPROVABLE");row={scenario:old.scenario,classification:old.classification,eligibleNetPence:Number(old.eligible_net_pence),reason:old.reason,citations:old.citations,status:"approved",evidenceRevision:Number(old.evidence_revision),policyVersion:old.policy_version,policyRevision:Number(old.policy_revision)};}
  else {if(!old)throw new Error("ELIGIBILITY_REVIEW_NOT_FOUND");row={scenario:old.scenario,classification:old.classification,eligibleNetPence:old.eligible_net_pence===null?null:Number(old.eligible_net_pence),reason:old.reason,citations:old.citations,status:"superseded",evidenceRevision:Number(old.evidence_revision)+(input.subject==="evidence"?1:0),policyVersion:old.policy_version,policyRevision:Number(old.policy_revision)+(input.subject==="policy"?1:0)};}
  await db.$client.query("INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash,previous_hash)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'GBP',$13,$14,$15,$16,$17,$18,$19)",[randomUUID(),context.tenantId,jobId,caseId,revision,caseRevision,row.evidenceRevision,row.policyVersion,row.policyRevision,row.scenario,row.classification,row.eligibleNetPence,row.reason,JSON.stringify(row.citations),row.status,authorizedReviewer,input.commandId,hash,old?.subject_hash??null]);
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:authorizedReviewer,eventType:`recovery.eligibility.${input.action}`,subjectType:"recovery_case",subjectRef:caseId,payload:{references:{jobId,commandId:input.commandId},hashes:{command:hash},classifications:{recovery:"financial"}}}]);
 });return (await this.list(context,jobId)).find(x=>x.id===caseId)!}
 async command(context:VerifiedTenantContext,jobId:string,raw:unknown,reviewer:Readonly<{membershipId:string;identityUserId:string}>):Promise<RecoveryCaseView>{
  if(!reviewer?.membershipId||!reviewer?.identityUserId)throw new RecoveryReviewerError("RECOVERY_REVIEWER_FORBIDDEN");
  // The caller supplies the server-selected principal; any client reviewer field is ignored and replaced below.
  const parsed=recoveryCaseCommandV1.parse(raw);let caseId="";await withTenant(this.pool,context,async db=>{
  // Recheck the principal INSIDE the write transaction, before replay, the advisory lock or any write, and hold the membership against
  // revocation until the case, claim, event and audit commit (FOR SHARE needs UPDATE on app.membership, which jobguard_runtime already holds; do not tighten that grant without replacing this lock).
  const membership=await db.$client.query<{id:string}>(`SELECT id FROM app.membership
   WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND role='owner'
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
   FOR SHARE`,[context.tenantId,reviewer.membershipId,reviewer.identityUserId]);
  if(membership.rowCount!==1)throw new RecoveryReviewerError("RECOVERY_REVIEWER_FORBIDDEN");
  const input={...parsed,reviewerRef:`membership:${membership.rows[0]!.id}`},hash=digest(input);
  // Lock order shared with app.approve_synthetic_landing: case advisory key first, then
  // (inside the routine) job row and case row. The runtime role cannot lock job rows
  // (no UPDATE privilege), so it must never take a job-row lock before this key.
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.tenantId,(input.action==="open"?jobId:input.caseId).toLowerCase()]);
  const replay=await db.$client.query<any>("SELECT case_id,payload_hash,job_id FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2",[context.tenantId,input.commandId]);
  // A replay must target the job the command was first recorded for; the same id and body against another job is a conflict, never that job's case list.
  if(replay.rowCount){if(replay.rows[0].payload_hash!==hash||replay.rows[0].job_id!==jobId.toLowerCase())throw new Error("IDEMPOTENCY_PAYLOAD_CONFLICT");caseId=replay.rows[0].case_id;return;}
  const job=await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2",[context.tenantId,jobId]);if(!job.rowCount)throw new Error("RECOVERY_JOB_NOT_FOUND");
  if(input.action==="open"){
   assertRecoverySources(input);
   await resolveRecoverySources(db,context.tenantId,jobId,input.sourceType,input.sourceRefs);
   caseId=randomUUID();const claimId=randomUUID();
   await db.$client.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,$4,'GBP',CASE WHEN $5='prevention' THEN 'prevented' ELSE 'identified' END,0,true,$5,$6,$7,$8,$9)",[caseId,context.tenantId,jobId,input.claimedNetPence,input.caseType,input.counterparty,input.book,input.sourceType,JSON.stringify(input.sourceRefs)]);
   const claimHash=digest({caseId,revision:1,claimedNetPence:input.claimedNetPence,reviewerRef:input.reviewerRef});
   await db.$client.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,$5,'GBP',$6,$7)",[claimId,context.tenantId,jobId,caseId,input.claimedNetPence,input.reviewerRef,claimHash]);
   const state=input.caseType==="prevention"?"prevented":"identified",event=input.caseType==="prevention"?"prevent":"opened";
   await db.$client.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,$5,NULL,$6,$7,$8,$9)",[randomUUID(),context.tenantId,jobId,caseId,event,state,input.reviewerRef,input.commandId,hash]);
  }else{
   caseId=input.caseId;const current=await db.$client.query<any>(`SELECT * FROM app.recovery_case_current WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND claim_revision IS NOT NULL`,[context.tenantId,jobId,caseId]);
   if(!current.rowCount)throw new Error("RECOVERY_CASE_NOT_FOUND");const x=current.rows[0],revision=Number(x.revision);if(input.expectedRevision!==revision)throw new Error("RECOVERY_STALE_REVISION");
   if(input.action==="amend_claim")assertClaimAmendable({state:x.state,currentClaimedPence:Number(x.claim_pence),claimedPence:input.claimedNetPence,landedPence:Number(x.landed),writtenOffPence:Number(x.written_off)});
   if(input.action==="amend_claim")await db.$client.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,'GBP',$7,$8,(SELECT subject_hash FROM app.recovery_claim_revision WHERE tenant_id=$2 AND case_id=$4 ORDER BY revision DESC LIMIT 1))",[randomUUID(),context.tenantId,jobId,caseId,Number(x.claim_revision)+1,input.claimedNetPence,input.reviewerRef,digest(input)]);
   else {const next=transitionRecoveryCase({state:x.state, event:input.eventType,claimedPence:Number(x.claim_pence),landedPence:input.eventType==="record_landing"||input.eventType==="reverse_landing"?Number(x.manual_landed):Number(x.landed),writtenOffPence:Number(x.written_off),...(input.amountPence===undefined?{}:{amountPence:input.amountPence})});await db.$client.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,amount_pence,reviewer_ref,command_id,payload_hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[randomUUID(),context.tenantId,jobId,caseId,Number(x.event_count)+1,input.eventType,x.state,next.state,input.eventType==="write_off"?next.writtenOffPence:input.amountPence??null,input.reviewerRef,input.commandId,hash,x.previous_hash]);}
   if(input.action==="amend_claim")await db.$client.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash,previous_hash) VALUES($1,$2,$3,$4,$5,'claim_amended',$6,$6,$7,$8,$9,$10)",[randomUUID(),context.tenantId,jobId,caseId,Number(x.event_count)+1,x.state,input.reviewerRef,input.commandId,hash,x.previous_hash]);
  }
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:input.reviewerRef,eventType:`recovery.${input.action}`,subjectType:"recovery_case",subjectRef:caseId,payload:{references:{jobId,commandId:input.commandId},hashes:{command:hash},classifications:{recovery:"financial"}}}]);
 });return (await this.list(context,jobId)).find(x=>x.id===caseId)!}
}
