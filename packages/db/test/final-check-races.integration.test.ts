import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,availableFinalCheck,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("SV5-19 SV5-20 simultaneous result and disposition replays converge to one identity",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),repo=new FinalCheckRepository(f.runtime),worker=new FinalCheckRepository(f.shadow);
 const runs=await Promise.all([worker.reconcile(a.context,a.jobId,r.manifest.id,[r.classification]),worker.reconcile(a.context,a.jobId,r.manifest.id,[r.classification])]);expect(runs[0]).toEqual(runs[1]);
 const answers=await Promise.all([repo.disposition(a.context,a.jobId,a.digest,r.body),repo.disposition(a.context,a.jobId,a.digest,r.body)]);expect(answers[0]).toEqual(answers[1]);
 expect(Number((await f.admin.query('SELECT count(*) n FROM app.final_check_disposition_binding WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].n)).toBe(1);
});
it("SV5-26 audit/receipt/disposition roll back together before commit",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a);
 await expect(finalCheckTenant(f.runtime,a.tenantId,async db=>{await db.query('SELECT app.record_final_check_disposition($1,$2,$3,$4::jsonb)',[a.tenantId,a.jobId,a.digest,JSON.stringify(r.body)]);throw new Error('Synthetic fault before commit');})).rejects.toThrow('Synthetic fault');
 expect(Number((await f.admin.query('SELECT count(*) n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2',[a.tenantId,r.body.commandId])).rows[0].n)).toBe(0);
 expect(Number((await f.admin.query('SELECT count(*) n FROM app.final_check_disposition_binding WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].n)).toBe(0);
 expect((await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).items[0]?.disposition).toBeNull();
});
