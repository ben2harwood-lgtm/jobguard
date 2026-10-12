import { afterEach,afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import type { Pool } from "pg";
import { DEMO_IDENTITY_USER_ID,DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,practiceOwnedJobsSql } from "@jobguard/db";
import { FinalAccountLockApplication } from "./final-account-lock.application.js";
const session="18000000-0000-4000-8000-000000000001",job="18000000-0000-4000-8000-000000000002";
/** Scripted adapter isolation proof; real PostgreSQL signal/evidence proof lives in the DB integration test. */
function database(signalCount:number,locked:boolean){
 const heldSignals=Array.from({length:signalCount},(_,id)=>({id,state:"held_for_final_check",evidenceId:id}));
 const statements:string[]=[];
 const query=async(sql:string)=>{
  statements.push(sql);
  if(/shadow_(?:commercial_signal|signal_|reconciliation_run)/u.test(sql))throw new Error(`unexpected hidden read ${heldSignals.length}`);
  if(sql.includes("authenticate_practice_session"))return {rows:[{tenant_id:DEMO_TENANT_ID,membership_id:DEMO_MEMBERSHIP_ID,identity_user_id:DEMO_IDENTITY_USER_ID}]};
  if(sql.startsWith(practiceOwnedJobsSql()))return {rows:[{id:job}]};
  if(sql.includes("terms_accepted"))return {rows:[{lock:locked?{id:job,tenant_id:DEMO_TENANT_ID,job_id:job,final_account_revision_id:job,baseline_quote_version_id:job,capture_register_hash:"a".repeat(64),line_set_hash:"a".repeat(64),scope_disposition_hash:"a".repeat(64),snapshot_digest:"a".repeat(64),locked_source_hash:"a".repeat(64),locked_at_text:"2026-10-12T12:00:00.000001Z",command_id:job,audit_event_id:job,snapshot:{}}:null,terms_accepted:true,dispositions:[],check:null}]};
  return {rows:[]};
 };
 return {pool:{query,connect:async()=>({query,release:()=>undefined})} as unknown as Pool,statements};
}
afterEach(()=>vi.unstubAllEnvs());
it.each([false,true])("DW8 application read is byte-identical with zero and 25 private signals (locked %s)",async locked=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");const zero=database(0,locked),many=database(25,locked);
 const a=await new FinalAccountLockApplication(zero.pool,session).get(job),b=await new FinalAccountLockApplication(many.pool,session).get(job);
 expect(JSON.stringify(a)).toBe(JSON.stringify(b));expect(zero.statements).toEqual(many.statements);
 expect(many.statements.some(sql=>/shadow_(commercial_signal|signal_|reconciliation_run)/u.test(sql))).toBe(false);
});


/** Real PostgreSQL proof. This whole file requires the Mac/CI database harness. */
describe("DW8 real database application isolation",()=>{
 let fixture:{zero:Pool;many:Pool;session:string;jobId:string;command:unknown;copyLockedHistory:()=>Promise<void>;close:()=>Promise<void>};
 beforeAll(async()=>{
  // Dynamic path keeps test infrastructure out of the API build's rootDir and public exports.
  const fixturePath="../../../packages/db/test/final-account-lock.integration.test.ts";
  const helpers=await import(fixturePath);
  fixture=await helpers.createApplicationIsolationFixture();
 },60000);
 afterAll(async()=>{await fixture?.close()});
 it("identical seeded databases with zero/25 evidence-linked held signals have identical review, lock replay and post-lock bytes; runtime statements never name shadow tables",async()=>{
  vi.stubEnv('JOBGUARD_ENV','synthetic_demo');
  function traced(pool:Pool){
   const statements:string[]=[];
   const wrapped=new Proxy(pool,{get(target,key){
    if(key==='query')return async(sql:string,values?:unknown[])=>{statements.push(sql);return target.query(sql,values)};
    if(key==='connect')return async()=>{
     const client=await target.connect();
     return new Proxy(client,{get(connection,property){
      if(property==='query')return async(sql:string,values?:unknown[])=>{statements.push(sql);return connection.query(sql,values)};
      const value=Reflect.get(connection,property);return typeof value==='function'?value.bind(connection):value;
     }});
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
   }});
   return {app:new FinalAccountLockApplication(wrapped,fixture.session),statements};
  }
  const zero=traced(fixture.zero),many=traced(fixture.many);
  expect(JSON.stringify(await zero.app.get(fixture.jobId))).toBe(JSON.stringify(await many.app.get(fixture.jobId)));
  const first=await zero.app.lock(fixture.jobId,fixture.command);
  // Copy server-generated identities/time as the same persisted history; keep all private signals.
  // No normalization of response bytes, and no mocked application/repository/database response.
  await fixture.copyLockedHistory();
  expect(JSON.stringify(await many.app.lock(fixture.jobId,fixture.command))).toBe(JSON.stringify(first));
  expect(JSON.stringify(await zero.app.lock(fixture.jobId,fixture.command))).toBe(JSON.stringify(first));
  expect(JSON.stringify(await zero.app.get(fixture.jobId))).toBe(JSON.stringify(await many.app.get(fixture.jobId)));
  for(const statements of [zero.statements,many.statements])expect(statements.join('\n')).not.toMatch(/shadow_(?:commercial_signal|signal_|reconciliation_run|disclosure_event|break_glass_access)/u);
 });
});
