import type {Pool} from "pg";
import {z} from "zod";
import {ContractorBillingError,contractorBillingErrorCodes,billingAdvanceDeliveryCommandV1} from "@jobguard/core";
import {ContractorBillingRepository,ContractorBillingDelivery,contractorSessionContext,type VerifiedTenantContext,type OutboundAdapter} from "@jobguard/db";
import {parseBillingImportEnvelope} from "./billing.contracts.js";
import {createSyntheticBillingAdapter} from "./billing.adapters.js";
export function billingHttpFailure(error:unknown){
 const known=contractorBillingErrorCodes.find(c=>c===(error as {code?:string})?.code),code=known??"DATABASE_UNAVAILABLE";
 const status=code==="UNAUTHENTICATED"?401:code==="BILLING_FORBIDDEN"||code==="MODE_FORBIDDEN"?403:code==="BILLING_NOT_FOUND"?404:["JOB_NOT_LIVE","BILLING_CONFLICT","BILLING_STALE","BILLING_DUPLICATES_UNRESOLVED"].includes(code)?409:code==="BILLING_INVALID"?400:503;
 return {status,body:{version:"contractor-billing-error.v1" as const,code}};
}
// Application instances share a fictional provider's observation state across requests. Restart loses
// that fake-provider memory, so reconciliation after restart returns unknown and never permits redelivery.
const adapters:ReadonlyMap<string,OutboundAdapter>=new Map(["fake_download","fake_sftp","fake_api"].map(channel=>{
 const provider=createSyntheticBillingAdapter({version:"billing-fake-adapter.v1",mode:"synthetic_demo",channel,scenario:"success"});
 const observed=new Set<string>();
 return [channel,{name:provider.name,supportsProviderDeduplication:true,
  deliver:async (action:Parameters<typeof provider.deliver>[0])=>{observed.add(action.providerEffectKey);return provider.deliver(action);},
  reconcile:async (key:string)=>observed.has(key)?provider.reconcile(key):"unknown" as const}] as const;
}));
export class BillingApplication {
 private readonly repository:ContractorBillingRepository;
 constructor(private readonly pool:Pool){this.repository=new ContractorBillingRepository(pool);}
 private async context(session:unknown):Promise<VerifiedTenantContext>{
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new ContractorBillingError("MODE_FORBIDDEN");
  if(!z.string().uuid().safeParse(session).success)throw new ContractorBillingError("UNAUTHENTICATED");
  return contractorSessionContext(this.pool,session as string);
 }
 async read(session:unknown,job:string){
  const context:VerifiedTenantContext=await this.context(session),view=await this.repository.read(context,session as string,job);
  return {...view,exports:view.exports.map(e=>({id:e.id,jsonHash:e.jsonHash,csvHash:e.csvHash,lines:e.artifact.lines,totalNet:e.artifact.totalNet}))};
 }
 async download(session:unknown,job:string,batchId:unknown){
  const context:VerifiedTenantContext=await this.context(session);
  if(!z.string().uuid().safeParse(batchId).success)throw new ContractorBillingError("BILLING_INVALID");
  const view=await this.repository.read(context,session as string,job),batch=view.exports.find(e=>e.id===batchId);
  if(!batch||!view.deliveries.some(d=>d.batch_id===batchId&&d.status==="succeeded"&&d.adapter==="fake_download"))throw new ContractorBillingError("BILLING_NOT_FOUND");
  return {csv:batch.csv,hash:batch.csvHash};
 }
 async finalise(session:unknown,job:string,raw:unknown){const context:VerifiedTenantContext=await this.context(session);return this.repository.finalise(context,session as string,job,raw);}
 async import(session:unknown,job:string,raw:unknown){
  const context:VerifiedTenantContext=await this.context(session);
  const envelope=z.object({version:z.literal("billing-import-request.v1"),commandId:z.string().uuid(),input:z.unknown()}).strict().safeParse(raw);
  if(!envelope.success)throw new ContractorBillingError("BILLING_INVALID");
  let parsed:ReturnType<typeof parseBillingImportEnvelope>;try{parsed=parseBillingImportEnvelope(envelope.data.input);}catch{throw new ContractorBillingError("BILLING_INVALID");}
  return this.repository.import(context,session as string,job,{version:"billing-import-command.v1",commandId:envelope.data.commandId,transport:parsed.transport,sourceHash:parsed.sourceHash,events:parsed.observations.map(e=>e.event)});
 }
 async approveDelivery(session:unknown,job:string,raw:unknown){
  const context:VerifiedTenantContext=await this.context(session);
  const result=await this.repository.approveDelivery(context,session as string,job,raw);
  await new ContractorBillingDelivery(this.pool,adapters).execute(context,session as string,job,result.outboxActionId);
  return result;
 }
 async advance(session:unknown,job:string,raw:unknown){
  const context:VerifiedTenantContext=await this.context(session),parsed=billingAdvanceDeliveryCommandV1.safeParse(raw);
  if(!parsed.success)throw new ContractorBillingError("BILLING_INVALID");
  const delivery=new ContractorBillingDelivery(this.pool,adapters),{outboxActionId,action}=parsed.data;
  await delivery[action](context,session as string,job,outboxActionId);
  return this.repository.read(context,session as string,job);
 }
}
