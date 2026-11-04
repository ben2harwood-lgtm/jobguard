import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async()=>{db=await jobDoorsDatabase(true,"0820_lp13_low_value_batch.sql");},300_000);
afterAll(async()=>{await db?.close();});
it("preserves every five-item overload, owner, ACL, policy and existing number across the LP-12 upgrade",async()=>{
  const p=await jobDoorsActor(db.owner), id=randomUUID();
  await db.owner.query("INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number) VALUES($1,$2,42)",[id,p.tenant]);
  const snapshot=async()=>({
    numbers:(await db.owner.query("SELECT * FROM app.customer_invoice_sequence WHERE tenant_id=$1",[p.tenant])).rows,
    routines:(await db.owner.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,
      pg_get_functiondef(p.oid) definition,p.proowner,p.proacl,p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('app','identity') AND p.proname IN
      ('reserve_customer_invoice_number','transition_scope_progress','record_legacy_builder_origin',
       'sso_audit_append','adopt_in_flight_job','issue_practice_customer_invoice','issue_lock_bound_customer_invoice','begin_command')
      ORDER BY n.nspname,p.proname,args`)).rows,
    relations:(await db.owner.query(`SELECT c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c WHERE c.oid IN ('app.customer_invoice_sequence'::regclass,'app.command_lifecycle_claim'::regclass)
      ORDER BY c.relname`)).rows,
    policies:(await db.owner.query(`SELECT * FROM pg_policies WHERE schemaname='app'
      AND tablename IN ('customer_invoice_sequence','command_lifecycle_claim') ORDER BY tablename,policyname`)).rows,
  });
  const before=await snapshot();
  expect(before.routines.length).toBeGreaterThanOrEqual(8);
  await db.owner.query(await readFile(new URL("../migrations/0820_lp13_low_value_batch.sql",import.meta.url),"utf8"));
  expect(await snapshot()).toEqual(before);
  expect((await db.owner.query(`SELECT
    has_table_privilege('jobguard_runtime','app.customer_invoice_sequence','INSERT') runtime_insert,
    has_any_column_privilege('jobguard_runtime','app.customer_invoice_sequence','UPDATE') runtime_update,
    has_function_privilege('jobguard_runtime','app.reserve_customer_invoice_number(uuid)','EXECUTE') runtime_reserve,
    has_function_privilege('jobguard_runtime','app.issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date)','EXECUTE') checked_invoice,
    has_function_privilege('jobguard_runtime','app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)','EXECUTE') checked_lock_invoice`)).rows)
    .toEqual([{runtime_insert:false,runtime_update:false,runtime_reserve:false,checked_invoice:true,checked_lock_invoice:true}]);
  const c=await db.runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)",[p.tenant,p.member]);
    await expect(c.query("SELECT app.reserve_customer_invoice_number($1)",[p.tenant])).rejects.toMatchObject({code:"42501"});
  } finally { await c.query("ROLLBACK"); c.release(); }
  expect(await snapshot()).toEqual(before);
});
