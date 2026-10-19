import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { closeWorkFixture,createWorkFixture,seedWorkPractice,seedWorkJob,workTenant,boundaryLock,type WorkFixture } from "./job-work-state-fixtures.js";
import { commandCounts,runWorkCommand,workCommand } from "./job-work-state-command-fixtures.js";
describe("CH-4-C persisted owner commands (real PostgreSQL)",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},120000);afterAll(async()=>closeWorkFixture(f));
 it("active-owner success; same-ID replay; fresh connection persistence; no money/outbox effects",async()=>{
  const p=await seedWorkPractice(f),input=workCommand(),before=await commandCounts(f,p),result=await runWorkCommand(f.runtime,p,input);
  expect(result.events.at(-1)?.kind).toBe("finished_on_site");
  const after=await commandCounts(f,p);expect(after.command_receipt).toBe(before.command_receipt!+1);expect(after.job_work_state_event).toBe(before.job_work_state_event!+1);
  for(const table of ["synthetic_obligation","journal","recovery_fee_journal","action_outbox"])expect(after[table]).toBe(before[table]);
  const fresh=new Pool(f.runtime.options);try{expect(await runWorkCommand(fresh,p,input)).toEqual(result)}finally{await fresh.end()}
  expect(await commandCounts(f,p)).toEqual(after);
 });
 it("cancel binds the outstanding marker and appends without rewriting it",async()=>{
  const p=await seedWorkPractice(f),finished=await runWorkCommand(f.runtime,p,workCommand()),marker=finished.events.at(-1)!;
  await expect(runWorkCommand(f.runtime,p,workCommand("cancel_finish",{expectedRevision:finished.events.length,markerId:randomUUID()}))).rejects.toThrow("INVALID_WORK_STATE_INPUT");
  const cancelled=await runWorkCommand(f.runtime,p,workCommand("cancel_finish",{expectedRevision:finished.events.length,markerId:marker.id}));
  expect(cancelled.events.find(e=>e.id===marker.id)).toEqual(marker);expect(cancelled.events.at(-1)).toMatchObject({kind:"finished_cancelled",predecessorId:marker.id});
 });
 it("pre-live administration does not admit site work or change commercial status",async()=>{
  const p=await seedWorkPractice(f),job=(await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='quoting' LIMIT 1",[p.auth.context.tenantId,p.auth.digest])).rows[0].id as string;
  await expect(runWorkCommand(f.runtime,p,workCommand(),job)).rejects.toThrow("JOB_NOT_LIVE");
  const closed=await runWorkCommand(f.runtime,p,workCommand("close",{reason:"other",note:"Fictional customer cancelled before site work"}),job);
  expect(closed.events.at(-1)?.kind).toBe("closed");expect((await f.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2",[p.auth.context.tenantId,job])).rows[0].status).toBe("quoting");
 });
 it("stale revision and same-ID conflicts across command kinds leave no successful effects",async()=>{
  const p=await seedWorkPractice(f),input=workCommand();await runWorkCommand(f.runtime,p,input);const before=await commandCounts(f,p);
  await expect(runWorkCommand(f.runtime,p,workCommand())).rejects.toThrow("WORK_STATE_STALE_REVISION");
  await expect(runWorkCommand(f.runtime,p,{...input,action:"close",reason:"other",note:"Fictional closure"})).rejects.toThrow("WORK_STATE_CONFLICT");
  const sibling=(await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND id<>$3 LIMIT 1",[p.auth.context.tenantId,p.auth.digest,p.jobId])).rows[0].id as string;
  await expect(runWorkCommand(f.runtime,p,input,sibling)).rejects.toThrow("WORK_STATE_CONFLICT");
  expect(await commandCounts(f,p)).toEqual(before);
 });
 it("concurrent duplicate creates one immutable event and receipt",async()=>{
  const p=await seedWorkPractice(f),input=workCommand(),before=await commandCounts(f,p);
  const results=await Promise.all([runWorkCommand(f.runtime,p,input),runWorkCommand(f.runtime,p,input)]);expect(results[0]).toEqual(results[1]);
  const after=await commandCounts(f,p);expect(after.command_receipt).toBe(before.command_receipt!+1);expect(after.job_work_state_event).toBe(before.job_work_state_event!+1);
 });
 it("same-tenant practice owners can command sibling jobs; unknown jobs and forged input cannot authorize",async()=>{
  const p=await seedWorkPractice(f),other=await seedWorkPractice(f);
  expect((await runWorkCommand(f.runtime,p,workCommand(),other.jobId)).events.at(-1)?.kind).toBe("finished_on_site");
  expect((await runWorkCommand(f.runtime,p,workCommand(),p.jobId,other.auth.digest)).events.at(-1)?.kind).toBe("finished_on_site");
  const before=await commandCounts(f,p);
  await expect(runWorkCommand(f.runtime,p,workCommand(),randomUUID())).rejects.toThrow("WORK_STATE_FORBIDDEN");
  await expect(runWorkCommand(f.runtime,p,workCommand("finish",{actorMembershipId:p.auth.membershipId}))).rejects.toThrow("INVALID_WORK_STATE_INPUT");
  expect(await commandCounts(f,p)).toEqual(before);
 });
 it("normal owner in a random tenant succeeds; foreign, revoked, expired and non-owner memberships cannot append or replay",async()=>{
  const job=await seedWorkJob(f),other=await seedWorkJob(f),input=workCommand();
  const run=(actor=job.actorId,body=input)=>workTenant(f.runtime,job.tenantId,async db=>(await db.query("SELECT app.ch4_record_work_state($1,$2,$3,$4::jsonb) result",[job.tenantId,job.jobId,actor,JSON.stringify(body)])).rows[0].result);
  const first=await run();expect(first.events.at(-1).kind).toBe("finished_on_site");expect(await run()).toEqual(first);
  await expect(run(other.actorId)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  for(const change of ["role='admin'","role='finance'","revoked_at=clock_timestamp()","expires_at=clock_timestamp()-interval '1 second'"]){
   await f.admin.query(`UPDATE app.membership SET ${change} WHERE tenant_id=$1 AND id=$2`,[job.tenantId,job.actorId]);
   await expect(run()).rejects.toThrow("WORK_STATE_FORBIDDEN");
   await expect(run(job.actorId,workCommand("close",{expectedRevision:1,reason:"other",note:"Fictional"}))).rejects.toThrow("WORK_STATE_FORBIDDEN");
   await f.admin.query("UPDATE app.membership SET role='owner',revoked_at=NULL,expires_at=NULL WHERE tenant_id=$1 AND id=$2",[job.tenantId,job.actorId]);
  }
  expect(await run()).toEqual(first);
  const cancelled=await run(job.actorId,workCommand("cancel_finish",{expectedRevision:1,markerId:first.events.at(-1).id}));
  expect(cancelled.events.at(-1).kind).toBe("finished_cancelled");
  await boundaryLock(f,job);
  const closed=await run(job.actorId,workCommand("close",{expectedRevision:2,reason:"other",note:"Fictional closure"}));
  const reopened=await run(job.actorId,workCommand("reopen",{expectedRevision:3,closeEventId:closed.events.at(-1).id}));
  expect(reopened.events.at(-1).kind).toBe("reopened");
 });
 it("exact common party bindings link an existing ordinary successor; replay creates no extra effect",async()=>{
  const {linkPair,runLink}=await import("./job-work-state-command-fixtures.js"),{p,input}=await linkPair(f),before=await commandCounts(f,p);
  const jobs=(await f.admin.query("SELECT row_to_json(j) row FROM app.job j WHERE tenant_id=$1 ORDER BY id",[p.auth.context.tenantId])).rows;
  const owner={...p,auth:{...p.auth,digest:p.auth.membershipId}};
  const first=await runLink(f.runtime,owner,input);expect(first.links).toHaveLength(1);expect(await runLink(f.runtime,owner,input)).toEqual(first);
  const after=await commandCounts(f,p);expect(after.job_link).toBe(before.job_link!+1);
  for(const table of ["synthetic_obligation","journal","recovery_fee_journal","action_outbox"])expect(after[table]).toBe(before[table]);
  expect((await f.admin.query("SELECT row_to_json(j) row FROM app.job j WHERE tenant_id=$1 ORDER BY id",[p.auth.context.tenantId])).rows).toEqual(jobs);
 });
 it("link still refuses mismatched bindings for a same-tenant sibling session",async()=>{
  const p=await seedWorkPractice(f),other=await seedWorkPractice(f),before=await commandCounts(f,p);
  const {workTenant}=await import("./job-work-state-fixtures.js");
  const input={version:"job-link-command.v1",action:"link",commandId:randomUUID(),expectedRevision:0,successorJobId:other.jobId,predecessorBindingId:randomUUID(),successorBindingId:randomUUID()};
  await expect(workTenant(f.runtime,p.auth.context.tenantId,db=>db.query("SELECT app.ch4_link_post_lock_job($1,$2,$3,$4::jsonb)",[p.auth.context.tenantId,p.jobId,p.auth.digest,JSON.stringify(input)]))).rejects.toThrow("INVALID_WORK_STATE_INPUT");
  expect(await commandCounts(f,p)).toEqual(before);
 });
 it("SQL refuses contractor and pilot tracks even with a current practice owner",async()=>{
  for(const field of ["job_track","environment"]){
   const p=await seedWorkPractice(f),db=await f.admin.connect();try{
    await db.query("BEGIN");await db.query("SET LOCAL session_replication_role='replica'");
    await db.query(`UPDATE app.job_commercial_track SET ${field}=$1 WHERE tenant_id=$2 AND job_id=$3`,[field==="job_track"?"contractor":"pilot_no_charge",p.auth.context.tenantId,p.jobId]);
    await db.query("SET LOCAL session_replication_role='origin'");await db.query("SELECT set_config('app.tenant_id',$1,true)",[p.auth.context.tenantId]);await db.query("SET LOCAL ROLE jobguard_runtime");
    const {commandOn}=await import("./job-work-state-command-fixtures.js");await expect(commandOn(db,p,workCommand())).rejects.toThrow("WORK_STATE_FORBIDDEN");
   }finally{await db.query("ROLLBACK");db.release()}
  }
 });
 it("expired/revoked session is refused before successful replay",async()=>{
  for(const field of ["expires_at","revoked_at"]){
   const p=await seedWorkPractice(f),input=workCommand();await runWorkCommand(f.runtime,p,input);const before=await commandCounts(f,p);
   await f.admin.query(`UPDATE control_plane.practice_session SET ${field}=clock_timestamp()-interval '1 second' WHERE token_digest=$1`,[p.auth.digest]);
   await expect(runWorkCommand(f.runtime,p,input)).rejects.toThrow("WORK_STATE_FORBIDDEN");expect(await commandCounts(f,p)).toEqual(before);
  }
 });
 it("expired and revoked membership cannot append or replay",async()=>{
  for(const field of ["expires_at","revoked_at"]){
   const p=await seedWorkPractice(f),input=workCommand();await runWorkCommand(f.runtime,p,input);
   const db=await f.admin.connect();try{
    await db.query("BEGIN");await db.query(`UPDATE app.membership SET ${field}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2`,[p.auth.context.tenantId,p.auth.membershipId]);
    await db.query("SELECT set_config('app.tenant_id',$1,true)",[p.auth.context.tenantId]);await db.query("SET LOCAL ROLE jobguard_runtime");
    const {commandOn}=await import("./job-work-state-command-fixtures.js");await expect(commandOn(db,p,input)).rejects.toThrow("WORK_STATE_FORBIDDEN");
   }finally{await db.query("ROLLBACK");db.release()}
  }
 });
 it("every non-owner membership role refused, including admin and finance",async()=>{
  const p=await seedWorkPractice(f),roles=(await f.admin.query("SELECT DISTINCT role FROM app.membership WHERE role<>'owner'")).rows.map(r=>r.role as string);
  for(const role of new Set(["admin","finance","operative","supervisor","surveyor","commercial_manager","read_only","client_approver","worker",...roles])){
   const db=await f.admin.connect();try{
    await db.query("BEGIN");await db.query("UPDATE app.membership SET role=$1 WHERE tenant_id=$2 AND id=$3",[role,p.auth.context.tenantId,p.auth.membershipId]);
    await db.query("SELECT set_config('app.tenant_id',$1,true)",[p.auth.context.tenantId]);await db.query("SET LOCAL ROLE jobguard_runtime");
    const {commandOn}=await import("./job-work-state-command-fixtures.js");await expect(commandOn(db,p,workCommand())).rejects.toThrow("WORK_STATE_FORBIDDEN");
   }finally{await db.query("ROLLBACK");db.release()}
  }
 });
});
