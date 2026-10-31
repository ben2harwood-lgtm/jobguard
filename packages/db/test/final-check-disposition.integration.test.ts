import {afterAll,beforeAll,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,availableFinalCheck,FINAL_CHECK_ACTOR,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("SV5-09 SV5-20 dismissals persist actor/command; replay returns first result after changed state",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),repo=new FinalCheckRepository(f.runtime),first=await repo.disposition(a.context,a.jobId,a.digest,r.body);
 expect(await new FinalCheckRepository(f.runtime).disposition(a.context,a.jobId,a.digest,r.body)).toEqual(first);
 const binding=(await f.admin.query('SELECT actor_membership_id,command_id,answer FROM app.final_check_disposition_binding WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0];expect(binding).toEqual({actor_membership_id:FINAL_CHECK_ACTOR,command_id:r.body.commandId,answer:'not_completed'});
 await expect(repo.disposition(a.context,a.jobId,a.digest,{...r.body,answer:'not_chargeable'})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
});
it("SV5-12 exact locked included reference works; unmatched own-job answer becomes disputed without changing lock",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),repo=new FinalCheckRepository(f.runtime);
 const before=(await f.admin.query('SELECT row_to_json(l)::text bytes FROM app.final_account_lock l WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows;
 await expect(repo.disposition(a.context,a.jobId,a.digest,{...r.body,answer:'already_included',referenceId:randomUUID()})).rejects.toThrow('FINAL_CHECK_FORBIDDEN');
 expect(await repo.disposition(a.context,a.jobId,a.digest,{...r.body,answer:'already_included'})).toMatchObject({disposition:'attribution_disputed'});
 expect((await f.admin.query('SELECT row_to_json(l)::text bytes FROM app.final_account_lock l WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows).toEqual(before);
 const b=await seedFinalCheckJob(f),br=await availableFinalCheck(f,b);expect(await repo.disposition(b.context,b.jobId,b.digest,{...br.body,answer:'already_included',referenceId:b.lineId})).toMatchObject({disposition:'already_included'});
});
it("SV5-13 SV5-33 unresolved queue is scoped and enables no human resolution or fee",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),repo=new FinalCheckRepository(f.runtime);await repo.disposition(a.context,a.jobId,a.digest,{...r.body,answer:'in_original_scope'});
 expect(await repo.disputes(a.context,a.jobId,a.digest)).toEqual([expect.objectContaining({signalId:r.signalId,runId:r.runId})]);
 expect((await f.admin.query("SELECT to_regprocedure('app.resolve_final_check_dispute(uuid,uuid)') routine,to_regclass('app.final_check_dispute_resolution') relation")).rows[0]).toEqual({routine:null,relation:null});
 expect(Number((await f.admin.query('SELECT count(*) n FROM app.recovery_case WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].n)).toBe(0);
});

it('SB-07: "Already included" with no matching line', async () => {
 const a=await seedFinalCheckJob(f), r=await availableFinalCheck(f,a), repo=new FinalCheckRepository(f.runtime);
 const lock=async()=> (await f.admin.query('SELECT row_to_json(l)::text bytes FROM app.final_account_lock l WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows;
 const before=await lock();
 await expect(repo.disposition(a.context,a.jobId,a.digest,{...r.body,answer:'already_included',referenceId:randomUUID()})).rejects.toThrow('FINAL_CHECK_FORBIDDEN');
 expect(await repo.disposition(a.context,a.jobId,a.digest,{...r.body,answer:'already_included'})).toMatchObject({disposition:'attribution_disputed'});
 expect(await lock()).toEqual(before);
 expect((await f.admin.query('SELECT count(*)::int n FROM app.recovery_case WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].n).toBe(0);
 const b=await seedFinalCheckJob(f), br=await availableFinalCheck(f,b);
 expect(await repo.disposition(b.context,b.jobId,b.digest,{...br.body,answer:'already_included',referenceId:b.lineId})).toMatchObject({disposition:'already_included'});
});
