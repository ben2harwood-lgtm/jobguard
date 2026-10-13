import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,availableFinalCheck,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("SV5-16 SV5-33 detector result and dismissal create no variation, case, invoice, authorization or journal",async()=>{
 const a=await seedFinalCheckJob(f);const moneyTables=['journal','financial_authorization','action_authorization','action_outbox','landing_allocation','recovery_fee_derivation','recovery_fee_journal'];
 const counts=async()=>Promise.all(moneyTables.map(async table=>Number((await f.admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`,[a.tenantId])).rows[0].n)));const before=await counts(),r=await availableFinalCheck(f,a);await new FinalCheckRepository(f.runtime).disposition(a.context,a.jobId,a.digest,r.body);
 for(const table of ['variation','recovery_case','customer_invoice'])expect(Number((await f.admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId])).rows[0].n)).toBe(0);
 expect((await f.admin.query("SELECT to_regclass('app.final_check_catch_binding') binding,to_regprocedure('app.confirm_final_check_catch(uuid,uuid)') routine")).rows[0]).toEqual({binding:null,routine:null});
 const receipt=(await f.admin.query('SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2',[a.tenantId,r.body.commandId])).rows[0].result;expect(receipt).not.toHaveProperty('variationId');expect(receipt).not.toHaveProperty('caseId');expect(await counts()).toEqual(before);
});
it.todo('SV5-11 Q2 competing successful confirmations and catch/case uniqueness HELD');
it.todo('SV5-15 Q2 successful confirmation grants no customer approval HELD');
it.todo('SV5-17 SV5-18 Q2 catch origin, stable scope, pricing and supplementary progression HELD');
it("SV5-11 SV5-15 SV5-19 finalized synthetic diary/message/photo observations coalesce into one reveal and rerun returns the same result",async()=>{
 const {insertFinalCheckEvidence}=await import('./final-check-fixture.js'),{createFinalCheckWorker}=await import('../../../apps/api/src/final-check.worker.js');
 const a=await seedFinalCheckJob(f);for(const kind of ['diary','message','completion_photo'])await insertFinalCheckEvidence(f,a,kind);await a.lock();
 const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId);
 const observations=m.sources.map(s=>({version:'observation.v1',tenantId:a.tenantId,jobId:a.jobId,kind:s.sourceKind==='completion_photo'?'completion_photo':'note_or_voice',evidence:{id:s.evidenceId,objectVersionId:s.objectVersionId,sha256:s.sha256,serverReceivedAt:s.receivedAt},text:'Outside tap fitted',facts:{workReference:'synthetic-outside-tap',scopeArea:'job',description:'Outside tap',status:'completed',estimatedValuePence:null,safetyImplication:false,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false},citations:[{start:0,end:18,quote:'Outside tap fitted'}]}));
 const worker=createFinalCheckWorker(f.shadow,observations,'synthetic_demo'),task={version:'final-check.task.v1',jobId:a.jobId,manifestId:m.id};
 const first=await worker.execute(a.context,task);expect(await worker.execute(a.context,task)).toEqual(first);
 const view=await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);expect(view.items).toHaveLength(1);expect(view.items[0]!.evidence).toHaveLength(3);
 expect(Number((await f.admin.query('SELECT count(*) n FROM app.variation WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].n)).toBe(0);
});
it("SV5-16 new case category stays disabled at the raw runtime boundary while Q2 is HELD",async()=>{
 const {randomUUID}=await import('node:crypto'),{finalCheckTenant}=await import('./final-check-fixture.js');const a=await seedFinalCheckJob(f);
 await expect(finalCheckTenant(f.runtime,a.tenantId,db=>db.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,case_type) VALUES($1,$2,$3,'missed_variation_final_account')",[randomUUID(),a.tenantId,a.jobId]))).rejects.toThrow('FINAL_CHECK_CONFIRMATION_HELD');
});
