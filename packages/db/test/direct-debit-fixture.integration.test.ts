import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { workTenant } from "./job-work-state-fixtures.js";
import { DirectDebitFixtureRepository } from "../src/direct-debit-fixture-repository.js";
const labels = {environment:"synthetic_demo",account:"fake_jobguard_dd"};
describe("M4-15 durable synthetic Direct Debit facts",()=>{
 let c:Cluster;
 beforeAll(async()=>{c=await cluster();},240000);
 afterAll(async()=>{await c?.close();});
 async function fixture(){
  const company=await meterCompany(c as unknown as WorkFixture);
  const binding={version:"direct-debit-binding.v1",...labels,mandateId:randomUUID()};
  const event={version:"fake-dd-mandate-event.v1",...labels,tenantId:company.tenantId,mandateId:binding.mandateId,eventId:randomUUID(),state:"created"};
  const repo=new DirectDebitFixtureRepository(c.runtime);
  await repo.recordMandate(company.context,binding,event,null);
  return {...company,binding,event,repo};
 }
 type Fixture=Awaited<ReturnType<typeof fixture>>;
 const event=(f:Fixture,state:string)=>({...f.event,eventId:randomUUID(),state});
 const freshPool=()=>new Pool({...c.config,database:"jobguard_synthetic_demo",user:"ent4b_login",max:2});
 async function payment(f:Fixture){
  const binding={...f.binding,commandId:randomUUID(),objectId:`fake_dd_${"a".repeat(64)}`,amountPence:100};
  const e={version:"fake-dd-event.v1",...labels,tenantId:f.tenantId,eventId:randomUUID(),commandId:binding.commandId,objectId:binding.objectId,amountPence:100,kind:"collection",state:"pending_submission"};
  await f.repo.recordPaymentEvent(f.context,binding,e,(await f.repo.read(f.context,f.binding)).head);
  return {binding,e};
 }
 it.each(["cancelled","failed","expired"])("keeps terminal %s across fresh pools and delayed setup/activation replays",async state=>{
  const f=await fixture(),terminal=event(f,state);
  await f.repo.recordMandate(f.context,f.binding,terminal,f.event.eventId);
  const pool=freshPool();try{
   const repo=new DirectDebitFixtureRepository(pool);
   await repo.recordMandate(f.context,f.binding,event(f,"active"),terminal.eventId);
   await repo.recordMandate(f.context,f.binding,f.event,null);
   expect(await repo.read(f.context,f.binding)).toMatchObject({...labels,mandateState:state,blocksNewSubmission:true});
  }finally{await pool.end();}
 });
 it("deduplicates across a new pool and an independent node process and rejects changed content",async()=>{
  const f=await fixture(),pool=freshPool();
  try{await new DirectDebitFixtureRepository(pool).recordMandate(f.context,f.binding,f.event,null);}finally{await pool.end();}
  const script=`import pg from 'pg'; const v=JSON.parse(process.env.DD_FIXTURE); const p=new pg.Pool(v.config); try { const c=await p.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.tenant_id',$1,true)",[v.tenant]); await c.query('SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid)',[v.tenant,'mandate',JSON.stringify(v.binding),JSON.stringify(v.event),null]); await c.query('COMMIT'); } finally { c.release(); } } finally { await p.end(); }`;
  await promisify(execFile)(process.execPath,["--input-type=module","-e",script],{cwd:new URL("../",import.meta.url),env:{...process.env,DD_FIXTURE:JSON.stringify({config:{...c.config,database:"jobguard_synthetic_demo",user:"ent4b_login"},tenant:f.tenantId,binding:f.binding,event:f.event})}});
  expect((await f.repo.read(f.context,f.binding)).history).toHaveLength(1);
  await expect(f.repo.recordMandate(f.context,f.binding,{...f.event,state:"active"},null)).rejects.toThrow("DD_CONFLICT");
 });
 it("serializes two events from one previous state; the loser leaves no fact",async()=>{
  const f=await fixture(),pool=freshPool();try{
   const result=await Promise.allSettled([f.repo.recordMandate(f.context,f.binding,event(f,"pending_submission"),f.event.eventId),
    new DirectDebitFixtureRepository(pool).recordMandate(f.context,f.binding,event(f,"active"),f.event.eventId)]);
   expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
   expect(result.filter(r=>r.status==="rejected").map(r=>r.reason.message)).toEqual(["DD_CONFLICT"]);
   expect((await f.repo.read(f.context,f.binding)).history).toHaveLength(2);
  }finally{await pool.end();}
 });
 it("processes a mixed batch independently and never stores the bad member",async()=>{
  const f=await fixture();let head=f.event.eventId;
  const results=[];
  for(const e of [event(f,"pending_submission"),{...event(f,"active"),account:"foreign"},event(f,"active")]){
   try{await f.repo.recordMandate(f.context,f.binding,e,head);head=e.eventId;results.push("processed");}catch{results.push("rejected");}
  }
  expect(results).toEqual(["processed","rejected","processed"]);
  const read=await f.repo.read(f.context,f.binding);expect(read.history).toHaveLength(3);expect(read.blocksNewSubmission).toBe(false);
 });
 it("projects every payment state from stored history only, including late failures and chargebacks",async()=>{
  for(const terminal of ["failed","cancelled","charged_back","late_failure"]){
   const f=await fixture(),p=await payment(f);let head=p.e.eventId;
   for(const [state,expected] of [["submitted","submitted"],["confirmed","confirmed"],["paid_out","paid_out"],[terminal,terminal],["submitted",terminal]] as const){
    const e={...p.e,state,eventId:randomUUID()};
    const before=await f.repo.read(f.context,f.binding);
    if(state==="paid_out")expect(before.payments[0]?.state).toBe("confirmed");
    await f.repo.recordPaymentEvent(f.context,p.binding,e,head);head=e.eventId;
    const read=await f.repo.read(f.context,f.binding);
    expect(read.payments[0]?.state).toBe(expected);
   }
   const pool=freshPool();try{
    const read=await new DirectDebitFixtureRepository(pool).read(f.context,f.binding);
    expect(read.payments[0]?.state).toBe(terminal);expect(read.payments[0]?.history).toHaveLength(6);
    await new DirectDebitFixtureRepository(pool).recordPaymentEvent(f.context,p.binding,p.e,null);
    expect((await f.repo.read(f.context,f.binding)).payments[0]?.history).toHaveLength(6);
   }finally{await pool.end();}
  }
 });
 it("returns identical not-found for foreign tenant, swapped mandate, command, object or amount",async()=>{
  const a=await fixture(),b=await fixture(),p=await payment(a);
  await expect(b.repo.read(b.context,a.binding)).rejects.toThrow("DD_NOT_FOUND");
  await expect(a.repo.recordMandate(a.context,b.binding,a.event,null)).rejects.toThrow("DD_NOT_FOUND");
  for(const binding of [{...p.binding,mandateId:b.binding.mandateId},{...p.binding,objectId:`fake_dd_${"b".repeat(64)}`},{...p.binding,commandId:randomUUID()},{...p.binding,amountPence:101}]){
   const e={...p.e,eventId:randomUUID(),objectId:binding.objectId,commandId:binding.commandId,amountPence:binding.amountPence};
   await expect(a.repo.recordPaymentEvent(a.context,binding,e,p.e.eventId)).rejects.toThrow("DD_NOT_FOUND");
  }
  await expect(workTenant(c.runtime,b.tenantId,db=>db.query("SELECT app.direct_debit_fixture($1,'read',$2::jsonb,'{}',NULL)",[a.tenantId,JSON.stringify(a.binding)]))).rejects.toThrow("DD_NOT_FOUND");
 });
 it("refuses update/delete/truncate and direct runtime inserts; rows and hashes remain unchanged",async()=>{
  const f=await fixture();await payment(f);
  for(const table of ["direct_debit_mandate_fact","direct_debit_payment_fact"]){
   const before=(await c.admin.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`,[f.tenantId])).rows;
   expect(before).toHaveLength(1);
   expect((await c.admin.query(`SELECT fact_hash=app.final_lock_hash(jsonb_build_object('binding',binding,'event',event)) valid FROM app.${table} WHERE tenant_id=$1`,[f.tenantId])).rows[0].valid).toBe(true);
   for(const sql of [`UPDATE app.${table} SET fact_hash=repeat('b',64) WHERE tenant_id=$1`,`DELETE FROM app.${table} WHERE tenant_id=$1`]) await expect(c.admin.query(sql,[f.tenantId])).rejects.toThrow();
   await expect(c.admin.query(`TRUNCATE app.${table} CASCADE`)).rejects.toThrow();
   await expect(workTenant(c.runtime,f.tenantId,db=>db.query(`INSERT INTO app.${table} SELECT * FROM app.${table}`))).rejects.toMatchObject({code:"42501"});
   expect((await c.admin.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`,[f.tenantId])).rows).toEqual(before);
   expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
   // Exercise the SECURITY DEFINER owner's FORCE-RLS policy, not superuser bypass.
   expect(await workTenant(c.admin,f.tenantId,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return (await db.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id<>$1`,[f.tenantId])).rows[0].n;})).toBe(0);
  }
 });
 it("rejects caller authority/enablement at direct SQL too and keeps app context unchanged",async()=>{
  const f=await fixture();
  for(const extra of [{actor:randomUUID()},{productionEnabled:true}]){
   await expect(workTenant(c.runtime,f.tenantId,db=>db.query("SELECT app.direct_debit_fixture($1,'mandate',$2::jsonb,$3::jsonb,$4)",[f.tenantId,JSON.stringify(f.binding),JSON.stringify({...event(f,"active"),...extra}),f.event.eventId]))).rejects.toThrow("DD_INVALID_INPUT");
  }
  await workTenant(c.runtime,f.tenantId,async db=>{
   await db.query("SELECT set_config('app.fixture_marker','caller',true)");
   await db.query("SELECT app.direct_debit_fixture($1,'read',$2::jsonb,'{}',NULL)",[f.tenantId,JSON.stringify(f.binding)]);
   expect((await db.query("SELECT current_setting('app.tenant_id') tenant,current_setting('app.fixture_marker') marker")).rows[0]).toEqual({tenant:f.tenantId,marker:"caller"});
  });
 });
});
