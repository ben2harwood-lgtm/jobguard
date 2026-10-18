import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { closeWorkFixture,createWorkFixture,seedWorkPractice,type WorkFixture } from "./job-work-state-fixtures.js";
import { commandCounts,commandOn,runWorkCommand,waitForJobLock,workCommand } from "./job-work-state-command-fixtures.js";
describe("CH-4-C real database races and rollback",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},120000);afterAll(async()=>closeWorkFixture(f));
 it("revocation while waiting is rechecked before command and replay",async()=>{
  for(const replay of [false,true]){
   const p=await seedWorkPractice(f),input=workCommand();if(replay)await runWorkCommand(f.runtime,p,input);
   const before=await commandCounts(f,p),blocker=await f.admin.connect(),runner=await f.runtime.connect();
   try{
    await blocker.query("BEGIN");await blocker.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[p.auth.context.tenantId,p.jobId]);
    await runner.query("BEGIN");await runner.query("SELECT set_config('app.tenant_id',$1,true)",[p.auth.context.tenantId]);
    const pid=(await runner.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
    const pending=commandOn(runner,p,input).then(value=>({value,error:null}),error=>({value:null,error: error as Error}));
    await waitForJobLock(f,pid);await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[p.auth.digest]);
    await blocker.query("COMMIT");expect((await pending).error?.message).toContain("WORK_STATE_FORBIDDEN");
   }finally{await blocker.query("ROLLBACK");await runner.query("ROLLBACK");blocker.release();runner.release()}
   expect(await commandCounts(f,p)).toEqual(before);
  }
 });
 it("concurrent close serializes expected revision without two closures",async()=>{
  const p=await seedWorkPractice(f),command=()=>workCommand("close",{reason:"other",note:"Fictional closure"});
  const outcomes=await Promise.allSettled([runWorkCommand(f.runtime,p,command()),runWorkCommand(f.runtime,p,command())]);
  expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(outcomes.filter(x=>x.status==="rejected")).toHaveLength(1);
 });
 it("close versus check completion/reveal/invoice use serializes on the job",async()=>{
  for(const operation of ["complete","reveal","invoice"]){
   const p=await seedWorkPractice(f),blocker=await f.runtime.connect(),runner=await f.admin.connect();
   try{
    await blocker.query("BEGIN");await blocker.query("SELECT set_config('app.tenant_id',$1,true)",[p.auth.context.tenantId]);
    await commandOn(blocker,p,workCommand("close",{reason:"other",note:"Fictional close race"}));
    await runner.query("BEGIN");await runner.query("SELECT set_config('app.tenant_id',$1,true)",[p.auth.context.tenantId]);
    const pid=(await runner.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
    const request=operation==="complete" ? runner.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,clock_timestamp(),'completed')",[p.auth.context.tenantId,p.jobId,randomUUID(),randomUUID()])
     : operation==="reveal" ? runner.query("SELECT * FROM app.reveal_shadow_signals($1,$2)",[p.auth.context.tenantId,p.jobId])
     : runner.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,'final','fictional@example.invalid','2026-10-18',$6)",[p.auth.context.tenantId,p.jobId,randomUUID(),p.auth.membershipId,randomUUID(),"a".repeat(64)]);
    const pending=request.then(()=>null,error=>error as Error);await waitForJobLock(f,pid);await blocker.query("COMMIT");expect((await pending)?.message).toContain("JOB_WORK_CLOSED");
   }finally{await blocker.query("ROLLBACK");await runner.query("ROLLBACK");blocker.release();runner.release()}
  }
 });
 it("reopen versus close keeps one current lifecycle transition",async()=>{
  const {practiceWorkJob}=await import("./job-work-state-command-fixtures.js"),{boundaryLock}=await import("./job-work-state-fixtures.js"),p=await seedWorkPractice(f);
  await boundaryLock(f,await practiceWorkJob(f,p));const closed=await runWorkCommand(f.runtime,p,workCommand("close",{reason:"other",note:"Fictional closure"}));
  const results=await Promise.allSettled([
   runWorkCommand(f.runtime,p,workCommand("reopen",{expectedRevision:closed.events.length,closeEventId:closed.events.at(-1)!.id})),
   runWorkCommand(f.runtime,p,workCommand("close",{expectedRevision:closed.events.length,reason:"other",note:"Concurrent closure"})),
  ]);
  expect(results[0].status).toBe("fulfilled");expect(results[1].status).toBe("rejected");
 });
 it("finish versus later activity preserves marker and appends cancellation",async()=>{
  const {practiceWorkJob}=await import("./job-work-state-command-fixtures.js"),{insertPhoto,workTenant}=await import("./job-work-state-fixtures.js"),p=await seedWorkPractice(f),a=await practiceWorkJob(f,p);
  await workTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed') ON CONFLICT DO NOTHING",[a.scopeId,a.tenantId,a.jobId]));
  const blocker=await f.runtime.connect();try{
   await blocker.query("BEGIN");await blocker.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
   const finished=await commandOn(blocker,p,workCommand());
   const time=(await f.admin.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') time`)).rows[0].time as string;
   const activity=insertPhoto(f,a,time);await blocker.query("COMMIT");await activity;
   const events=(await f.admin.query("SELECT id,kind,predecessor_id FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 ORDER BY sequence",[a.tenantId,a.jobId])).rows;
   expect(events[0].id).toBe(finished.events.at(-1)!.id);expect(events.some(e=>e.kind==="finished_cancelled"&&e.predecessor_id===events[0].id)).toBe(true);
  }finally{await blocker.query("ROLLBACK");blocker.release()}
 });
 it("no explicit business lock after audit allocation; real command commits",async()=>{
  const p=await seedWorkPractice(f),body=(await f.admin.query("SELECT pg_get_functiondef('app.ch4_require_command_owner(uuid,uuid,text)'::regprocedure) body")).rows[0].body as string;
  const auditBody=(await f.admin.query("SELECT pg_get_functiondef('app.lock_audit_head()'::regprocedure) body")).rows[0].body as string;
  // Existing lock-order harness owns generalized table locks. Here a command
  // succeeding after the audit allocation exercises its full deferred triggers;
  // source inspection also rejects subsequent explicit business-lock statements.
  const command=(await f.admin.query("SELECT pg_get_functiondef('app.ch4_work_state_command(uuid,uuid,text,jsonb)'::regprocedure) body")).rows[0].body as string;
  expect(body).toBeTruthy();expect(auditBody).toBeTruthy();
  const afterAudit=command.slice(command.indexOf('SET CONSTRAINTS'));
  expect(afterAudit).not.toMatch(/FOR UPDATE|pg_advisory_xact_lock/iu);
  await runWorkCommand(f.runtime,p,workCommand());
 });
 it("second command cannot acquire business locks after this transaction allocated audit",async()=>{
  const p=await seedWorkPractice(f),before=await commandCounts(f,p),db=await f.runtime.connect();try{
   await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[p.auth.context.tenantId]);
   const first=await commandOn(db,p,workCommand());
   await expect(commandOn(db,p,workCommand("close",{expectedRevision:first.events.length,reason:"other",note:"Second action in same transaction"}))).rejects.toThrow("INVALID_WORK_STATE_INPUT");
  }finally{await db.query("ROLLBACK");db.release()}
  expect(await commandCounts(f,p)).toEqual(before);
 });
 it("link cycle race permits only one directed edge",async()=>{
  const {linkPair,runLink,practiceWorkJob}=await import("./job-work-state-command-fixtures.js"),{boundaryLock}=await import("./job-work-state-fixtures.js"),{p,successor,input}=await linkPair(f);
  await boundaryLock(f,await practiceWorkJob(f,{...p,jobId:successor}));
  const reverse={...input,commandId:randomUUID(),successorJobId:p.jobId,predecessorBindingId:input.successorBindingId,successorBindingId:input.predecessorBindingId};
  const results=await Promise.allSettled([runLink(f.runtime,p,input),runLink(f.runtime,p,reverse,successor)]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);const failed=results.find(x=>x.status==="rejected");expect(failed?.status==="rejected" ? String(failed.reason):"").toContain("JOB_LINK_CYCLE");
 });
 it("audit failure rolls back receipt and event together",async()=>{
  const p=await seedWorkPractice(f),before=await commandCounts(f,p);
  await f.admin.query(`CREATE FUNCTION app.ch4c_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type LIKE 'job.work_state.%' THEN RAISE EXCEPTION 'CH4C_AUDIT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER ch4c_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.ch4c_audit_failure()`);
  try{await expect(runWorkCommand(f.runtime,p,workCommand())).rejects.toThrow("CH4C_AUDIT_FAILURE");expect(await commandCounts(f,p)).toEqual(before)}finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER ch4c_audit_failure")}
 });
});
