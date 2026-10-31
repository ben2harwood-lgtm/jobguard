import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async()=>{db=await jobDoorsDatabase(true,"0534_lp13_low_value_batch.sql");},300_000);
afterAll(async()=>{await db?.close();});
it("upgrades the supported predecessor without resetting an existing invoice sequence or broadening runtime writes",async()=>{
  const p=await jobDoorsActor(db.owner), id=randomUUID();
  await db.owner.query("INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number) VALUES($1,$2,42)",[id,p.tenant]);
  const before=(await db.owner.query("SELECT * FROM app.customer_invoice_sequence WHERE tenant_id=$1",[p.tenant])).rows;
  const legacy=(await db.owner.query(`SELECT pg_get_functiondef('app.record_legacy_builder_origin()'::regprocedure) origin,
    pg_get_functiondef('identity.sso_audit_append(uuid,jsonb)'::regprocedure) sso,
    pg_get_functiondef('app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz)'::regprocedure) adoption`)).rows;
  await db.owner.query(await readFile(new URL("../migrations/0534_lp13_low_value_batch.sql",import.meta.url),"utf8"));
  expect((await db.owner.query("SELECT * FROM app.customer_invoice_sequence WHERE tenant_id=$1",[p.tenant])).rows).toEqual(before);
  expect((await db.owner.query(`SELECT pg_get_functiondef('app.record_legacy_builder_origin()'::regprocedure) origin,
    pg_get_functiondef('identity.sso_audit_append(uuid,jsonb)'::regprocedure) sso,
    pg_get_functiondef('app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz)'::regprocedure) adoption`)).rows).toEqual(legacy);
  expect((await db.owner.query(`SELECT
    has_column_privilege('jobguard_runtime','app.command_lifecycle_claim','reserved_invoice_number','UPDATE') runtime_write,
    has_column_privilege('jobguard_command_writer','app.customer_invoice_sequence','next_number','UPDATE') writer_increment,
    has_column_privilege('jobguard_command_writer','app.customer_invoice_sequence','tenant_id','UPDATE') writer_retenant,
    has_schema_privilege('jobguard_command_writer','app','CREATE') writer_create,
    pg_get_userbyid(proowner)::text owner FROM pg_proc WHERE oid='app.reserve_customer_invoice_number(uuid)'::regprocedure`)).rows).toEqual([
      {runtime_write:false,writer_increment:true,writer_retenant:false,writer_create:false,owner:"jobguard_command_writer"}]);
  const c=await db.runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)",[p.tenant,p.member]);
    await expect(c.query("SELECT app.reserve_customer_invoice_number($1)",[p.tenant])).rejects.toMatchObject({code:"42501",message:"REQUEST_BINDING_REFUSED"});
  } finally { await c.query("ROLLBACK"); c.release(); }
  expect((await db.owner.query("SELECT * FROM app.customer_invoice_sequence WHERE tenant_id=$1",[p.tenant])).rows).toEqual(before);
});
