import type { Pool } from "pg";
import { z } from "zod";
import { ContractorBillingError } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { outboundActionV1Schema,type OutboundAdapter,type FakeDeliveryResult } from "./outbox.js";
import { billingDatabaseFailure } from "./contractor-billing-repository.js";
const resultV1=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("succeeded"),providerReference:z.string().min(1).max(300)}).strict(),
 z.object({kind:z.literal("retryable"),code:z.string().min(1).max(100)}).strict(),
 z.object({kind:z.literal("outcome_unknown"),code:z.string().min(1).max(100)}).strict(),
]);
/** Fake providers only. No network call occurs in a transaction. The existing generic executor
 * remains owner-only; this executor rechecks the finance session inside every checked DB step.
 */
export class ContractorBillingDelivery {
 constructor(private readonly pool:Pool,private readonly adapters:ReadonlyMap<string,OutboundAdapter>){}
 private async step(context:VerifiedTenantContext,session:string,job:string,id:string,step:string,result:unknown={}){
  try{return await withTenant(this.pool,context,async db=>(await db.$client.query("SELECT app.cb_delivery_step($1,$2,$3,$4,$5::jsonb) result",[session,job,id,step,JSON.stringify(result)])).rows[0]?.result as Record<string,unknown>|null);}catch(e){billingDatabaseFailure(e);}
 }
 async execute(context:VerifiedTenantContext,session:string,job:string,id:string):Promise<void>{
  const row=await this.step(context,session,job,id,"claim");if(!row)return;
  const action=outboundActionV1Schema.parse({version:"outbound-action.v1",id:row.id,authorizationId:row.authorization_id,adapter:row.adapter,providerEffectKey:row.provider_effect_key,actionType:row.action_type,recipient:row.recipient,contentHash:row.content_hash,immutableContent:row.immutable_content,aggregateRevision:row.aggregate_revision,amountPence:Number(row.amount_pence),currency:row.currency,policyVersion:row.policy_version,authorizationExpiresAt:row.authorization_expires_at});
  const adapter=this.adapters.get(action.adapter);if(!adapter)throw new ContractorBillingError("BILLING_INVALID");
  let result:FakeDeliveryResult;
  try{result=resultV1.parse(await adapter.deliver(Object.freeze(action)));}
  catch{result={kind:"outcome_unknown",code:"INTERRUPTED_OR_INVALID_PROVIDER_RESULT"};}
  await this.step(context,session,job,id,"finish",{...result,attempt:row.attempt});
 }
 async reconcile(context:VerifiedTenantContext,session:string,job:string,id:string):Promise<void>{
  const row=await this.step(context,session,job,id,"inspect");if(!row)return;
  const adapter=this.adapters.get(String(row.adapter));if(!adapter)throw new ContractorBillingError("BILLING_INVALID");
  const outcome=z.enum(["succeeded","not_found","unknown"]).parse(await adapter.reconcile(String(row.provider_effect_key)));
  await this.step(context,session,job,id,"reconcile",{outcome});
 }
}
