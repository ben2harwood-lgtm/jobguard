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
