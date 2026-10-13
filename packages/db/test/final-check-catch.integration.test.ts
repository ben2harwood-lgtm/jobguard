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
// Held with the concrete detector/shadow composition under Q6 (repair B1).
// The reviewed composition must restore the synthetic diary/message/photo
// coalescing + replay scenario; injected-port unit tests do not prove it.
it.todo('SV5-11 SV5-15 SV5-19 Q6 finalized synthetic diary/message/photo observations coalesce into one reveal and rerun returns the same result HELD');
it("SV5-16 new case category stays disabled at the raw runtime boundary while Q2 is HELD",async()=>{
 const {randomUUID}=await import('node:crypto'),{finalCheckTenant}=await import('./final-check-fixture.js');const a=await seedFinalCheckJob(f);
 await expect(finalCheckTenant(f.runtime,a.tenantId,db=>db.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,case_type) VALUES($1,$2,$3,'missed_variation_final_account')",[randomUUID(),a.tenantId,a.jobId]))).rejects.toThrow('FINAL_CHECK_CONFIRMATION_HELD');
});
