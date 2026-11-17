import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import {createWorkFixture,closeWorkFixture,meterCompany,verifyBusiness,requestCard,denyAdmission,workTenant,recordCard,resultFixture,type WorkFixture} from "./free-first-job-admission-fixtures.js";
describe("MON3 B AUTH-01 REPLAY-01 current persisted authority",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
 it("exact replay rechecks session revocation and current owner",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);const id=randomUUID(),first=await requestCard(f,a,id);
  expect(await requestCard(f,a,id)).toEqual(first);
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
  await expect(requestCard(f,a,id)).rejects.toThrow('METER_FORBIDDEN');await expect(denyAdmission(f,a)).rejects.toThrow('METER_FORBIDDEN');
  const b=await meterCompany(f);await verifyBusiness(f,b);const second=randomUUID();await requestCard(f,b,second);
  await workTenant(f.admin,b.tenantId,db=>db.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2",[b.tenantId,b.actorId]));
  await expect(requestCard(f,b,second)).rejects.toThrow('FREE_FIRST_JOB_ACCESS_DENIED');
 });
 it("cross-tenant session and browser completion refuse",async()=>{
  const a=await meterCompany(f),b=await meterCompany(f);await verifyBusiness(f,a);
  await expect(requestCard(f,{...a,digest:b.digest})).rejects.toThrow('METER_FORBIDDEN');
  await expect(requestCard(f,a,randomUUID(),{version:'trial-card-request.v1',outcome:'completed'})).rejects.toThrow('INVALID_FREE_FIRST_JOB_INPUT');
 });
 it("expired session refuses request replay and migration-owned result replay",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);const command=randomUUID(),attempt=await requestCard(f,a,command),resultId=randomUUID(),v=resultFixture(attempt.attemptId);
  await recordCard(f,a,v,resultId);
  await f.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE id=$1",[a.sessionId]);
  await expect(requestCard(f,a,command)).rejects.toThrow('METER_FORBIDDEN');
  await expect(recordCard(f,a,v,resultId)).rejects.toThrow('METER_FORBIDDEN');
 });

});
