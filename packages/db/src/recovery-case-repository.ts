import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { recoveryCaseCommandV1, transitionRecoveryCase, type RecoveryCaseCommand, type RecoveryCaseState } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value,Object.keys(value as object).sort())).digest("hex");
export type RecoveryCaseView={id:string;jobId:string;caseType:string;state:RecoveryCaseState;claimedNetPence:number;landedNetPence:number;outstandingNetPence:number;writtenOffPence:number;currency:"GBP";counterparty:string;book:string;sourceType:string;sourceRefs:string[];revision:number;reviewerRef:string;createdDate:string};

export class RecoveryCaseRepository{
 constructor(private readonly pool:Pool){}
 async list(context:VerifiedTenantContext,jobId:string):Promise<RecoveryCaseView[]>{return withTenant(this.pool,context,async db=>{
  const rows=await db.$client.query<any>(`SELECT c.*,q.claimed_net_pence,q.reviewer_ref,q.revision,
   coalesce((SELECT sum(CASE WHEN e.event_type='record_landing' THEN e.amount_pence WHEN e.event_type='reverse_landing' THEN -e.amount_pence ELSE 0 END) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id),0) landed,
   coalesce((SELECT sum(e.amount_pence) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id AND e.event_type='write_off'),0) written_off,(SELECT count(*) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id) event_sequence,
   (SELECT e.to_state FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id ORDER BY e.sequence DESC LIMIT 1) state
   FROM app.recovery_case c JOIN LATERAL(SELECT * FROM app.recovery_claim_revision r WHERE r.tenant_id=c.tenant_id AND r.case_id=c.id ORDER BY revision DESC LIMIT 1)q ON true WHERE c.tenant_id=$1 AND c.job_id=$2 ORDER BY c.created_at,c.id`,[context.tenantId,jobId]);
  return rows.rows.map((x:any)=>({id:x.id,jobId:x.job_id,caseType:x.case_type,state:x.state,claimedNetPence:Number(x.claimed_net_pence),landedNetPence:Number(x.landed),outstandingNetPence:Math.max(0,Number(x.claimed_net_pence)-Number(x.landed)-Number(x.written_off)),writtenOffPence:Number(x.written_off),currency:"GBP",counterparty:x.counterparty,book:x.book,sourceType:x.source_type,sourceRefs:x.source_refs,revision:Number(x.revision)+(Number(x.event_sequence??0)),reviewerRef:x.reviewer_ref,createdDate:new Date(x.created_at).toISOString().slice(0,10)}));
 })}
 async command(context:VerifiedTenantContext,jobId:string,raw:unknown):Promise<RecoveryCaseView>{const input=recoveryCaseCommandV1.parse(raw),hash=digest(input);let caseId="";await withTenant(this.pool,context,async db=>{
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.tenantId,input.action==="open"?jobId:input.caseId]);
  const replay=await db.$client.query<any>("SELECT case_id,payload_hash FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2",[context.tenantId,input.commandId]);
  if(replay.rowCount){if(replay.rows[0].payload_hash!==hash)throw new Error("IDEMPOTENCY_PAYLOAD_CONFLICT");caseId=replay.rows[0].case_id;return;}
  const job=await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2",[context.tenantId,jobId]);if(!job.rowCount)throw new Error("RECOVERY_JOB_NOT_FOUND");
  if(input.action==="open"){
   caseId=randomUUID();const claimId=randomUUID();
   await db.$client.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,$4,'GBP',CASE WHEN $5='prevention' THEN 'prevented' ELSE 'identified' END,0,true,$5,$6,$7,$8,$9)",[caseId,context.tenantId,jobId,input.claimedNetPence,input.caseType,input.counterparty,input.book,input.sourceType,JSON.stringify(input.sourceRefs)]);
   const claimHash=digest({caseId,revision:1,claimedNetPence:input.claimedNetPence,reviewerRef:input.reviewerRef});
   await db.$client.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,$5,'GBP',$6,$7)",[claimId,context.tenantId,jobId,caseId,input.claimedNetPence,input.reviewerRef,claimHash]);
   const state=input.caseType==="prevention"?"prevented":"identified",event=input.caseType==="prevention"?"prevent":"opened";
   await db.$client.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,$5,NULL,$6,$7,$8,$9)",[randomUUID(),context.tenantId,jobId,caseId,event,state,input.reviewerRef,input.commandId,hash]);
  }else{
   caseId=input.caseId;const current=await db.$client.query<any>(`SELECT c.job_id,(SELECT max(revision) FROM app.recovery_claim_revision r WHERE r.tenant_id=c.tenant_id AND r.case_id=c.id) claim_revision,(SELECT count(*) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id) event_count,(SELECT to_state FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id ORDER BY sequence DESC LIMIT 1) state,(SELECT claimed_net_pence FROM app.recovery_claim_revision r WHERE r.tenant_id=c.tenant_id AND r.case_id=c.id ORDER BY revision DESC LIMIT 1) claimed,(SELECT coalesce(sum(CASE WHEN event_type='record_landing' THEN amount_pence WHEN event_type='reverse_landing' THEN -amount_pence ELSE 0 END),0) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id) landed,(SELECT payload_hash FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id ORDER BY sequence DESC LIMIT 1) previous_hash FROM app.recovery_case c WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.id=$3`,[context.tenantId,jobId,caseId]);
   if(!current.rowCount)throw new Error("RECOVERY_CASE_NOT_FOUND");const x=current.rows[0],revision=Number(x.claim_revision)+Number(x.event_count);if(input.expectedRevision!==revision)throw new Error("RECOVERY_STALE_REVISION");
   if(input.action==="amend_claim")await db.$client.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,'GBP',$7,$8,(SELECT subject_hash FROM app.recovery_claim_revision WHERE tenant_id=$2 AND case_id=$4 ORDER BY revision DESC LIMIT 1))",[randomUUID(),context.tenantId,jobId,caseId,Number(x.claim_revision)+1,input.claimedNetPence,input.reviewerRef,digest(input)]);
   else {const next=transitionRecoveryCase({state:x.state, event:input.eventType,claimedPence:Number(x.claimed),landedPence:Number(x.landed),...(input.amountPence===undefined?{}:{amountPence:input.amountPence})});await db.$client.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,amount_pence,reviewer_ref,command_id,payload_hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[randomUUID(),context.tenantId,jobId,caseId,Number(x.event_count)+1,input.eventType,x.state,next.state,input.eventType==="write_off"?next.writtenOffPence:input.amountPence??null,input.reviewerRef,input.commandId,hash,x.previous_hash]);}
   if(input.action==="amend_claim")await db.$client.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash,previous_hash) VALUES($1,$2,$3,$4,$5,'claim_amended',$6,$6,$7,$8,$9,$10)",[randomUUID(),context.tenantId,jobId,caseId,Number(x.event_count)+1,x.state,input.reviewerRef,input.commandId,hash,x.previous_hash]);
  }
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:input.reviewerRef,eventType:`recovery.${input.action}`,subjectType:"recovery_case",subjectRef:caseId,payload:{references:{jobId,commandId:input.commandId},hashes:{command:hash},classifications:{recovery:"financial"}}}]);
 });return (await this.list(context,jobId)).find(x=>x.id===caseId)!}
}
