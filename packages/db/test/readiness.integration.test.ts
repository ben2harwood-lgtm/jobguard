import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import{createHash,randomUUID}from"node:crypto";import{mkdtemp,rm}from"node:fs/promises";import{tmpdir}from"node:os";import{join}from"node:path";import EmbeddedPostgres from"embedded-postgres";import{Pool}from"pg";import{afterAll,beforeAll,describe,expect,it}from"vitest";import{migrate,ReadinessRepository,withTenant}from"../src/index.js";import{closeTestPools, installLegacySyntheticPartyFixtures}from"./pool-test-utils.js";let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;const tenant=randomUUID(),other=randomUUID(),job=randomUUID(),wrongJob=randomUUID(),ctx=testTenantContext(tenant);beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jg-readiness-"));const port=59500+Math.floor(Math.random()*100);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)",[tenant,other]);await importWatchdogFixtureJob(admin,tenant,job);await importWatchdogFixtureJob(admin,tenant,wrongJob);await admin.query("CREATE ROLE readiness_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO readiness_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"readiness_login",password:"synthetic"})},60000);afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});describe("readiness persistence",()=>{it("deduplicates a due review without external or schedule effects",async()=>{const repo=new ReadinessRepository(runtime),initial=await repo.record(ctx,job,{commandId:randomUUID(),scenarioNow:"2026-03-27T09:00:00.000Z"});expect(initial.snapshot?.reasons).toEqual(["A predecessor is not complete","2 units still needed","Crew availability unknown"]);const command=randomUUID();await repo.advance(ctx,job,{commandId:command,scenarioNow:"2026-03-30T08:00:00.000Z"});const replay=await repo.advance(ctx,job,{commandId:command,scenarioNow:"2026-03-30T08:00:00.000Z"});expect(replay).toMatchObject({dueReviewDecisions:1,externalActions:0,scheduleRewrites:0});expect((await repo.record(ctx,job,{commandId:randomUUID(),scenarioNow:"2026-03-27T09:00:00.000Z",resolved:true})).snapshot?.ready).toBe(true)});it("denies mutation, cross-tenant writes, and wrong-job links",async()=>{for(const sql of["UPDATE app.readiness_snapshot SET ready=true","DELETE FROM app.readiness_snapshot"])await expect(withTenant(runtime,ctx,db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.planned_work_revision(id,tenant_id,job_id,command_id,task_key,revision,plan_date,required_units,landed_units,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,'x',1,'2026-01-01',0,0,'x',$3,repeat('a',64),$5)",[randomUUID(),other,job,randomUUID(),randomUUID()]))).rejects.toMatchObject({code:"42501"});const source=(await withTenant(runtime,ctx,db=>db.$client.query("SELECT id,audit_event_id FROM app.readiness_snapshot WHERE job_id=$1 LIMIT 1",[job]))).rows[0];await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.readiness_snapshot(id,tenant_id,job_id,command_id,planned_work_revision_id,revision,rule_revision,source_facts_hash,adapter_revision,adapter_reading_hash,scenario_now,weather_state,ready,reasons,recovery_fee_pence,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,$5,99,'v',repeat('a',64),'v',repeat('b',64),now(),'unknown',false,'[]',0,'x',$3,repeat('c',64),$6)",[randomUUID(),tenant,wrongJob,randomUUID(),source.id,source.audit_event_id]))).rejects.toMatchObject({code:"23503"})})});

describe("readiness command replay returns the first result and is bound to its job",()=>{
 const at="2026-03-30T08:00:00.000Z",on="2026-03-27T09:00:00.000Z";
 // Direct fixture inserts pass the same BEFORE INSERT live guard as the runtime role, so they carry the tenant context.
 const asTenant=async(sql:string,params:unknown[])=>{const client=await admin.connect();try{await client.query("SELECT set_config('app.tenant_id',$1,false)",[tenant]);return await client.query(sql,params)}finally{await client.query("RESET app.tenant_id");client.release()}};
 const counts=async(j:string)=>(await admin.query("SELECT (SELECT count(*)::int FROM app.planned_work_revision WHERE job_id=$1) plans,(SELECT count(*)::int FROM app.readiness_snapshot WHERE job_id=$1) snapshots,(SELECT count(*)::int FROM app.readiness_decision WHERE job_id=$1) decisions",[j])).rows[0];
 it("replays an earlier plan and advance as they first returned, after later plans exist",async()=>{
  const repo=new ReadinessRepository(runtime),j=randomUUID();await importWatchdogFixtureJob(admin,tenant,j);
  const planOne=randomUUID(),first=await repo.record(ctx,j,{commandId:planOne,scenarioNow:on});
  const advanceOne=randomUUID(),advanced=await repo.advance(ctx,j,{commandId:advanceOne,scenarioNow:at});
  const planTwo=randomUUID(),second=await repo.record(ctx,j,{commandId:planTwo,scenarioNow:on,resolved:true});
  expect([first.snapshot?.revision,first.dueReviewDecisions,advanced.snapshot?.revision,advanced.dueReviewDecisions,second.snapshot?.revision,second.dueReviewDecisions]).toEqual([1,0,1,1,2,1]);
  expect(second.snapshot?.ready).toBe(true);
  const before=await counts(j);
  expect(await repo.record(ctx,j,{commandId:planOne,scenarioNow:on})).toEqual(first);
  expect(await repo.advance(ctx,j,{commandId:advanceOne,scenarioNow:at})).toEqual(advanced);
  expect(await repo.record(ctx,j,{commandId:planTwo,scenarioNow:on,resolved:true})).toEqual(second);
  expect(await counts(j)).toEqual(before);expect(before).toEqual({plans:2,snapshots:2,decisions:1});
  await expect(repo.record(ctx,j,{commandId:planOne,scenarioNow:on,resolved:true})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(repo.advance(ctx,j,{commandId:advanceOne,scenarioNow:"2026-03-31T08:00:00.000Z"})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect(await counts(j)).toEqual(before);
 });
 it("refuses a command id that belongs to another job and keeps each job's own replay",async()=>{
  const repo=new ReadinessRepository(runtime),a=randomUUID(),b=randomUUID();await importWatchdogFixtureJob(admin,tenant,a);await importWatchdogFixtureJob(admin,tenant,b);
  const planA=randomUUID(),viewA=await repo.record(ctx,a,{commandId:planA,scenarioNow:on});await repo.record(ctx,b,{commandId:randomUUID(),scenarioNow:on});
  const cmd=randomUUID(),advancedA=await repo.advance(ctx,a,{commandId:cmd,scenarioNow:at});
  const beforeB=await counts(b);
  await expect(repo.advance(ctx,b,{commandId:cmd,scenarioNow:at})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(repo.record(ctx,b,{commandId:planA,scenarioNow:on})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect(await counts(b)).toEqual(beforeB);expect(beforeB.decisions).toBe(0);
  expect(await repo.advance(ctx,a,{commandId:cmd,scenarioNow:at})).toEqual(advancedA);
  expect(await repo.record(ctx,a,{commandId:planA,scenarioNow:on})).toMatchObject({snapshot:{id:viewA.snapshot?.id}});
 });
 it("still replays a decision stored before command results existed, on its own job only",async()=>{
  const repo=new ReadinessRepository(runtime),a=randomUUID(),b=randomUUID();await importWatchdogFixtureJob(admin,tenant,a);await importWatchdogFixtureJob(admin,tenant,b);
  const planned=await repo.record(ctx,a,{commandId:randomUUID(),scenarioNow:on});await repo.record(ctx,b,{commandId:randomUUID(),scenarioNow:on});
  const cmd=randomUUID(),input={commandId:cmd,scenarioNow:at};
  // Fixture: the decision row exactly as the earlier code wrote it (request hash over the input only), with no command-result row.
  await asTenant("INSERT INTO app.readiness_decision(id,tenant_id,job_id,command_id,snapshot_id,revision,decision_kind,rule_revision,source_facts_hash,adapter_reading_hash,due_at,actor_ref,subject_ref,payload_hash,audit_event_id)SELECT $1,tenant_id,job_id,$2,id,1,'due_review',rule_revision,source_facts_hash,adapter_reading_hash,$3,'system:synthetic-scheduler',job_id,$4,audit_event_id FROM app.readiness_snapshot WHERE tenant_id=$5 AND id=$6",[randomUUID(),cmd,at,createHash("sha256").update(JSON.stringify(input)).digest("hex"),tenant,planned.snapshot?.id]);
  const replayed=await repo.advance(ctx,a,input);expect(replayed).toMatchObject({dueReviewDecisions:1,snapshot:{id:planned.snapshot?.id}});
  expect(await repo.advance(ctx,a,input)).toEqual(replayed);
  await expect(repo.advance(ctx,a,{...input,scenarioNow:"2026-03-31T08:00:00.000Z"})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(repo.advance(ctx,b,input)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect((await admin.query("SELECT count(*)::int n FROM app.watchdog_command_result WHERE command_id=$1",[cmd])).rows[0].n).toBe(0);
 });
 it("keeps a successful no-op advance's command identity: replay returns its first result, never a changed payload, another job or a later decision",async()=>{
  const repo=new ReadinessRepository(runtime),a=randomUUID(),b=randomUUID();await importWatchdogFixtureJob(admin,tenant,a);await importWatchdogFixtureJob(admin,tenant,b);
  await repo.record(ctx,a,{commandId:randomUUID(),scenarioNow:on});await repo.record(ctx,b,{commandId:randomUUID(),scenarioNow:on});
  const creating={commandId:randomUUID(),scenarioNow:at},noop={commandId:randomUUID(),scenarioNow:at};
  const created=await repo.advance(ctx,a,creating),noopResult=await repo.advance(ctx,a,noop);
  expect(created.dueReviewDecisions).toBe(1);expect(noopResult).toEqual(created);
  expect((await admin.query("SELECT count(*)::int n FROM app.readiness_decision WHERE job_id=$1",[a])).rows[0].n).toBe(1);
  await expect(repo.advance(ctx,a,{...noop,scenarioNow:"2026-03-31T08:00:00.000Z"})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(repo.advance(ctx,b,noop)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect((await admin.query("SELECT count(*)::int n FROM app.readiness_decision WHERE job_id=$1",[b])).rows[0].n).toBe(0);
  const later=await repo.record(ctx,a,{commandId:randomUUID(),scenarioNow:on,resolved:true});expect(later.snapshot?.revision).toBe(2);
  expect(await repo.advance(ctx,a,noop)).toEqual(noopResult);
  expect(await repo.advance(ctx,a,creating)).toEqual(created);
  expect((await admin.query("SELECT count(*)::int n FROM app.readiness_decision WHERE job_id=$1",[a])).rows[0].n).toBe(1);
  expect((await admin.query("SELECT command_id FROM app.watchdog_command_identity WHERE job_id=$1 AND command_type='readiness.advance' ORDER BY created_at",[a])).rows.map(r=>r.command_id).sort()).toEqual([creating.commandId,noop.commandId].sort());
 });
 it("serialises concurrent duplicates into one stored command, and refuses a concurrent reuse on another job",async()=>{
  const repo=new ReadinessRepository(runtime),a=randomUUID(),b=randomUUID();await importWatchdogFixtureJob(admin,tenant,a);await importWatchdogFixtureJob(admin,tenant,b);
  await repo.record(ctx,a,{commandId:randomUUID(),scenarioNow:on});await repo.record(ctx,b,{commandId:randomUUID(),scenarioNow:on});
  const same={commandId:randomUUID(),scenarioNow:at},results=await Promise.all([1,2,3,4].map(()=>repo.advance(ctx,a,same)));
  for(const result of results)expect(result).toEqual(results[0]);
  expect((await admin.query("SELECT count(*)::int n FROM app.watchdog_command_result WHERE command_id=$1",[same.commandId])).rows[0].n).toBe(1);
  expect((await admin.query("SELECT count(*)::int n FROM app.readiness_decision WHERE job_id=$1",[a])).rows[0].n).toBe(1);
  const shared={commandId:randomUUID(),scenarioNow:at},outcomes=await Promise.allSettled([repo.advance(ctx,a,shared),repo.advance(ctx,b,shared)]);
  expect(outcomes.filter(o=>o.status==="fulfilled")).toHaveLength(1);
  const refused=outcomes.find(o=>o.status==="rejected") as PromiseRejectedResult;expect(String(refused.reason)).toContain("IDEMPOTENCY_CONFLICT");
  expect((await admin.query("SELECT count(*)::int n FROM app.watchdog_command_result WHERE command_id=$1",[shared.commandId])).rows[0].n).toBe(1);
 });
});
