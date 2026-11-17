import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,expect,it } from "vitest";
import { createWorkFixture,closeWorkFixture,meterCompany,workTenant,type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { keyParent,snapshot,store } from "./free-first-job-keys-fixtures.js";
import { seedWorkJob } from "./job-work-state-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";
import { SmallBuilderDemoRepository } from "../src/small-builder-demo-repository.js";
import { SmallBuilderTrialDemoRepository } from "../src/small-builder-trial-demo-repository.js";
import { FreeFirstJobLifecycleRepository } from "../src/free-first-job-lifecycle-repository.js";
import { SubscriptionRepository } from "../src/subscription-repository.js";
let f:WorkFixture;const old=process.env.JOBGUARD_ENV;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";f=await createWorkFixture();},60000);
afterAll(async()=>{await closeWorkFixture(f);if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;});
const create=()=>({contractVersion:"small-builder-demo.create.v1",commandId:randomUUID(),scenario:"trial"});
async function setup(existing=false){
 // The existing-start case uses the explicitly labelled MON-3 owner fixture,
 // not a successful quote/capacity journey. All binding/read/card paths are real.
 const a=existing?await firstTrialFixture(f):await meterCompany(f),other=await seedWorkJob(f,a.tenantId);
 const lifecycle=new SmallBuilderDemoRepository(f.runtime),repo=new SmallBuilderTrialDemoRepository(f.runtime);
 const run=await lifecycle.execute(a.context,a.digest,"create",null,create());if(!("runId" in run))throw new Error("run");
 const bind={version:"trial-demo-command.v1",action:"bind",commandId:randomUUID(),runId:run.runId,firstJobId:a.jobId,secondJobId:other.jobId};
 const call=(raw:unknown)=>repo.execute(a.context,a.digest,raw);return {a,other,run,bind,call,repo,lifecycle};
}
it("binds and resumes real sources, exact duplicate commands have one immutable effect",async()=>{
 const s=await setup(),before=(await f.admin.query("SELECT count(*)::int n FROM app.job_activation WHERE tenant_id=$1",[s.a.tenantId])).rows[0].n;
 const result=await s.call(s.bind);expect(await s.call(s.bind)).toEqual(result);
 expect((await s.call({version:"trial-demo-command.v1",action:"read",runId:s.run.runId})).first.jobId).toBe(s.a.jobId);
 const snap={version:"trial-demo-command.v1",action:"snapshot",commandId:randomUUID(),runId:s.run.runId},report=await s.call(snap);
 expect(await s.call(snap)).toEqual(report);
 expect(await s.call({version:"trial-demo-command.v1",action:"report",runId:s.run.runId,snapshotId:snap.commandId})).toEqual(report);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.demo_trial_binding WHERE tenant_id=$1",[s.a.tenantId])).rows[0].n).toBe(1);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.job_activation WHERE tenant_id=$1",[s.a.tenantId])).rows[0].n).toBe(before);
 await expect(s.call({...s.bind,secondJobId:randomUUID()})).rejects.toThrow("DEMO_COMMAND_CONFLICT");
});
it("another company's run and jobs, and revoked authority including replays and saved reports, fail closed",async()=>{
 const s=await setup(),b=await meterCompany(f);await s.call(s.bind);
 const read={version:"trial-demo-command.v1",action:"read",runId:s.run.runId};
 await expect(s.repo.execute(b.context,b.digest,read)).rejects.toThrow("DEMO_NOT_FOUND");
 const other=await setup();await expect(other.call({...other.bind,secondJobId:s.a.jobId})).rejects.toThrow("DEMO_FORBIDDEN");
 const snap={version:"trial-demo-command.v1",action:"snapshot",commandId:randomUUID(),runId:s.run.runId};await s.call(snap);
 await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[s.a.sessionId]);
 for(const command of [s.bind,read,snap,{version:"trial-demo-command.v1",action:"report",runId:s.run.runId,snapshotId:snap.commandId}])await expect(s.call(command)).rejects.toThrow("DEMO_FORBIDDEN");
});
it("archive/reset never restores eligibility, changes subjects, removes identity claims or writes subscription terms",async()=>{
 const s=await setup(true);await s.call(s.bind);
 const before=(await f.admin.query("SELECT * FROM app.trial_identity_key_claim WHERE tenant_id=$1 ORDER BY identity_key",[s.a.tenantId])).rows;
 const archived=await s.lifecycle.execute(s.a.context,s.a.digest,"reset",s.run.runId,{contractVersion:"small-builder-demo.reset.v1",commandId:randomUUID(),expectedRunRevision:1});
 if(!("successorId" in archived)||!archived.successorId)throw new Error("successor");
 await expect(s.call({...s.bind,commandId:randomUUID()})).rejects.toThrow("DEMO_ARCHIVED");
 await expect(s.call({...s.bind,commandId:randomUUID(),runId:archived.successorId,firstJobId:s.other.jobId,secondJobId:s.a.jobId})).rejects.toThrow("DEMO_COMMAND_CONFLICT");
 const resumed=await s.call({...s.bind,commandId:randomUUID(),runId:archived.successorId});expect(resumed.first.start).not.toBeNull();
 expect((await f.admin.query("SELECT * FROM app.trial_identity_key_claim WHERE tenant_id=$1 ORDER BY identity_key",[s.a.tenantId])).rows).toEqual(before);
 expect(resumed.subscription.agreements).toEqual([]);
 const lifecycle=new FreeFirstJobLifecycleRepository(f.runtime);
 await expect(lifecycle.activate(s.a.context,s.a.digest,s.a.actorId,{version:"trial-switch-live.v1",commandId:randomUUID(),jobId:s.other.jobId,acceptedDocumentId:randomUUID(),acceptedDocumentHash:"a".repeat(64),acceptedDocumentVersion:1,expectedJobRevision:0})).rejects.toThrow("TRIAL_COMPLETED_CARD_REQUIRED");
});
it("reused company or phone/card identity is refused after archive/reset",async()=>{
 const s=await setup(true);await s.call(s.bind);
 await s.lifecycle.execute(s.a.context,s.a.digest,"reset",s.run.runId,{contractVersion:"small-builder-demo.reset.v1",commandId:randomUUID(),expectedRunRevision:1});
 const original=(await f.admin.query("SELECT company_number,normalized_phone,card_fingerprint FROM app.trial_identity_snapshot WHERE tenant_id=$1",[s.a.tenantId])).rows[0];
 for(const duplicate of [{company:original.company_number},{phone:original.normalized_phone,fingerprint:original.card_fingerprint}]){
  const next={...snapshot(await keyParent(f)),...duplicate};
  await expect(store(f,next)).rejects.toThrow("TRIAL_IDENTITY_CONFLICT");
 }
});

it("cannot charge without accepted effective terms or accept caller clock/backdated terms",async()=>{
 const s=await setup(true),subscription=new SubscriptionRepository(f.runtime);
 await s.call(s.bind);
 for(const extra of [{asOf:"2099-01-01T00:00:00Z"},{acceptedAt:"2020-01-01"},{settled:true}])await expect(s.call({...s.bind,...extra})).rejects.toThrow("INVALID_DEMO_INPUT");
 await expect(subscription.command(s.a.context,s.a.digest,randomUUID(),{version:"subscription-command.v1",kind:"issue",periodStart:"2026-01-01",expectedRevision:0})).rejects.toThrow();
 expect((await subscription.read(s.a.context,s.a.digest)).periods).toEqual([]);
});
it("binding is FORCE RLS, tenant-FK-bound, private and immutable",async()=>{
 const s=await setup();await s.call(s.bind);
 expect((await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed FROM pg_class WHERE oid='app.demo_trial_binding'::regclass")).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true,allowed:false});
 for(const sql of ["SELECT * FROM app.demo_trial_binding","UPDATE app.demo_trial_binding SET run_id=gen_random_uuid()","DELETE FROM app.demo_trial_binding","TRUNCATE app.demo_trial_binding"])await expect(workTenant(f.runtime,s.a.tenantId,db=>db.query(sql))).rejects.toThrow();
 await expect(f.admin.query("UPDATE app.demo_trial_binding SET second_job_id=first_job_id WHERE tenant_id=$1",[s.a.tenantId])).rejects.toThrow("DEMO_IMMUTABLE");
});

it("unbound reset remains usable, but skipped unbound generations cannot discard an ancestor binding",async()=>{
 const s=await setup();
 const reset=async(runId:string)=>{
  const result=await s.lifecycle.execute(s.a.context,s.a.digest,"reset",runId,{contractVersion:"small-builder-demo.reset.v1",commandId:randomUUID(),expectedRunRevision:1});
  if(!("successorId" in result)||!result.successorId)throw new Error("successor");return result.successorId;
 };
 const next=await reset(s.run.runId);await s.call({...s.bind,runId:next});
 const unbound=await reset(next),last=await reset(unbound);
 await expect(s.call({...s.bind,commandId:randomUUID(),runId:last,firstJobId:s.other.jobId,secondJobId:s.a.jobId})).rejects.toThrow("DEMO_COMMAND_CONFLICT");
 expect((await s.call({...s.bind,commandId:randomUUID(),runId:last})).first.jobId).toBe(s.a.jobId);
});
