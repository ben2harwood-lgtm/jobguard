import { randomUUID } from "node:crypto";
import type { VerifiedTenantContext } from "./tenant-context.js";
import { SubscriptionPersistenceError, type SubscriptionRepositoryPort } from "./subscription-repository.js";
import { subscriptionSimulatedResultV1, subscriptionSimulatedWorkV1, type SubscriptionPaymentAdapter } from "./subscription-simulated-payment-adapter.js";
/** Request-scoped narrow executor. SQL claims existing exact owner-approved work; adapters run after commit. */
export class SubscriptionExecutor {
 constructor(private readonly repository:SubscriptionRepositoryPort,private readonly adapter:SubscriptionPaymentAdapter){}
 async executeApprovedSimulation(context:VerifiedTenantContext,digest:string,commandId:string,workId:string,expectedRevision:number){
  const before=await this.repository.read(context,digest);
  if(before.attempts.some(row=>row.work_id===workId))throw new SubscriptionPersistenceError("SUBSCRIPTION_UNAVAILABLE");
  const claim=await this.repository.command(context,digest,commandId,{version:"subscription-command.v1",kind:"execute_simulation",workId,expectedRevision});
  const work=subscriptionSimulatedWorkV1.parse({version:"subscription-simulated-work.v1",environment:claim.environment,workId:claim.workId,statementId:claim.statementId,amountPence:claim.amountPence,contentHash:claim.contentHash,currency:claim.currency});
  let result;
  try{result=subscriptionSimulatedResultV1.parse(await this.adapter.execute(work));if(result.workId!==workId)throw new SubscriptionPersistenceError("SUBSCRIPTION_PROJECTION_MISMATCH");}
  catch{result={version:"subscription-simulated-result.v1" as const,synthetic:true as const,workId,resultId:randomUUID(),outcome:"outcome_unknown" as const};}
  if(result.workId!==workId)throw new SubscriptionPersistenceError("SUBSCRIPTION_PROJECTION_MISMATCH");
  return this.repository.command(context,digest,result.resultId,{version:"subscription-command.v1",kind:"record_simulation",workId,resultId:result.resultId,outcome:result.outcome,expectedRevision});
 }
 /** Compatibility for existing internal callers; this is domain work, not a SQL execute primitive. */
 async execute(context:VerifiedTenantContext,digest:string,commandId:string,workId:string,expectedRevision:number){
  return this.executeApprovedSimulation(context,digest,commandId,workId,expectedRevision);
 }
 async reconcile(context:VerifiedTenantContext,digest:string,workId:string,expectedRevision:number){
  const snapshot=await this.repository.read(context,digest);
  const row=snapshot.work.find(value=>value.id===workId);
  if(!row||!snapshot.attempts.some(value=>value.work_id===workId)||
   (snapshot.results.some(value=>value.work_id===workId)&&!snapshot.results.some(value=>value.work_id===workId&&value.outcome==="outcome_unknown")))throw new SubscriptionPersistenceError("SUBSCRIPTION_FORBIDDEN");
  const work=subscriptionSimulatedWorkV1.parse({version:"subscription-simulated-work.v1",environment:"synthetic_demo",workId,statementId:row.statement_id,amountPence:Number(row.amount_pence),contentHash:row.content_hash,currency:"GBP"});
  const result=subscriptionSimulatedResultV1.parse(await this.adapter.reconcile(work));
  if(result.workId!==workId)throw new SubscriptionPersistenceError("SUBSCRIPTION_PROJECTION_MISMATCH");
  return this.repository.command(context,digest,randomUUID(),{version:"subscription-command.v1",kind:"reconcile_simulation",workId,resultId:result.resultId,outcome:result.outcome,expectedRevision});
 }
}
