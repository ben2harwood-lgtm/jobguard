// TEST ONLY: current repositories running against real pre-0475 upgrade schemas.
// Current or partially damaged LP-5 schemas always use the production module.
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "../src/tenant-context.js";
type RepositoryModule=typeof import("../src/repository-command.js");
type Spec=Parameters<RepositoryModule["beginRepositoryCommand"]>[1];
type Claim=Spec&{input:Record<string,any>;effect?:Record<string,unknown>};
const pending=new WeakMap<TenantTransaction,Map<string,Claim>>();
const observed=new WeakSet<TenantTransaction>();
const failure=(message:string,code="23514"):never=>{throw Object.assign(new Error(message),{code});};
export async function historicalRepositorySchema(client:Pick<PoolClient,"query">):Promise<boolean>{
 const row=(await client.query<{begin_installed:boolean;complete_installed:boolean;claims_installed:boolean;registry_installed:boolean;guard_installed:boolean}>(`SELECT
  to_regprocedure('app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb)') IS NOT NULL AS begin_installed,
  to_regprocedure('app.complete_command(uuid,jsonb)') IS NOT NULL AS complete_installed,
  to_regclass('app.command_lifecycle_claim') IS NOT NULL AS claims_installed,
  to_regclass('app.command_type_registry') IS NOT NULL AS registry_installed,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('app.command_receipt') AND tgname='lp5_command_completion') AS guard_installed`)).rows[0];
 return row?.begin_installed===false&&row.complete_installed===false&&row.claims_installed===false&&row.registry_installed===false&&row.guard_installed===false;
}
function observeCheckedResults(db:TenantTransaction){
 if(observed.has(db))return;observed.add(db);
 const client=db.$client as unknown as {query:(...args:any[])=>Promise<any>},originalQuery=client.query;
 client.query=async(...args:any[])=>{
  const sql=args[0],values=args[1];
  try{
   const result=await originalQuery.apply(client,args);
   // Preserve the exact result returned by the historical checked routine. This
   // observes real PostgreSQL output; it changes no statement or result.
   if(typeof sql==="string"&&/SELECT app\.(?:xa_(?:submit|price|approve|withdraw|mark_duplicate|revoke_link|client_decide)|ent3b_(?:start|complete)_visit)\(/u.test(sql)&&Array.isArray(values)){
    for(const [id,claim] of pending.get(db)??[]){if(values.includes(id)&&result.rows[0])claim.effect=result.rows[0];}
   }
   return result;
  }finally{
   // Physical pooled clients outlive the transaction wrapper. Restore even when
   // COMMIT fails a deferred constraint or ROLLBACK follows an earlier refusal.
   if(sql==="COMMIT"||sql==="ROLLBACK"){
    client.query=originalQuery;pending.delete(db);observed.delete(db);
   }
  }
 };
}
async function historicalBegin<T>(db:TenantTransaction,spec:Spec):Promise<{kind:"claim"}|{kind:"replay";result:T}>{
 const requestHash=createHash("sha256").update(spec.legacyJson).digest("hex");
 const member=(await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())",[spec.tenantId,spec.actorMembershipId])).rowCount;
 if(!member)failure("FORBIDDEN","42501");
 const claim=await db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
  VALUES($1,$2,$3,$4,$5,'processing',$6) ON CONFLICT DO NOTHING RETURNING command_id`,[spec.tenantId,spec.commandId,spec.commandType,spec.semanticKey,requestHash,spec.actorMembershipId]);
 if(!claim.rowCount){
  const rows=(await db.$client.query("SELECT command_type,request_hash,status,result,actor_membership_id FROM app.command_receipt WHERE tenant_id=$1 AND (command_id=$2 OR (command_type=$3 AND semantic_key=$4))",[spec.tenantId,spec.commandId,spec.commandType,spec.semanticKey])).rows;
  if(rows.length!==1||rows[0].request_hash!==requestHash||rows[0].command_type!==spec.commandType||rows[0].actor_membership_id!==spec.actorMembershipId||rows[0].status!=="succeeded")failure("COMMAND_CONFLICT","23505");
  return {kind:"replay",result:rows[0].result as T};
 }
 const commands=pending.get(db)??new Map<string,Claim>();commands.set(spec.commandId,{...spec,input:JSON.parse(spec.legacyJson)});pending.set(db,commands);
 observeCheckedResults(db);return {kind:"claim"};
}
async function historicalResult(db:TenantTransaction,c:Claim,references:Record<string,unknown>):Promise<Record<string,unknown>>{
 const {tenantId:t,commandId:id,input:v,jobId:j,actorMembershipId:actor,commandType:type}=c;
 if(c.effect?.r&&typeof c.effect.r==="object")return c.effect.r as Record<string,unknown>;
 if(type.startsWith("recovery.message.")){
  const found=await db.$client.query("SELECT 1 FROM app.recovery_message WHERE tenant_id=$1 AND command_id=$2 UNION ALL SELECT 1 FROM app.recovery_message_event WHERE tenant_id=$1 AND command_id=$2",[t,id]);
  if(found.rowCount)return {recoveryMessageCommand:type.slice("recovery.message.".length)};
 }else if(type.startsWith("recovery.follow_up.")){
  const found=await db.$client.query("SELECT 1 FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND command_id=$2 UNION ALL SELECT 1 FROM app.recovery_follow_up_advance WHERE tenant_id=$1 AND command_id=$2",[t,id]);
  if(found.rowCount)return {recoveryFollowUpCommand:type.slice("recovery.follow_up.".length)};
 }else if(["LogSiteExtra","RecordOfficeExtra","RecordClientInstruction","ConfirmPrompt","LogBuilderExtra","AddFinalReviewExtra"].includes(type)&&(v.grantId||v.proposal)){
  const row=(await db.$client.query(`SELECT variation_id FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2
   AND (command_id=$3 OR ($4::uuid IS NOT NULL AND client_capture_id=$4))`,[t,j,id,v.clientCaptureId??null])).rows[0];
  if(row)return {variationId:row.variation_id};
 }else if(type==="MarkDuplicate"){
  const row=(await db.$client.query("SELECT id,duplicate_id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND command_id=$2",[t,id])).rows[0];
  if(row)return {linkId:row.id,variationId:row.duplicate_id};
 }else if(type==="RecordClientInstruction"){
  const row=(await db.$client.query("SELECT id,variation_id FROM app.extra_order_line_link WHERE tenant_id=$1 AND command_id=$2",[t,id])).rows[0];
  if(row)return {linkId:row.id,variationId:row.variation_id};
 }else if(type==="UnlinkDuplicate"){
  const row=(await db.$client.query("SELECT id,reverses_link_id,duplicate_id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND command_id=$2",[t,id])).rows[0];
  if(row)return {unlinkId:row.id,linkId:row.reverses_link_id,variationId:row.duplicate_id,revision:v.expectedRevision+1};
 }else if(type==="StartSiteVisit"||type==="CompleteSiteVisit"){
  const visit=type==="StartSiteVisit"?c.effect?.id:v.visitId;
  const row=(await db.$client.query(`SELECT id,to_char(started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') started,
   to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') completed FROM app.site_visit WHERE tenant_id=$1 AND id=$2`,[t,visit])).rows[0];
  if(row)return type==="StartSiteVisit"?{visitId:row.id,startedAt:row.started}:{visitId:row.id,completedAt:row.completed,closeoutAnswer:v.closeoutAnswer};
 }else if(type==="proof.complete"){
  const row=(await db.$client.query("SELECT s.id,l.evidence_id FROM app.stage_completion s JOIN app.evidence_link l ON(l.tenant_id,l.id)=(s.tenant_id,s.evidence_link_id) WHERE s.tenant_id=$1 AND s.command_id=$2",[t,id])).rows[0];
  if(row){
   const decision=v.deriveDecision?(await db.$client.query("SELECT d.id FROM app.decision d JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(d.tenant_id,d.id) WHERE d.tenant_id=$1 AND f.job_id=$2 AND f.subject_ref=$3 AND d.action_type='proof.capture' ORDER BY f.created_at DESC,f.id DESC LIMIT 1",[t,j,`${v.scopeItemId}:${v.requiredEvidenceType}`])).rows[0]?.id??null:v.decisionId??null;
   if(decision)await db.$client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[randomUUID(),t,decision,actor]);
   return {completionId:row.id,evidenceId:row.evidence_id,state:"complete",decisionId:decision};
  }
 }else if(type==="job.parties"){
  const a=v.input;let row;
  if(["create_customer","revise_customer"].includes(a.action)){row=(await db.$client.query("SELECT customer_id id,id AS \"revisionId\",revision FROM app.customer_revision WHERE tenant_id=$1 AND id=$2",[t,references.revisionId])).rows[0];}
  else if(a.action==="create_site"){row=(await db.$client.query("SELECT site_id id,id AS \"revisionId\" FROM app.site_revision WHERE tenant_id=$1 AND id=$2",[t,references.revisionId])).rows[0];if(row)row={...row,reused:!!a.reuseSiteId};}
  else row=(await db.$client.query("SELECT id,revision FROM app.job_party_binding WHERE tenant_id=$1 AND id=$2",[t,references.id])).rows[0];
  if(row)return {...row,version:"job-parties-command-result.v1",environment:"synthetic_demo",commandId:id,realExternalActions:0};
 }
 return failure("AUTHORIZATION_INVALID");
}
async function historicalComplete<T>(db:TenantTransaction,id:string,references:Record<string,unknown>={}):Promise<T>{
 const c=pending.get(db)?.get(id);if(!c)failure("COMMAND_CONFLICT","23505");
 const result=await historicalResult(db,c,references);
 await db.$client.query("UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2",[c.tenantId,id,JSON.stringify(result)]);
 pending.get(db)?.delete(id);return result as T;
}
export function legacyRepositoryCommandModule(actual:RepositoryModule){return {...actual,
 beginRepositoryCommand:async<T>(db:TenantTransaction,spec:Spec)=>await historicalRepositorySchema(db.$client)?historicalBegin<T>(db,spec):actual.beginRepositoryCommand<T>(db,spec),
 completeRepositoryCommand:async<T>(db:TenantTransaction,id:string,references:Record<string,unknown>={})=>await historicalRepositorySchema(db.$client)?historicalComplete<T>(db,id,references):actual.completeRepositoryCommand<T>(db,id,references),
};}
export function legacyRecoveryCommandModule(actual:typeof import("../src/recovery-command.js")){return {...actual,
 beginRecoveryCommand:async(db:TenantTransaction,tenant:string,id:string,type:string,json:string)=>{
  if(!(await historicalRepositorySchema(db.$client)))return actual.beginRecoveryCommand(db,tenant,id,type,json);
  const input=JSON.parse(json),found=(await db.$client.query("SELECT job_id FROM app.recovery_case WHERE tenant_id=$1 AND id=$2",[tenant,input.caseId])).rows[0];
  if(!found)failure("AUTHORIZATION_INVALID");
  const claim=await historicalBegin(db,{tenantId:tenant,actorMembershipId:input.membershipId,commandId:id,commandType:type,semanticKey:id,jobId:found.job_id,legacyJson:json});
  return claim.kind==="claim";
 },
 withRecoveryCommands:async<T>(pool:Pool,context:VerifiedTenantContext,work:(db:TenantTransaction)=>Promise<T>):Promise<T>=>{
  if(typeof pool.query!=="function"||!(await historicalRepositorySchema(pool)))return actual.withRecoveryCommands(pool,context,work);
  return withTenant(pool,context,async db=>{const result=await work(db);for(const id of pending.get(db)?.keys()??[])await historicalComplete(db,id);return result;});
 },
};}
