import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { approvedTrialClockV1, trialDeadlineV1, reduceTrialEndsV1, trialEndSourceV1, workFactTimeV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";
import { UserCommandDispatcher, type CommandMutation, type ConsequentialCommand } from "./commands.js";
import { assertTrialSynthetic, trialInput, trialFailure, FreeFirstJobPersistenceError } from "./free-first-job-repository.js";
const uuid=z.uuid(), hash=z.string().regex(/^[a-f0-9]{64}$/u);
export const trialActivationTargetV1=z.object({acceptedDocumentId:uuid,acceptedDocumentVersion:z.number().int().positive().max(2147483647),acceptedDocumentHash:hash,expectedJobRevision:z.number().int().nonnegative().max(2147483647)}).strict();
export const trialSwitchLiveV1=trialActivationTargetV1.extend({version:z.literal("trial-switch-live.v1"),commandId:uuid,jobId:uuid}).strict();
export const trialLifecycleSourceV1=z.object({
 version:z.literal("trial-lifecycle-source.v1"),environment:z.literal("synthetic_demo"),tenantId:uuid,jobId:uuid,asOf:workFactTimeV1,
 start:z.object({trialId:uuid,activationId:uuid,startedAt:workFactTimeV1,deadlineAt:workFactTimeV1}).strict().nullable(),
 target:trialActivationTargetV1.nullable(), events:z.array(trialEndSourceV1),
}).strict().refine(value=>value.start!==null||value.events.length===0);
export function projectTrialLifecycle(tenantId:string,jobId:string,raw:unknown){
 const source=trialInput(trialLifecycleSourceV1,raw);
 if(source.tenantId!==tenantId||source.jobId!==jobId)throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_ACCESS_DENIED");
 if(!source.start)return {...source,timeline:null,hypothetical:true as const,realExternalActions:0 as const};
 const deadline=trialDeadlineV1(source.start.startedAt,approvedTrialClockV1);
 if(deadline.deadlineAt!==source.start.deadlineAt)throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_UNAVAILABLE");
 const timeline=reduceTrialEndsV1({version:"trial-end-input.v1",trialId:source.start.trialId,tenantId,jobId,
  startedAt:source.start.startedAt,asOf:source.asOf,deadline,events:source.events});
 return {...source,timeline,hypothetical:true as const,realExternalActions:0 as const};
}
export class FreeFirstJobLifecycleRepository {
 constructor(private readonly pool:Pool){}
 async read(context:VerifiedTenantContext,digest:string,jobId:string){
  assertTrialSynthetic();trialInput(uuid,jobId);trialInput(hash,digest);
  try{return await withTenant(this.pool,context,async db=>{
   const raw=(await db.$client.query("SELECT app.mon3_read_lifecycle($1,$2,$3) result",[context.tenantId,digest,jobId])).rows[0]?.result;
   assertTrialSynthetic();return projectTrialLifecycle(context.tenantId,jobId,raw);
  });}catch(error){return trialFailure(error);}
 }
 async simulateCard(context:VerifiedTenantContext,digest:string,commandId:string,raw:unknown){
  assertTrialSynthetic();trialInput(uuid,commandId);trialInput(hash,digest);
  const input=trialInput(z.object({version:z.literal("trial-card-simulate.v1")}).strict(),raw);
  try{return await withTenant(this.pool,context,async db=>{
   const result=(await db.$client.query("SELECT app.mon3_simulate_card($1,$2,$3,$4::jsonb) result",[context.tenantId,digest,commandId,JSON.stringify(input)])).rows[0]?.result;
   assertTrialSynthetic();return trialInput(z.object({version:z.literal("trial-card-simulated.v1"),environment:z.literal("synthetic_demo"),hypothetical:z.literal(true),completed:z.literal(true)}).strict(),result);
  });}catch(error){return trialFailure(error);}
 }
 async activate(context:VerifiedTenantContext,digest:string,actor:string,raw:unknown){
  assertTrialSynthetic();const input=trialInput(trialSwitchLiveV1,raw);trialInput(hash,digest);trialInput(uuid,actor);
  try{return await new UserCommandDispatcher(this.pool).dispatch(context,{
   version:"command.v1",commandId:input.commandId,commandType:"job.switch_live",semanticKey:`mon3:${input.jobId}:${input.acceptedDocumentId}:${input.expectedJobRevision}`,actorMembershipId:actor,subjectType:"job",subjectRef:input.jobId,
   action:{actionType:"job.switch_live",recipient:null,contentHash:input.acceptedDocumentHash,aggregateRevision:input.acceptedDocumentVersion,amountPence:null,currency:null,policyVersion:"synthetic_demo_activation.v3",expiresAt:new Date("2099-01-01T00:00:00.000Z")},
  },new TrialActivationMutation(context.tenantId,digest,input));}catch(error){return trialFailure(error);}
 }
}
/** Job, company, then dispatcher replay/receipt locks; audit remains last. */
export class TrialActivationMutation implements CommandMutation<Record<string,unknown>> {
 constructor(private readonly tenantId:string,private readonly digest:string,private readonly input:z.infer<typeof trialSwitchLiveV1>){}
 async lock(db:TenantTransaction,command:ConsequentialCommand){
  assertTrialSynthetic();
  await db.$client.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[this.tenantId,this.input.jobId]);
  const row=(await db.$client.query("SELECT app.mon3_owner($1,$2) actor",[this.tenantId,this.digest])).rows[0];
  if(row?.actor!==command.actorMembershipId)throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_ACCESS_DENIED");
 }
 async mutate(db:TenantTransaction,command:ConsequentialCommand){
  assertTrialSynthetic();const {commandId:_command,version:_version,...target}=this.input;
  const result=(await db.$client.query("SELECT app.mon3_activate($1,$2,$3,$4::jsonb) result",[this.tenantId,this.digest,command.commandId,JSON.stringify({...target,version:"trial-admission.v1",activationId:randomUUID(),termsId:randomUUID(),authorizationId:command.authorizationId})])).rows[0]?.result;
  assertTrialSynthetic();const parsed=trialInput(z.object({jobId:uuid,activationId:uuid,termsId:uuid,snapshotId:uuid.nullable(),state:z.literal("live")}).strict(),result);
  if(parsed.jobId!==this.input.jobId)throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_UNAVAILABLE");
  return parsed;
 }
 auditEvents(result:Record<string,unknown>,command:ConsequentialCommand){return [{id:randomUUID(),version:"audit.v1" as const,actorRef:`membership:${command.actorMembershipId}`,eventType:"job.switched_live",subjectType:"job",subjectRef:this.input.jobId,payload:{references:{activationId:String(result.activationId),termsId:String(result.termsId)},hashes:{acceptedDocumentHash:this.input.acceptedDocumentHash}}}];}
}
