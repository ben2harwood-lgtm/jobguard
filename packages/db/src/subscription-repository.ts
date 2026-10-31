import { subscriptionConsentText } from "@jobguard/core";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { projectMeterFixture, meterLondonDateV1 } from "./meter-persistence.js";
const uuid=z.guid({ error: "Invalid uuid" }), revision=z.number().int().safe().nonnegative();
const hash=z.string().regex(/^[a-f0-9]{64}$/u);
const common={version:z.literal("subscription-command.v1")};
const terms={plan:z.enum(["Solo","Builder"]),cadence:z.literal("monthly"),anchorDay:z.number().int().min(1).max(31),termsVersion:z.literal("subscription_terms_v1"),catalogueVersion:z.literal("subscription_pricing_policy_v4"),maximumPence:z.union([z.literal(4900),z.literal(16900)]),contentHash:hash,expectedRevision:revision};
const resultFields={workId:uuid,resultId:uuid,outcome:z.enum(["redirect","settled","outcome_unknown","failed"]),expectedRevision:revision};
export const subscriptionCommandV1=z.discriminatedUnion("kind",[
 z.object({...common,kind:z.literal("accept"),...terms}).strict(),
 z.object({...common,kind:z.literal("change"),...terms}).strict(),
 z.object({...common,kind:z.literal("review"),sourceId:uuid,expectedRevision:revision}).strict(),
 z.object({...common,kind:z.literal("issue"),periodStart:meterLondonDateV1,expectedRevision:revision}).strict(),
 z.object({...common,kind:z.literal("apply_change"),changeId:uuid,sourceId:uuid,expectedRevision:revision}).strict(),
 z.object({...common,kind:z.literal("approve_simulation"),statementId:uuid,expectedRevision:revision,contentHash:hash,amountPence:z.number().int().min(0).max(16900)}).strict(),
 z.object({...common,kind:z.literal("execute_simulation"),workId:uuid,expectedRevision:revision}).strict(),
 z.object({...common,kind:z.literal("record_simulation"),...resultFields}).strict(),
 z.object({...common,kind:z.literal("reconcile_simulation"),...resultFields}).strict(),
 z.object({...common,kind:z.literal("onboarding"),usualPlaces:z.number().int().safe().nonnegative(),siteStaffLogExtras:z.boolean()}).strict(),
]);
export type SubscriptionCommand=z.infer<typeof subscriptionCommandV1>;
const resultBase={version:z.literal("subscription-command-result.v1"),hypothetical:z.literal(true),environment:z.literal("synthetic_demo")};
const appliedTerms={agreementId:uuid,revision,effectiveDate:meterLondonDateV1};
const execution={workId:uuid,statementId:uuid,amountPence:z.number().int().min(0).max(16900),contentHash:hash,currency:z.literal("GBP"),revision};
export const subscriptionCommandResultV1=z.union([
 z.object({...resultBase,kind:z.literal("accept"),...appliedTerms}).strict(),
 z.object({...resultBase,kind:z.literal("change"),...appliedTerms}).strict(),
 z.object({...resultBase,kind:z.literal("change"),changeId:uuid,revision,status:z.literal("pending"),effectiveDate:meterLondonDateV1}).strict(),
 z.object({...resultBase,kind:z.literal("issue"),periodId:uuid,statementId:uuid,sourceId:uuid,amountPence:z.number().int().min(0).max(16900),principalPence:z.number().int().min(0).max(16900),basePrincipalPence:z.number().int().min(0).max(16900),artifactHash:hash}).strict(),
 z.object({...resultBase,kind:z.literal("apply_change"),changeId:uuid,outcome:z.enum(["applied","refused_capacity","refused_stale","refused_authority"]),revision}).strict(),
 z.object({...resultBase,kind:z.literal("review"),reviewId:uuid.nullable(),trackReviewDue:z.boolean(),immediate:z.boolean(),sustained:z.boolean(),trackChanged:z.literal(false)}).strict(),
 z.object({...resultBase,kind:z.enum(["approve_simulation","execute_simulation"]),...execution}).strict(),
 z.object({...resultBase,kind:z.enum(["record_simulation","reconcile_simulation"]),...execution,resultId:uuid,outcome:resultFields.outcome,settled:z.boolean()}).strict(),
 z.object({...resultBase,kind:z.literal("onboarding"),recommendationId:uuid,recommendedTrack:z.enum(["small_builder","contractor"])}).strict(),
]);

export class SubscriptionPersistenceError extends Error {
 constructor(readonly code:"INVALID_SUBSCRIPTION_INPUT"|"SUBSCRIPTION_FORBIDDEN"|"SUBSCRIPTION_UNAVAILABLE"|"SUBSCRIPTION_SYNTHETIC_ONLY"|"SUBSCRIPTION_PROJECTION_MISMATCH"|"SUBSCRIPTION_ANCHOR_NOT_ACCEPTANCE_DAY"|"SUBSCRIPTION_PERIOD_BEFORE_ACCEPTANCE"){super(code);this.name="SubscriptionPersistenceError";}
}
export function parseSubscriptionCommand(raw:unknown):SubscriptionCommand {
 const parsed=subscriptionCommandV1.safeParse(raw);
 if(!parsed.success)throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
 return parsed.data;
}
const rows=z.array(z.record(z.string(), z.unknown()));
export const subscriptionPersistedReadV1=z.object({version:z.literal("subscription-persisted-read.v1"),hypothetical:z.literal(true),environment:z.literal("synthetic_demo"),agreements:rows,changes:rows,changeOutcomes:rows,periods:rows,statements:rows,reviews:rows,work:rows,attempts:rows,results:rows,corrections:rows,alerts:rows,onboarding:rows,periodLines:rows,placeBindings:rows,places:rows,statementLines:rows,operationsCards:rows}).strict();
export type SubscriptionPersistedRead=z.infer<typeof subscriptionPersistedReadV1>;
export interface SubscriptionRepositoryPort {
 command(context:VerifiedTenantContext,digest:string,commandId:string,raw:unknown):Promise<Record<string,unknown>>;
 read(context:VerifiedTenantContext,digest:string):Promise<SubscriptionPersistedRead>;
}
/** Every call re-enters the persisted session bridge; no company facts are cached. */
export class SubscriptionRepository implements SubscriptionRepositoryPort {
 constructor(private readonly pool:Pool){}
 async command(context:VerifiedTenantContext,digest:string,commandId:string,raw:unknown):Promise<Record<string,unknown>> {
  const input=parseSubscriptionCommand(raw);
  if(!uuid.safeParse(commandId).success||!hash.safeParse(digest).success)throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
  return this.run(context,async db=>{
   const value=(await db.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb) result",[context.tenantId,digest,commandId,JSON.stringify(input)])).rows[0]?.result;
   const result:Record<string,unknown>=subscriptionCommandResultV1.parse(value);
   if(input.kind==="issue"){
    const source=(await db.query("SELECT app.mon2_source($1,$2,$3) result",[context.tenantId,digest,result.sourceId])).rows[0]?.result;
    const recomputed=projectMeterFixture(context.tenantId,source);
    if(recomputed.result.principal.pence!==Number(result.basePrincipalPence))throw new SubscriptionPersistenceError("SUBSCRIPTION_PROJECTION_MISMATCH");
   }
   return result;
  });
 }
 async read(context:VerifiedTenantContext,digest:string):Promise<SubscriptionPersistedRead>{
  if(!hash.safeParse(digest).success)throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
  return this.run(context,async db=>subscriptionPersistedReadV1.parse((await db.query("SELECT app.mon2_read($1,$2) result",[context.tenantId,digest])).rows[0]?.result));
 }
 private async run<T>(context:VerifiedTenantContext,fn:(db:import("pg").PoolClient)=>Promise<T>):Promise<T>{
  try{return await withTenant(this.pool,context,db=>fn(db.$client));}
  catch(error){
   if(error instanceof SubscriptionPersistenceError)throw error;
   if(error instanceof Error&&["METER_FORBIDDEN","SUBSCRIPTION_FORBIDDEN"].includes(error.message))throw new SubscriptionPersistenceError("SUBSCRIPTION_FORBIDDEN");
   if(error instanceof Error && error.message === "SUBSCRIPTION_ANCHOR_NOT_ACCEPTANCE_DAY")throw new SubscriptionPersistenceError("SUBSCRIPTION_ANCHOR_NOT_ACCEPTANCE_DAY");
   if(error instanceof Error && error.message === "SUBSCRIPTION_PERIOD_BEFORE_ACCEPTANCE")throw new SubscriptionPersistenceError("SUBSCRIPTION_PERIOD_BEFORE_ACCEPTANCE");
   throw new SubscriptionPersistenceError("SUBSCRIPTION_UNAVAILABLE");
  }
 }
}

/** Canonical approval content for a reviewed synthetic terms selection; no acceptance is performed. */
export function subscriptionTermsContentHash(tenantId:string,raw:unknown):string {
 const selected=z.object(terms).omit({contentHash:true}).extend({consentText:z.literal(subscriptionConsentText).default(subscriptionConsentText)}).strict().parse(raw);
 const bound={tenantId:z.guid({ error: "Invalid uuid" }).parse(tenantId).toLowerCase(),...selected};
 const canonical=JSON.stringify(Object.fromEntries(Object.entries(bound).sort(([a],[b])=>a<b?-1:a>b?1:0)));
 return createHash("sha256").update(canonical).digest("hex");
}
