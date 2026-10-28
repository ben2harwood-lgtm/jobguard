// SV-5 Q2 (0254): "Yes, this was extra work" creates only an unpriced jobguard_catch variation. Real PostgreSQL; CI only.
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,availableFinalCheck,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
const count=async(table:string,tenant:string,job:string)=>Number((await f.admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`,[tenant,job])).rows[0].n);

it("a confirmed catch becomes one draft jobguard_catch variation tied to its signal, with no case, price or approval",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),repo=new FinalCheckRepository(f.runtime);
 const command={version:"final-check.catch.v1",commandId:randomUUID(),lockId:r.lockId,runId:r.runId,signalId:r.signalId,expectedSignalRevision:1};
 const first=await repo.confirmCatch(a.context,a.jobId,a.digest,command) as {variationId:string;disposition:string};
 expect(first).toMatchObject({disposition:"confirmed_extra",variationId:command.commandId});
 expect(await repo.confirmCatch(a.context,a.jobId,a.digest,command)).toEqual(first);
 const origin=(await f.admin.query("SELECT o.kind,o.source_signal_id,v.state,v.origin FROM app.extra_origin o JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.variation_id) WHERE o.tenant_id=$1 AND o.variation_id=$2",[a.tenantId,first.variationId])).rows;
 expect(origin).toEqual([{kind:"jobguard_catch",source_signal_id:r.signalId,state:"draft",origin:"jobguard_catch"}]);
 for(const table of ["recovery_case","variation_revision","variation_approval","customer_invoice"])expect(await count(table,a.tenantId,a.jobId),table).toBe(0);
 const view=await repo.read(a.context,a.jobId,a.digest);
 expect(view.items[0]).toMatchObject({signalId:r.signalId,disposition:"confirmed_extra"});
 // The same item cannot then be answered another way, and a changed payload under the same id is a conflict.
 await expect(repo.disposition(a.context,a.jobId,a.digest,{...r.body,commandId:randomUUID(),expectedSignalRevision:2})).rejects.toBeDefined();
 await expect(repo.confirmCatch(a.context,a.jobId,a.digest,{...command,expectedSignalRevision:2})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});

it("a stale signal revision or another session confirms nothing",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),repo=new FinalCheckRepository(f.runtime);
 const command={version:"final-check.catch.v1",commandId:randomUUID(),lockId:r.lockId,runId:r.runId,signalId:r.signalId,expectedSignalRevision:0};
 await expect(repo.confirmCatch(a.context,a.jobId,a.digest,command)).rejects.toMatchObject({code:"STALE_REVISION"});
 await expect(repo.confirmCatch(a.context,a.jobId,"f".repeat(64),{...command,commandId:randomUUID(),expectedSignalRevision:1})).rejects.toBeDefined();
 expect(await count("variation",a.tenantId,a.jobId)).toBe(0);
});

it("the builder's priced approval opens the catch case with no claim; the customer's approval adds the claim",async()=>{
 const {priceVariation,approveVariation}=await import("@jobguard/core");
 const {insertPricedVariation,approvePricedVariation}=await import("../src/variation-repository.js");
 const {withTenant}=await import("../src/tenant-context.js");
 const {FINAL_CHECK_ACTOR}=await import("./final-check-fixture.js");
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),repo=new FinalCheckRepository(f.runtime);
 const confirmed=await repo.confirmCatch(a.context,a.jobId,a.digest,{version:"final-check.catch.v1",commandId:randomUUID(),lockId:r.lockId,runId:r.runId,signalId:r.signalId,expectedSignalRevision:1}) as {variationId:string};
 const v=(await f.admin.query("SELECT scope_item_id,description FROM app.variation WHERE tenant_id=$1 AND id=$2",[a.tenantId,confirmed.variationId])).rows[0];
 const proposal={version:"variation-proposal.v1" as const,id:confirmed.variationId,jobId:a.jobId,scopeItemId:v.scope_item_id,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text" as const,captureText:v.description,description:v.description,suggestion:null};
 const priced=priceVariation({id:randomUUID(),variationId:confirmed.variationId,previous:null,proposal,description:v.description,contentHash:"e".repeat(64),
  confirmed:{quantity:"1",unit:"item",unitRatePence:50000,direction:"addition",confirmedByMembershipId:FINAL_CHECK_ACTOR,rateProvenance:{kind:"human_entered",sourceRef:"synthetic://builder-entered",sourceHash:"8".repeat(64),rateVersion:"builder-price-v1"}}});
 await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,priced));
 const cases=(await f.admin.query("SELECT id,state,claim_pence,case_type,book,source_refs FROM app.recovery_case WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows;
 expect(cases).toHaveLength(1);
 expect(cases[0]).toMatchObject({state:"identified",claim_pence:"50000",case_type:"missed_variation_final_account",book:"builder_customer"});
 expect(cases[0].source_refs).toEqual([`variation:${confirmed.variationId}`,`revision:${priced.id}`,`signal:${r.signalId}`]);
 const claims=async()=>(await f.admin.query("SELECT revision,claimed_net_pence FROM app.recovery_claim_revision WHERE tenant_id=$1 AND case_id=$2",[a.tenantId,cases[0].id])).rows;
 expect(await claims()).toEqual([]);
 // The raw runtime boundary still cannot create such a case directly.
 await expect(withTenant(f.runtime,a.context,db=>db.$client.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type) VALUES($1,$2,$3,1,'GBP','identified',0,true,'missed_variation_final_account')",[randomUUID(),a.tenantId,a.jobId]))).rejects.toBeDefined();
 const approval=approveVariation({...priced,state:"priced"} as never,{id:randomUUID(),revisionId:priced.id,revision:priced.revision,contentHash:priced.contentHash,signedDeltaPence:priced.signedDeltaPence,method:"builder_attestation",actorMembershipId:FINAL_CHECK_ACTOR,evidenceId:null,approvedAt:new Date("2026-10-28T10:00:00.000Z")});
 await withTenant(f.runtime,a.context,db=>approvePricedVariation(db,a.tenantId,confirmed.variationId,approval));
 expect(await claims()).toEqual([{revision:1,claimed_net_pence:"50000"}]);
 expect(await count("recovery_case",a.tenantId,a.jobId)).toBe(1);
});
