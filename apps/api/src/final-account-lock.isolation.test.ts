import { afterEach,expect,it,vi } from "vitest";
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
