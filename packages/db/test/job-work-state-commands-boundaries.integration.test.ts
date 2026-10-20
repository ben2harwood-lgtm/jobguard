import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { insertPhoto,boundaryLock,closeWorkFixture,createWorkFixture,workTenant,type WorkFixture } from "./job-work-state-fixtures.js";
import { seedWorkPractice,commandCounts,practiceWorkJob,runWorkCommand,workCommand } from "./job-work-state-command-fixtures.js";
describe("CH-4-C capacity, post-lock and hidden-state boundaries",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},120000);afterAll(async()=>closeWorkFixture(f));
 it("unavailable capacity admission fails closed for resume and unlocked reopen",async()=>{
  const p=await seedWorkPractice(f),before=await commandCounts(f,p);
  await expect(runWorkCommand(f.runtime,p,workCommand("resume"))).rejects.toThrow("CAPACITY_ADMISSION_UNAVAILABLE");expect(await commandCounts(f,p)).toEqual(before);
  const closed=await runWorkCommand(f.runtime,p,workCommand("close",{reason:"other",note:"Fictional closure"}));
  await expect(runWorkCommand(f.runtime,p,workCommand("reopen",{expectedRevision:closed.events.length,closeEventId:closed.events.at(-1)!.id}))).rejects.toThrow("CAPACITY_ADMISSION_UNAVAILABLE");
 });
 it("raw runtime identities cannot forge the pre-live administrative path, even with a matching receipt and settings",async()=>{
  const p=await seedWorkPractice(f),t=p.auth.context.tenantId,job=(await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='quoting' LIMIT 1",[t,p.auth.digest])).rows[0].id as string;
  const before=await commandCounts(f,p),identities=(await f.admin.query("SELECT count(*)::int n FROM app.watchdog_command_identity WHERE tenant_id=$1",[t])).rows;
  for(const action of ["close","reopen","link","finish","cancel_finish"]){
   await expect(workTenant(f.runtime,t,async db=>{
    const cid=randomUUID(),kind=`WorkState.${action}`;
    await db.query("SELECT set_config('app.ch4_action',$1,true),set_config('app.watchdog_claims',$2,true)",[action,`${cid},`]);
    await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,$3,$2::uuid::text,$4,'processing',$5)",[t,cid,kind,"a".repeat(64),p.auth.membershipId]);
    await db.query("INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash) VALUES($1,$2,$3,$4,$5)",[t,cid,job,kind,"a".repeat(64)]);
   })).rejects.toThrow("JOB_NOT_LIVE");
  }
  expect(await commandCounts(f,p)).toEqual(before);expect((await f.admin.query("SELECT count(*)::int n FROM app.watchdog_command_identity WHERE tenant_id=$1",[t])).rows).toEqual(identities);
 });
 it("immutable successful replay survives lock; locked reopening does not unlock or alter commercial status",async()=>{
  const p=await seedWorkPractice(f),input=workCommand(),result=await runWorkCommand(f.runtime,p,input);await boundaryLock(f,await practiceWorkJob(f,p));
  expect(await runWorkCommand(f.runtime,p,input)).toEqual(result);
  const closed=await runWorkCommand(f.runtime,p,workCommand("close",{expectedRevision:result.events.length,reason:"other",note:"Fictional closure"}));
  const before=(await f.admin.query("SELECT row_to_json(j) row FROM app.job j WHERE tenant_id=$1 AND id=$2",[p.auth.context.tenantId,p.jobId])).rows;
  const opened=await runWorkCommand(f.runtime,p,workCommand("reopen",{expectedRevision:closed.events.length,closeEventId:closed.events.at(-1)!.id}));expect(opened.lock).toEqual(closed.lock);
  expect((await f.admin.query("SELECT row_to_json(j) row FROM app.job j WHERE tenant_id=$1 AND id=$2",[p.auth.context.tenantId,p.jobId])).rows).toEqual(before);
 });
 it("post-lock photo/diary/message refusal precedes missing source constraints",async()=>{
  const p=await seedWorkPractice(f);await boundaryLock(f,await practiceWorkJob(f,p));
  await expect(insertPhoto(f,await practiceWorkJob(f,p))).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  for(const table of ["job_diary_entry","customer_message_source"])await expect(workTenant(f.admin,p.auth.context.tenantId,db=>db.query(`INSERT INTO app.${table}(tenant_id,job_id,id,actor_membership_id) VALUES($1,$2,$3,$4)`,[p.auth.context.tenantId,p.jobId,randomUUID(),p.auth.membershipId]))).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
 });
 it("open result use retains existing lock and completed-check gates",async()=>{
  const p=await seedWorkPractice(f),query=()=>workTenant(f.runtime,p.auth.context.tenantId,db=>db.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,'final','fictional@example.invalid','2026-10-18',$6)",[p.auth.context.tenantId,p.jobId,randomUUID(),p.auth.membershipId,randomUUID(),"a".repeat(64)]));
  expect((await workTenant(f.runtime,p.auth.context.tenantId,db=>db.query("SELECT * FROM app.reveal_shadow_signals($1,$2)",[p.auth.context.tenantId,p.jobId]))).rows).toEqual([]);
  await expect(query()).rejects.toThrow("FINAL_ACCOUNT_LOCK_REQUIRED");await boundaryLock(f,await practiceWorkJob(f,p));await expect(query()).rejects.toThrow("FINAL_CHECK_NOT_COMPLETE");
 });
 it("closed completed-result use refused and new completed check cannot bypass closure",async()=>{
  const p=await seedWorkPractice(f);await boundaryLock(f,await practiceWorkJob(f,p));
  await workTenant(f.admin,p.auth.context.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) SELECT tenant_id,job_id,$3,id,locked_at,'completed' FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[p.auth.context.tenantId,p.jobId,randomUUID()]));
  const history=(await f.admin.query("SELECT row_to_json(c) row FROM app.final_account_lock_check c WHERE tenant_id=$1 AND job_id=$2",[p.auth.context.tenantId,p.jobId])).rows;
  await runWorkCommand(f.runtime,p,workCommand("close",{reason:"other",note:"Fictional closed job"}));const before=await commandCounts(f,p);
  await expect(workTenant(f.runtime,p.auth.context.tenantId,db=>db.query("SELECT * FROM app.reveal_shadow_signals($1,$2)",[p.auth.context.tenantId,p.jobId]))).rejects.toThrow("JOB_WORK_CLOSED");
  await expect(workTenant(f.runtime,p.auth.context.tenantId,db=>db.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,'final','fictional@example.invalid','2026-10-18',$6)",[p.auth.context.tenantId,p.jobId,randomUUID(),p.auth.membershipId,randomUUID(),"a".repeat(64)]))).rejects.toThrow("JOB_WORK_CLOSED");
  for(const status of ["pending","completed"])await expect(workTenant(f.admin,p.auth.context.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,clock_timestamp(),$5)",[p.auth.context.tenantId,p.jobId,randomUUID(),randomUUID(),status]))).rejects.toThrow("JOB_WORK_CLOSED");
  expect(await commandCounts(f,p)).toEqual(before);
  expect((await f.admin.query("SELECT row_to_json(c) row FROM app.final_account_lock_check c WHERE tenant_id=$1 AND job_id=$2",[p.auth.context.tenantId,p.jobId])).rows).toEqual(history);
 });
 it("zero/many shadow signals give identical public work-state results",async()=>{
  const p=await seedWorkPractice(f),repo=new JobWorkStateRepository(f.runtime),before=await repo.read(p.auth.context,p.jobId,p.auth.digest);
  await workTenant(f.admin,p.auth.context.tenantId,async db=>{for(let n=0;n<10;n++)await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band) VALUES($1,$2,$3,$4,'fixture_site_work','deterministic','ch4c.v1',clock_timestamp(),'Fictional hidden candidate','low')",[p.auth.context.tenantId,p.jobId,randomUUID(),randomUUID()])});
  expect(await repo.read(p.auth.context,p.jobId,p.auth.digest)).toEqual(before);
 });
});
