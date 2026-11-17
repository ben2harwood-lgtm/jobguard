// Real practice sessions, jobs, locks and confirmed found extras for the 0518 guide tests. Nothing here is mocked.
import { createHash, randomUUID } from "node:crypto";
import { priceVariation } from "@jobguard/core";
import { availableFinalCheck, FINAL_CHECK_ACTOR, seedFinalCheckJob, type FinalCheckFixture } from "./final-check-fixture.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { insertPricedVariation } from "../src/variation-repository.js";
import { withTenant } from "../src/tenant-context.js";

export type Job = Awaited<ReturnType<typeof seedFinalCheckJob>>;
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => Buffer.from(randomUUID() + randomUUID()).toString("base64url").slice(0, 43);
export const link = (a: Pick<Job, "tenantId" | "jobId">, customer: string, token = secret()) => ({ path: `/customer/sign-in#${a.tenantId}/${a.jobId}/${customer}/${token}`, digest: hash(`customer-link:${token}`) });
export const guideFixture = (f: FinalCheckFixture) => {
 const customerOf=async(a:Job)=>(await f.admin.query("SELECT b.customer_id FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2",[a.tenantId,a.jobId])).rows[0].customer_id as string;
 // A real job with a real lock, a revealed catch the builder confirmed, and a price on it.
 async function locked(){
 const a=await seedFinalCheckJob(f),revealed=await availableFinalCheck(f,a);
 const {variationId}=await new FinalCheckRepository(f.runtime).confirmCatch(a.context,a.jobId,a.digest,{version:"final-check.catch.v1",commandId:randomUUID(),lockId:revealed.lockId,runId:revealed.runId,signalId:revealed.signalId,expectedSignalRevision:1}) as {variationId:string};
 const row=(await f.admin.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND id=$2",[a.tenantId,variationId])).rows[0];
 const priced=priceVariation({id:randomUUID(),variationId,previous:null,proposal:{version:"variation-proposal.v1",id:variationId,jobId:a.jobId,scopeItemId:row.scope_item_id,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:row.description,description:row.description,suggestion:null},description:row.description,contentHash:"e".repeat(64),confirmed:{quantity:"1",unit:"item",unitRatePence:50000,direction:"addition",confirmedByMembershipId:FINAL_CHECK_ACTOR,rateProvenance:{kind:"human_entered",sourceRef:"synthetic://builder-entered",sourceHash:"8".repeat(64),rateVersion:"builder-price-v1"}}} as never);
 await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,priced));
 return {...a,revealed,variationId,priced,customer:await customerOf(a)};
}
 return { customerOf, locked };
};
