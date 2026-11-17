import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import {createWorkFixture,closeWorkFixture,meterCompany,verifyBusiness,requestCard,recordCard,resultFixture,workTenant,type WorkFixture} from "./free-first-job-admission-fixtures.js";
describe("MON3 B CARD-01 persisted fictional card facts",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
 it("requested, redirect, failed, cancelled and unknown never complete; result binds attempt/business",async()=>{
  const a=await meterCompany(f), verification=await verifyBusiness(f,a);
  for(const outcome of ['redirect_only','failed','cancelled','outcome_unknown','completed']){
   const attempt=await requestCard(f,a);expect(attempt.status).toBe('requested');
   expect((await f.admin.query("SELECT id FROM app.trial_card_result WHERE tenant_id=$1 AND attempt_id=$2",[a.tenantId,attempt.attemptId])).rows).toEqual([]);
   const id=randomUUID(),v=resultFixture(attempt.attemptId,outcome);await recordCard(f,a,v,id);await recordCard(f,a,v,id);
   const row=(await f.admin.query("SELECT * FROM app.trial_card_result WHERE tenant_id=$1 AND id=$2",[a.tenantId,id])).rows[0];
   expect(row.verification_id).toBe(verification);expect(row.outcome).toBe(outcome);
   expect(row.fingerprint).toBe(outcome==='completed'?'sim_fp_card_a':null);
   expect(row.reference).toBe(outcome==='completed'?`sim_ref_${attempt.attemptId}`:null);
   await expect(recordCard(f,a,{...v,fixtureCard:'card_b'},id)).rejects.toThrow('COMMAND_CONFLICT');
   await expect(recordCard(f,a,{...v,outcome:outcome==='completed'?'failed':'completed'},id)).rejects.toThrow('COMMAND_CONFLICT');
  }
  const b=await meterCompany(f);await verifyBusiness(f,b);const attempt=await requestCard(f,a);
  await expect(recordCard(f,b,resultFixture(attempt.attemptId))).rejects.toThrow('TRIAL_CARD_ATTEMPT_REQUIRED');
  await expect(recordCard(f,a,resultFixture(randomUUID()))).rejects.toThrow('TRIAL_CARD_ATTEMPT_REQUIRED');
 });
 it("no runtime completion execution or direct writes, even for owner",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);const attempt=await requestCard(f,a);
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.mon3_record_card_fixture($1,$2,$3,$4::jsonb)",[a.tenantId,a.digest,randomUUID(),JSON.stringify(resultFixture(attempt.attemptId))]))).rejects.toMatchObject({code:'42501'});
  for(const table of ['trial_business_verification','trial_card_attempt','trial_card_result','trial_admission']){
   await expect(workTenant(f.runtime,a.tenantId,db=>db.query(`SELECT * FROM app.${table}`))).rejects.toMatchObject({code:'42501'});
   for(const sql of [`DELETE FROM app.${table}`,`INSERT INTO app.${table} DEFAULT VALUES`,`UPDATE app.${table} SET tenant_id=tenant_id`,`TRUNCATE app.${table}`])await expect(workTenant(f.runtime,a.tenantId,db=>db.query(sql))).rejects.toMatchObject({code:'42501'});
  }
 });
 it("immutable facts reject update/delete/truncate and identity replacement",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);const attempt=await requestCard(f,a);await recordCard(f,a,resultFixture(attempt.attemptId));
  await expect(verifyBusiness(f,a)).rejects.toMatchObject({code:'23505'});
  for(const table of ['trial_business_verification','trial_card_attempt','trial_card_result'])for(const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])await expect(f.admin.query(sql)).rejects.toThrow();
 });
});
