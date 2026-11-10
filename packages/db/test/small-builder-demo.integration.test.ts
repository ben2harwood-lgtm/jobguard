import { testTenantContext } from "./tenant-context-test-utils.js";
import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { SmallBuilderDemoRepository } from "../src/small-builder-demo-repository.js";
import { migrate } from "../src/migrate.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";

const create = (scenario="core-1000") => ({contractVersion:"small-builder-demo.create.v1",commandId:randomUUID(),scenario});
const reset = () => ({contractVersion:"small-builder-demo.reset.v1",commandId:randomUUID(),expectedRunRevision:1});
const snapshot = () => ({...reset(),contractVersion:"small-builder-demo.report-snapshot.v1"});
describe("DEMO-I PostgreSQL lifecycle and adversaries",()=>{
 let c:Cluster; let repo:SmallBuilderDemoRepository;
 beforeAll(async()=>{c=await cluster();repo=new SmallBuilderDemoRepository(c.runtime);},240000);
 afterAll(async()=>{await c?.close();});
 const company=(tenantId?:string)=>meterCompany(c as unknown as WorkFixture,tenantId);
 type Company=Awaited<ReturnType<typeof company>>;
 const call=(a:Company,op:Parameters<SmallBuilderDemoRepository["execute"]>[2],id:string|null,raw:unknown={})=>repo.execute(testTenantContext(a.tenantId, { membershipId: a.actorId, bindRequest: false }),a.digest,op,id,raw);
 const runId=(value:Awaited<ReturnType<typeof call>>)=>"runId" in value ? value.runId : value.facts.runId;
 it.each(["core-1000","recovery-18800","shadow-30000","meter","trial"])("persists %s refusal and resumes after repository recreation",async scenario=>{
  const a=await company(),cmd=create(scenario),run=await call(a,"create",null,cmd),id=runId(run);
  expect(run).toMatchObject({scenario,status:"blocked",revision:1,reason:expect.any(String)});
  expect(await new SmallBuilderDemoRepository(c.runtime).execute(a.context,a.digest,"read",id,{})).toEqual(run);
  expect(await call(a,"create",null,cmd)).toEqual(run);
  if(scenario==="meter") {
   expect(run).toMatchObject({meterPreview:{tenantId:a.tenantId,runId:id,hypothetical:true}});
   if(!("meterPreview" in run)||!run.meterPreview)throw new Error("Expected meter preview");
   expect(run.meterPreview.profiles.map(p=>p.principalPence)).toEqual([34800,82800,8900,7900,16900,4900,4900,6233,6965,16900]);
   const other=await company();
   await expect(call(other,"read",id)).rejects.toThrow("DEMO_NOT_FOUND");
   const saved=await call(a,"snapshot",id,snapshot());
   expect(saved).not.toHaveProperty("facts.meterPreview");
  } else expect(JSON.stringify(run)).not.toMatch(/pence|settled|completed|hidden|signal/i);
 });
 it("archives once, preserves snapshots, rejects stale writes and replays exactly one successor",async()=>{
  const a=await company(),run=await call(a,"create",null,create()),id=runId(run),snap=snapshot();
  const report=await call(a,"snapshot",id,snap);
  expect(await call(a,"snapshot",id,snap)).toEqual(report);
  const businessBefore=await proofBefore(c.admin,["app.job","app.trial_identity_snapshot","app.trial_identity_key_claim","app.meter_input_event","app.subscription_agreement_revision","app.journal","app.journal_line"]);
  const cmd=reset(),results=await Promise.all([call(a,"reset",id,cmd),call(a,"reset",id,cmd)]);
  expect(results[0]).toEqual(results[1]); expect(results[0]).toMatchObject({status:"archived",revision:2,successorId:expect.any(String)});
  expect(await call(a,"report",id)).toEqual(report);
  expect(await proofDifferences(c.admin,businessBefore)).toEqual({rows:[],types:[]});
  expect((await c.admin.query("SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'small_builder_demo.%' ORDER BY sequence",[a.tenantId])).rows.map(row=>row.event_type)).toEqual(["small_builder_demo.create","small_builder_demo.snapshot","small_builder_demo.reset"]);
 await assertLp4SealedEvents(c.admin, a.tenantId, "small_builder_demo.reset");
  const successor="successorId" in results[0]! ? results[0].successorId : null;
  expect(await call(a,"read",successor)).toMatchObject({predecessorId:id,status:"blocked",revision:1});
  await expect(call(a,"reset",id,reset())).rejects.toThrow("DEMO_STALE_REVISION");
  await expect(call(a,"snapshot",id,snapshot())).rejects.toThrow("DEMO_STALE_REVISION");
  await expect(call(a,"reset",id,{...reset(),expectedRunRevision:2})).rejects.toThrow("DEMO_ARCHIVED");
  await expect(call(a,"snapshot",id,{...snapshot(),expectedRunRevision:2})).rejects.toThrow("DEMO_ARCHIVED");
  await expect(call(a,"create",null,{...cmd,contractVersion:"small-builder-demo.create.v1",scenario:"trial",expectedRunRevision:undefined})).rejects.toThrow();
  const rows=await c.admin.query("SELECT count(*)::int n FROM app.small_builder_demo_run WHERE tenant_id=$1",[a.tenantId]);expect(rows.rows[0].n).toBe(2);
 });
 it("resumes after a fresh sign-in and replays create, snapshot and reset without duplicate effects",async()=>{
  const a=await company(),cmd=create(),run=await call(a,"create",null,cmd),id=runId(run),snap=snapshot();
  const report=await call(a,"snapshot",id,snap);
  const otherDigest=createHash("sha256").update(randomUUID()).digest("hex"),sessionId=randomUUID();
  await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) SELECT $1,user_id,environment,$2,$3,clock_timestamp()+interval '1 hour' FROM identity.session WHERE id=$4",[sessionId,otherDigest,randomUUID(),a.sessionId]);
  await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
  const fresh={...a,digest:otherDigest,sessionId};
  expect(await call(fresh,"read",id)).toEqual(run);
  expect(await call(fresh,"create",null,cmd)).toEqual(run);
  expect(await call(fresh,"snapshot",id,snap)).toEqual(report);
  expect(await call(fresh,"report",id)).toEqual(report);
  await expect(call(fresh,"create",null,{...cmd,scenario:"trial"})).rejects.toThrow("DEMO_COMMAND_CONFLICT");
  const resetCommand=reset(),archived=await call(fresh,"reset",id,resetCommand);
  const thirdDigest=createHash("sha256").update(randomUUID()).digest("hex"),thirdSessionId=randomUUID();
  await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) SELECT $1,user_id,environment,$2,$3,clock_timestamp()+interval '1 hour' FROM identity.session WHERE id=$4",[thirdSessionId,thirdDigest,randomUUID(),sessionId]);
  await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[sessionId]);
  const resumed={...a,digest:thirdDigest,sessionId:thirdSessionId};
  expect(await call(resumed,"reset",id,resetCommand)).toEqual(archived);
  expect(await call(resumed,"read",id)).toEqual(archived);
  expect(await call(resumed,"report",id)).toEqual(report);
  expect(await call(resumed,"snapshot",id,snap)).toEqual(report);
  // Create replays retain their original result; resume reads the current archived revision.
  expect(await call(resumed,"create",null,cmd)).toEqual(run);
  if(!("successorId" in archived) || !archived.successorId)throw new Error("Expected successor");
  expect(await call(resumed,"read",archived.successorId)).toMatchObject({predecessorId:id,status:"blocked",revision:1});
  await expect(call(resumed,"reset",id,reset())).rejects.toThrow("DEMO_STALE_REVISION");
  await expect(call(resumed,"snapshot",id,snapshot())).rejects.toThrow("DEMO_STALE_REVISION");
  await expect(call(resumed,"reset",id,{...reset(),expectedRunRevision:2})).rejects.toThrow("DEMO_ARCHIVED");
  for(const old of [a,fresh]) await expect(call(old,"reset",id,resetCommand)).rejects.toThrow("DEMO_FORBIDDEN");
  expect((await c.admin.query("SELECT count(*)::int n FROM app.small_builder_demo_run WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(2);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.small_builder_demo_receipt WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(3);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.small_builder_demo_report WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'small_builder_demo.%'",[a.tenantId])).rows[0].n).toBe(3);
  await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[thirdSessionId]);
  for(const op of ["read","report","create","reset","snapshot"] as const) await expect(call(resumed,op,op==="create"?null:id,op==="create"?cmd:op==="reset"?resetCommand:op==="snapshot"?snap:{})).rejects.toThrow("DEMO_FORBIDDEN");
 });
 it("refuses another company or another user in the same company before replay or report reads",async()=>{
  const a=await company(),b=await company(),otherUser=await company(a.tenantId),cmd=create(),run=await call(a,"create",null,cmd),id=runId(run);
  const snap=snapshot(),report=await call(a,"snapshot",id,snap),resetCommand=reset();
  const archived=await call(a,"reset",id,resetCommand);
  if(!("snapshotId" in report) || !("successorId" in archived) || !archived.successorId)throw new Error("Expected report and successor");
  for(const foreign of [b,otherUser]){
   for(const target of [id,archived.successorId]){
    for(const op of ["read","report","reset","snapshot"] as const) await expect(call(foreign,op,target,op==="reset"?resetCommand:op==="snapshot"?snap:op==="report"?{snapshotId:report.snapshotId}:{})).rejects.toThrow("DEMO_NOT_FOUND");
   }
  }
  await expect(call(otherUser,"create",null,cmd)).rejects.toThrow("DEMO_COMMAND_CONFLICT");
  // Command IDs are company-scoped: another company gets its own run, never the saved result.
  const foreignRun=await call(b,"create",null,cmd);expect(runId(foreignRun)).not.toBe(id);
  await expect(repo.execute(testTenantContext(b.tenantId, { membershipId: b.actorId, bindRequest: false }),a.digest,"read",id,{})).rejects.toThrow("DEMO_FORBIDDEN");
  // Even the owning user with valid membership in another company cannot cross the tenant key.
  const user=(await c.admin.query("SELECT user_id FROM identity.session WHERE id=$1",[a.sessionId])).rows[0].user_id;
  const membership=randomUUID();
  await c.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) SELECT $1,tenant_id,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id=$4",[membership,user,b.tenantId,b.actorId]);
  await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)",[user,b.tenantId,membership]);
  for(const op of ["read","report","reset","snapshot"] as const) await expect(repo.execute(testTenantContext(b.tenantId, { membershipId: membership, bindRequest: false }),a.digest,op,id,op==="reset"?resetCommand:op==="snapshot"?snap:op==="report"?{snapshotId:report.snapshotId}:{})).rejects.toThrow("DEMO_NOT_FOUND");
  await expect(call(a,"report",randomUUID())).rejects.toThrow("DEMO_NOT_FOUND");
  await expect(call(a,"report",id,{snapshotId:randomUUID()})).rejects.toThrow("DEMO_NOT_FOUND");
 });
 it("changed command payload conflicts and revoked sessions cannot replay, reset or read",async()=>{
  const a=await company(),cmd=create(),run=await call(a,"create",null,cmd),id=runId(run);
  await expect(call(a,"create",null,{...cmd,scenario:"trial"})).rejects.toThrow("DEMO_COMMAND_CONFLICT");
  await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
  for(const op of ["read","report","create","reset"] as const) await expect(call(a,op,op==="create"?null:id,op==="create"?cmd:op==="reset"?reset():{})).rejects.toThrow("DEMO_FORBIDDEN");
 });
 it("distinct concurrent resets create one successor; old-run report IDs cannot cross runs",async()=>{
  const a=await company(),id=runId(await call(a,"create",null,create()));
  const outcomes=await Promise.allSettled([call(a,"reset",id,reset()),call(a,"reset",id,reset())]);
  expect(outcomes.filter(outcome=>outcome.status==="fulfilled")).toHaveLength(1);
  expect(outcomes.filter(outcome=>outcome.status==="rejected")).toHaveLength(1);
  const b=runId(await call(a,"create",null,create()));
  const report=await call(a,"snapshot",b,snapshot());
  if(!("snapshotId" in report))throw new Error("Expected report");
  await expect(call(a,"report",id,{snapshotId:report.snapshotId})).rejects.toThrow("DEMO_NOT_FOUND");
 });
 it("serializes session revocation behind an authorized lifecycle waiter and refuses subsequent work without duplicate effects",async()=>{
  const a=await company(),lock=await c.admin.connect(),revoker=await c.admin.connect(),cmd=create();
  const snapshotEffects=async()=>({
   runs:(await c.admin.query("SELECT to_jsonb(r) row FROM app.small_builder_demo_run r WHERE tenant_id=$1 ORDER BY id",[a.tenantId])).rows,
   receipts:(await c.admin.query("SELECT to_jsonb(r) row FROM app.small_builder_demo_receipt r WHERE tenant_id=$1 ORDER BY command_id",[a.tenantId])).rows,
   reports:(await c.admin.query("SELECT to_jsonb(r) row FROM app.small_builder_demo_report r WHERE tenant_id=$1 ORDER BY id",[a.tenantId])).rows,
   audits:(await c.admin.query("SELECT to_jsonb(r) row FROM app.audit_event r WHERE tenant_id=$1 ORDER BY sequence",[a.tenantId])).rows,
  });
  let pending:Promise<Awaited<ReturnType<typeof call>>>|undefined,revocation:Promise<unknown>|undefined;
  let lifecycleReleased=false;
  const releaseLifecycle=async()=>{
   if(lifecycleReleased)return;
   try{await lock.query("ROLLBACK");}finally{lifecycleReleased=true;lock.release();}
  };
  try {
  const before=await snapshotEffects();expect(before.runs).toEqual([]);expect(before.receipts).toEqual([]);expect(before.reports).toEqual([]);
  await lock.query("BEGIN");await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,313))",[a.tenantId]);
  const lockPid=(await lock.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
  const revokerPid=(await revoker.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
  let created=false,revoked=false,requestPid:number|undefined;
  pending=call(a,"create",null,cmd).then(result=>{created=true;return result;});
  void pending.catch(()=>undefined);
  try {
   for(let i=0;i<100;i++){
    requestPid=(await c.admin.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND NOT granted AND $1=ANY(pg_blocking_pids(pid))",[lockPid])).rows[0]?.pid as number|undefined;
    if(requestPid)break;
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(requestPid).toBeTypeOf("number");expect(created).toBe(false);
   // The real request is already waiting on its lifecycle lock. LP6c keeps its
   // credential SHARE lock until commit, so actual revocation must serialize behind it.
   revocation=revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]).then(result=>{revoked=true;return result;});
   void revocation.catch(()=>undefined);
   let authorityWait=false;
   for(let i=0;i<100;i++){
    authorityWait=(await c.admin.query("SELECT $1=ANY(pg_blocking_pids($2)) blocked",[requestPid,revokerPid])).rows[0].blocked;
    if(authorityWait)break;
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(authorityWait).toBe(true);expect(revoked).toBe(false);expect(created).toBe(false);
   expect((await c.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND relation='identity.session'::regclass AND mode='RowShareLock' AND granted) held",[requestPid])).rows[0].held).toBe(true);
   expect(await snapshotEffects()).toEqual(before);
  }finally{await releaseLifecycle();}
  const run=await pending;await revocation;
  expect(created).toBe(true);expect(revoked).toBe(true);
  expect(run).toMatchObject({status:"blocked",revision:1,scenario:"core-1000"});
  const id=runId(run),after=await snapshotEffects();
  expect(after.runs).toHaveLength(1);expect(after.receipts).toHaveLength(1);expect(after.reports).toEqual([]);
  expect(after.runs[0]!.row).toMatchObject({id,revision:1,owner_membership_id:a.actorId});
  expect(after.receipts[0]!.row).toMatchObject({command_id:cmd.commandId,run_id:id,result:run});
  expect(after.audits).toHaveLength(before.audits.length+1);
  expect(after.audits.slice(0,before.audits.length)).toEqual(before.audits);
  expect(after.audits.slice(before.audits.length).map(row=>row.row.event_type)).toEqual(["small_builder_demo.create"]);
  expect((await c.admin.query("SELECT revoked_at IS NOT NULL revoked FROM identity.session WHERE id=$1",[a.sessionId])).rows[0].revoked).toBe(true);
  for(const op of ["create","read","report","reset","snapshot"] as const)
   await expect(call(a,op,op==="create"?null:id,op==="create"?cmd:op==="reset"?reset():op==="snapshot"?snapshot():{})).rejects.toThrow("DEMO_FORBIDDEN");
  expect(await snapshotEffects()).toEqual(after);
  // A fresh sign-in can replay the committed command, returning its exact result
  // without creating another run, receipt, report or audit event.
  const digest=createHash("sha256").update(randomUUID()).digest("hex"),sessionId=randomUUID();
  await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) SELECT $1,user_id,environment,$2,$3,clock_timestamp()+interval '1 hour' FROM identity.session WHERE id=$4",[sessionId,digest,randomUUID(),a.sessionId]);
  expect(await call({...a,digest,sessionId},"create",null,cmd)).toEqual(run);
  expect(await snapshotEffects()).toEqual(after);
  }finally{
   try{await releaseLifecycle();}finally{
    try{await Promise.allSettled([pending,revocation]);}finally{revoker.release();}
   }
  }
 });
 it("runtime cannot query or mutate tables; RLS is forced; pooled missing context fails closed",async()=>{
  const a=await company();
  for(const name of ["run","receipt","report"]){
   const table=`app.small_builder_demo_${name}`;
   expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed FROM pg_class WHERE oid=$1::regclass",[table])).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true,allowed:false});
   await expect(workTenant(c.runtime,a.tenantId,db=>db.query(`SELECT * FROM ${table}`), { membershipId: a.actorId })).rejects.toMatchObject({code:"42501"});
  }
  await expect(c.runtime.query("SELECT app.small_builder_demo($1,$2,'create',NULL,$3::jsonb)",[a.tenantId,a.digest,JSON.stringify(create())])).rejects.toThrow();
  expect((await c.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();
 });
 it("SQL rejects injected business facts and keeps report history immutable",async()=>{
  const a=await company(),run=await call(a,"create",null,create()),id=runId(run);
  for(const extra of [{tenantId:a.tenantId},{facts:[]},{completed:true},{releaseTrialKey:true}]) await expect(workTenant(c.runtime,a.tenantId,db=>db.query("SELECT app.small_builder_demo($1,$2,'reset',$3,$4::jsonb)",[a.tenantId,a.digest,id,JSON.stringify({...reset(),...extra})]), { membershipId: a.actorId, bindRequest: false })).rejects.toThrow("INVALID_DEMO_INPUT");
  await call(a,"snapshot",id,snapshot());
  await expect(c.admin.query("UPDATE app.small_builder_demo_report SET facts='{}' WHERE tenant_id=$1",[a.tenantId])).rejects.toThrow("DEMO_IMMUTABLE");
  const before=(await c.admin.query("SELECT to_jsonb(r) v FROM app.small_builder_demo_report r WHERE tenant_id=$1",[a.tenantId])).rows;
  await migrate(c.admin);await migrate(c.admin);
  expect((await c.admin.query("SELECT to_jsonb(r) v FROM app.small_builder_demo_report r WHERE tenant_id=$1",[a.tenantId])).rows).toEqual(before);
  expect(await readFile(new URL('../migrations/0313_small_builder_demo_runs.sql',import.meta.url),'utf8')).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) app\.(?:job|shadow_|trial_|subscription_|ledger_)/i);
 });
});
