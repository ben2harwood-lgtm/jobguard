import { randomUUID } from "node:crypto";
import { UserCommandDispatcher } from "../src/commands.js";
import { DisabledFreeFirstJobActivationMutation } from "../src/activation-repository.js";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import {createWorkFixture,closeWorkFixture,meterCompany,verifyBusiness,requestCard,recordCard,resultFixture,denyAdmission,ownCounts,type WorkFixture} from "./free-first-job-admission-fixtures.js";
describe("MON3 B IDENTITY-01 LIVE-01 ATOMIC-01 disabled boundary",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
 it("no identity, partial identity and completed card all remain admission-disabled without consuming A keys",async()=>{
  const a=await meterCompany(f);
  for(const step of [async()=>{},async()=>{await verifyBusiness(f,a,null);},async()=>{const attempt=await requestCard(f,a);await recordCard(f,a,resultFixture(attempt.attemptId));}]){
   await step();const before=await ownCounts(f,a);
   for(const raw of [{},{enabled:true},{version:'trial-admission.v1',trial:true,small:true,sharedPlace:true}])await expect(denyAdmission(f,a,raw)).rejects.toThrow('FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C');
   expect(await ownCounts(f,a)).toEqual(before);
  }
 });
 it("forced RLS and migration ownership for each new business table",async()=>{
  for(const table of ['trial_business_verification','trial_card_attempt','trial_card_result','trial_admission']){
   const row=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows[0];
   expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration'});
  }
 });
 it("checked dispatcher seam refuses atomically and session checks precede replay",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);const before=await ownCounts(f,a);
  const raw={version:'switch-live.v3',activationId:randomUUID(),termsId:randomUUID(),jobId:a.jobId,acceptedDocumentId:randomUUID(),acceptedDocumentVersion:1,acceptedDocumentHash:'a'.repeat(64),expectedJobRevision:1};
  const command={version:'command.v1',commandId:randomUUID(),commandType:'job.switch_live',semanticKey:`trial-test:${a.jobId}`,actorMembershipId:a.actorId,subjectType:'job',subjectRef:a.jobId,action:{actionType:'job.switch_live',recipient:null,contentHash:raw.acceptedDocumentHash,aggregateRevision:1,amountPence:null,currency:null,policyVersion:'synthetic_demo_activation.v3',expiresAt:new Date(Date.now()+60000)}};
  const prior=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV='synthetic_demo';
  try{
   const mutation=new DisabledFreeFirstJobActivationMutation(a.tenantId,a.digest,raw);
   await expect(new UserCommandDispatcher(f.runtime).dispatch(a.context,command,mutation)).rejects.toThrow('FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C');
   expect(await ownCounts(f,a)).toEqual(before);
   await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
   await expect(new UserCommandDispatcher(f.runtime).dispatch(a.context,command,mutation)).rejects.toThrow('METER_FORBIDDEN');
   expect(await ownCounts(f,a)).toEqual(before);
  }finally{if(prior===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=prior;}
 });

});
