import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import {createWorkFixture,closeWorkFixture,meterCompany,verifyBusiness,requestCard,recordCard,resultFixture,ownCounts,workTenant,denyAdmission,type WorkFixture} from "./free-first-job-admission-fixtures.js";
describe("MON3 B ATOMIC-01 REPLAY-01 races/rollback",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
 it("concurrent exact request returns one durable attempt/receipt/audit",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);const id=randomUUID(),before=await ownCounts(f,a);
  const results=await Promise.all([requestCard(f,a,id),requestCard(f,a,id)]);expect(results[0]).toEqual(results[1]);
  const after=await ownCounts(f,a);expect(after.trial_card_attempt).toBe(before.trial_card_attempt!+1);expect(after.command_receipt).toBe(before.command_receipt!+1);expect(after.audit_event).toBe(before.audit_event!+1);
  const v=resultFixture(results[0].attemptId),rid=randomUUID();await Promise.all([recordCard(f,a,v,rid),recordCard(f,a,v,rid)]);
  expect((await ownCounts(f,a)).trial_card_result).toBe(1);
 });
 it("outer transaction rollback removes request, receipt and audit; denied activations never claim keys",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);const before=await ownCounts(f,a),id=randomUUID();
  await expect(workTenant(f.runtime,a.tenantId,async db=>{
   await db.query("SELECT app.mon3_request_card($1,$2,$3,$4::jsonb)",[a.tenantId,a.digest,id,JSON.stringify({version:'trial-card-request.v1'})]);throw new Error('rollback control');
  })).rejects.toThrow('rollback control');expect(await ownCounts(f,a)).toEqual(before);
  const results=await Promise.allSettled([denyAdmission(f,a),denyAdmission(f,a)]);expect(results.every(result=>result.status==='rejected')).toBe(true);expect(await ownCounts(f,a)).toEqual(before);
 });
 it("audit append failure rolls back attempt and receipt in the same transaction",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);const before=await ownCounts(f,a);
  await expect(workTenant(f.admin,a.tenantId,async db=>{
   await db.query("CREATE FUNCTION pg_temp.mon3pb_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'MON3_AUDIT_CONTROL'; END $$");
   await db.query("CREATE TRIGGER mon3pb_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION pg_temp.mon3pb_audit_failure()");
   await db.query("SELECT app.mon3_request_card($1,$2,$3,$4::jsonb)",[a.tenantId,a.digest,randomUUID(),JSON.stringify({version:'trial-card-request.v1'})]);
  })).rejects.toThrow('MON3_AUDIT_CONTROL');
  expect(await ownCounts(f,a)).toEqual(before);
 });

});
