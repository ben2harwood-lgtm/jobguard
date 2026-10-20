import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { jobWorkStateReadV1 } from "@jobguard/core";
import { seedWorkPractice as seedPractice, workTenant, type WorkFixture, type WorkJob } from "./job-work-state-fixtures.js";
/** Explicit command fixtures include pre-live synthetic small-builder jobs.
 * Legacy track binding runs only for live jobs; quoting jobs need a labelled binding.
 * No production authority or lifecycle gate is bypassed. */
export async function seedWorkPractice(f: WorkFixture) {
 const p = await seedPractice(f);
 await workTenant(f.admin,p.auth.context.tenantId,db=>db.query(
  "INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance,source_id) SELECT tenant_id,id,'small_builder','synthetic_demo','backfilled_synthetic_fixture',id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 ON CONFLICT(tenant_id,job_id) DO NOTHING",
  [p.auth.context.tenantId,p.auth.digest]));
 return p;
}
export type WorkPractice = Awaited<ReturnType<typeof seedWorkPractice>>;
export const workCommand = (action = "finish", extra: Record<string, unknown> = {}) => ({version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:0,action,...extra});
export async function commandOn(db: Pick<PoolClient,"query">, p: WorkPractice, input: unknown, jobId = p.jobId, digest = p.auth.digest) {
 const result = await db.query("SELECT app.ch4_record_work_state($1,$2,$3,$4::jsonb) result",[p.auth.context.tenantId,jobId,digest,JSON.stringify(input)]);
 return jobWorkStateReadV1.parse(result.rows[0].result);
}
export async function runWorkCommand(pool: Pool,p: WorkPractice,input:unknown,jobId=p.jobId,digest=p.auth.digest) {
 return workTenant(pool,p.auth.context.tenantId,db=>commandOn(db,p,input,jobId,digest));
}
export async function practiceWorkJob(f: WorkFixture,p:WorkPractice):Promise<WorkJob> {
 const scope=(await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 LIMIT 1",[p.auth.context.tenantId,p.jobId])).rows[0];
 return {tenantId:p.auth.context.tenantId,actorId:p.auth.membershipId,jobId:p.jobId,scopeId:scope?.id as string ?? randomUUID(),context:p.auth.context} as WorkJob;
}
export async function commandCounts(f:WorkFixture,p:WorkPractice) {
 const result: Record<string,number>={};
 for(const table of ["command_receipt","job_work_state_event","job_link","audit_event","synthetic_obligation","journal","recovery_fee_journal","action_outbox"]){
  result[table]=(await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[p.auth.context.tenantId])).rows[0].n as number;
 }
 return result;
}
/** Observe the actual blocked backend, avoiding timing-based race assumptions. */
export async function waitForJobLock(f:WorkFixture,pid:number) {
 for(let n=0;n<200;n++){
  const row=(await f.admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0];
  if(row?.wait_event_type==="Lock")return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error(`backend ${pid} did not reach lock wait`);
}
/** Ordinary generated successor; optional foreign-session owner exercises refusal
 * with valid common party bindings. Only party setup is a labelled fixture. */
export async function linkPair(f:WorkFixture,preLive=false,successorOwner?:WorkPractice){
 const seeded=await seedWorkPractice(f),t=seeded.auth.context.tenantId;
 const p=preLive?{...seeded,jobId:(await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='quoting' ORDER BY id LIMIT 1",[t,seeded.auth.digest])).rows[0].id as string}:seeded;
 const successor=(await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND id<>$3 ORDER BY id LIMIT 1",[t,successorOwner?.auth.digest??p.auth.digest,p.jobId])).rows[0].id as string;
 const source=(await f.admin.query("SELECT b.* FROM app.job_party_binding b JOIN app.job_party_current c ON(c.tenant_id,c.job_id,c.binding_id)=(b.tenant_id,b.job_id,b.id) WHERE b.tenant_id=$1 AND b.job_id=$2",[t,p.jobId])).rows[0];
 const binding=randomUUID();await workTenant(f.admin,t,async db=>{
  await db.query("INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) SELECT $1,$2,$3,coalesce(max(revision),0)+1,$4,$5,$6,$7,$8,$9,'backfilled_synthetic_fixture' FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$3",[t,binding,successor,source.customer_id,source.customer_revision_id,source.paying_party_id,source.paying_party_revision_id,source.site_id,source.site_revision_id]);
  await db.query("UPDATE app.job_party_current SET binding_id=$1 WHERE tenant_id=$2 AND job_id=$3",[binding,t,successor]);
 });
 const {boundaryLock}=await import("./job-work-state-fixtures.js");await boundaryLock(f,await practiceWorkJob(f,p));
 const input={version:"job-link-command.v1",action:"link",commandId:randomUUID(),expectedRevision:0,successorJobId:successor,predecessorBindingId:source.id as string,successorBindingId:binding};
 return {p,successor,input};
}
export async function runLink(pool:Pool,p:WorkPractice,input:unknown,jobId=p.jobId){return workTenant(pool,p.auth.context.tenantId,async db=>jobWorkStateReadV1.parse((await db.query("SELECT app.ch4_link_post_lock_job($1,$2,$3,$4::jsonb) result",[p.auth.context.tenantId,jobId,p.auth.digest,JSON.stringify(input)])).rows[0].result))}

/** Real synthetic adoption command; source lineage is the existing immutable audit contract. */
export async function importWorkJob(f:WorkFixture,p:WorkPractice,sourceJobId=p.jobId){
 const {AdoptInFlightJobMutation,UserCommandDispatcher}=await import("../src/index.js");
 const t=p.auth.context.tenantId,jobId=randomUUID(),baselineHash="b".repeat(64);
 const binding=(await f.admin.query("SELECT b.* FROM app.job_party_binding b JOIN app.job_party_current c ON(c.tenant_id,c.job_id,c.binding_id)=(b.tenant_id,b.job_id,b.id) WHERE b.tenant_id=$1 AND b.job_id=$2",[t,sourceJobId])).rows[0]!;
 const mutation=new AdoptInFlightJobMutation(t,"synthetic_candidate",{
  version:"adopt-job.v1",jobId,baselineId:randomUUID(),title:"Fictional inherited work job",lifecyclePoint:"live",
  provenance:"imported",lineageStrength:"builder_attested_weaker",baselineHash,baselineDescription:"Fictional baseline",
  acceptedNetValuePence:100000,recoveryCapPence:1500,acceptedValueSource:"builder_attestation",attestedByMembershipId:p.auth.membershipId,
  attestedAt:new Date(0),importTermsVersion:"synthetic_import_terms_candidate.v1",feePolicyVersion:"reference_fee_policy_v1",mode:"synthetic_candidate",
  parties:{customerRevisionId:binding.customer_revision_id as string,siteRevisionId:binding.site_revision_id as string},
 });
 await new UserCommandDispatcher(f.runtime).dispatch(p.auth.context,{
  version:"command.v1",commandId:randomUUID(),commandType:"job.adopt_in_flight",semanticKey:`import:${jobId}`,
  actorMembershipId:p.auth.membershipId,subjectType:"job",subjectRef:jobId,
  action:{actionType:"job.adopt_in_flight",recipient:null,contentHash:baselineHash,aggregateRevision:0,amountPence:100000,
   currency:"GBP",policyVersion:"synthetic_import_terms_candidate.v1",expiresAt:new Date(Date.now()+300000)},
 },{mutate:mutation.mutate.bind(mutation),auditEvents:(result,cmd)=>mutation.auditEvents(result,cmd).map(event=>({
  ...event,payload:{...event.payload,references:{...event.payload.references,sourceJobId}},
 }))});
 return {...p,jobId};
}
