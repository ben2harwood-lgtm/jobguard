import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { seedSyntheticPartyFixture } from "./synthetic-party-fixture.js";
import { QuoteRepository } from "./quote-repository.js";
import { QuoteDeliveryRepository } from "./quote-delivery-repository.js";
import { QuoteAcceptanceRepository } from "./acceptance-repository.js";
import { PracticeActivationRepository } from "./activation-repository.js";
import { createHash } from "node:crypto";
import { money, type Money } from "@jobguard/core";

export const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_JOB_ID = "d1500000-0000-4000-8000-000000000150";
export const DEMO_SCOPE_ITEM_ID = "d1500000-0000-4000-8000-000000001500";
export const DEMO_IDENTITY_USER_ID = "d1500000-0000-4000-8000-000000000001";
export const DEMO_ACCOUNT_ID = "d1500000-0000-4000-8000-000000000002";
export const DEMO_MEMBERSHIP_ID = "d1500000-0000-4000-8000-000000000003";
export const DEMO_EMPTY_TENANT_ID = "33333333-3333-4333-8333-333333333333";
export const DEMO_EMPTY_ACCOUNT_ID = "33333333-3333-4333-8333-333333333334";
export const DEMO_EMPTY_MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333335";
export const DEMO_SEED_VERSION = "m1-15.demo-seed.v1";

export type DemoEnvironment = "synthetic_demo" | "pilot_no_charge" | "production";
export type DemoSeedCommand = Readonly<{
  version: "demo-seed-command.v1";
  commandId: string;
  semanticKey: string;
  tenantId: typeof DEMO_TENANT_ID;
  jobId: typeof DEMO_JOB_ID;
  scopeItemId: typeof DEMO_SCOPE_ITEM_ID;
  checkpoint: DemoCheckpoint;
  amount: Money | null;
}>;

export const demoCheckpoints = [
  "capture", "review_confirm", "quote_sent", "accepted", "live", "decision",
  "verified_proof", "approved_extra", "final_account", "issued_invoice",
  "recorded_payment", "fee_illustration",
] as const;
export type DemoCheckpoint = (typeof demoCheckpoints)[number];

export class DemoSeedSafetyError extends Error {
  readonly code = "DEMO_SEED_ENVIRONMENT_FORBIDDEN";
}

export interface DemoCommandBoundary {
  execute(command: DemoSeedCommand): Promise<"created" | "replayed">;
}

const uuidFor = (checkpoint: DemoCheckpoint) => {
  const value = createHash("sha256").update(`${DEMO_SEED_VERSION}:${checkpoint}`).digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
};

/** Builds only deterministic, synthetic command envelopes; the supplied boundary owns every write. */
export async function seedDemo(environment: DemoEnvironment, boundary: DemoCommandBoundary) {
  if (environment !== "synthetic_demo") {
    throw new DemoSeedSafetyError(`Refusing demo seed in ${environment}; synthetic_demo is required.`);
  }
  const outcomes: Array<{ checkpoint: DemoCheckpoint; result: "created" | "replayed" }> = [];
  for (const checkpoint of demoCheckpoints) {
    const amount: Money | null = checkpoint === "recorded_payment"
      ? money(150000)
      : null;
    const command: DemoSeedCommand = {
      version: "demo-seed-command.v1", commandId: uuidFor(checkpoint),
      semanticKey: `${DEMO_SEED_VERSION}:${checkpoint}`, tenantId: DEMO_TENANT_ID,
      jobId: DEMO_JOB_ID, scopeItemId: DEMO_SCOPE_ITEM_ID, checkpoint, amount,
    };
    outcomes.push({ checkpoint, result: await boundary.execute(command) });
  }
  return outcomes;
}

/** Minimal generated CH-1 recipe. Owner credentials only prepare fictional source
 * rows; quote send, acceptance and activation use their ordinary commands.
 * Not an application endpoint; callers must select an isolated synthetic database.
 */
export async function prepareActivationFixtureV3(owner:Pool,context:VerifiedTenantContext,name:string,acceptedNetPence:number, runtime:Pool=owner, highestSentNetPence=acceptedNetPence){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo"||context.tenantId!==DEMO_TENANT_ID)throw new DemoSeedSafetyError("CH-1 fixtures require the synthetic tenant");
 const jobId=randomUUID(),scope=randomUUID(),scopeRevision=randomUUID();
 await withTenant(owner,context,async db=>{
  await db.$client.query(`INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,$3,'quoting')`,[jobId,context.tenantId,name]);
  await seedSyntheticPartyFixture(db.$client,context.tenantId,jobId);
  await db.$client.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')`,[scope,context.tenantId,jobId]);
  await db.$client.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Generated fictional work','1','item',$5,$5)`,[scopeRevision,context.tenantId,jobId,scope,acceptedNetPence]);
 });
 const quotes=new QuoteRepository(runtime),delivery=new QuoteDeliveryRepository(runtime),draftId=randomUUID(),recipient="fixture-customer@example.invalid";
 const values=highestSentNetPence>acceptedNetPence?[highestSentNetPence,acceptedNetPence]:[acceptedNetPence];
 for(const [index,net] of values.entries()){
  await quotes.saveDraft(context,{jobId,draftId,expectedRevision:index,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",blockingQuestions:[],effectiveAt:new Date(),lines:[{id:randomUUID(),scopeItemId:scope,scopeRevisionId:scopeRevision,description:"Generated fictional work",origin:"captured",included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:net,discountPercent:"0",taxTreatment:"standard_rate_20",rateProvenance:"entered",category:"Work",region:null}]});
  const preview=await delivery.preview(context,jobId,recipient);
  await delivery.issue(context,jobId,{commandId:randomUUID(),documentId:preview.documentId,contentHash:preview.hash,recipient});
  await delivery.execute(context,jobId,preview.documentId,"success");
  if(index===values.length-1)await new QuoteAcceptanceRepository(runtime).accept(context,jobId,{commandId:randomUUID(),documentId:preview.documentId,documentHash:preview.hash,documentVersion:preview.document.documentVersion,statedCustomerName:"Practice Customer",statedMethod:"email",acceptedAt:new Date().toISOString()});
 }
 return jobId;
}
export async function seedActivationFixturesV3(owner:Pool,runtime:Pool,context:VerifiedTenantContext){
 const jobs={} as Record<"core-1000"|"recovery-18800"|"shadow-30000",string>;
 for(const [name,net] of [["core-1000",100000],["recovery-18800",1880000],["shadow-30000",3000000]] as const){
  const job=await prepareActivationFixtureV3(owner,context,name,net,runtime);
  await new PracticeActivationRepository(runtime).start(context,job,{commandId:randomUUID(),scenario:"no_charge"});jobs[name]=job;
 }
 return jobs;
}
