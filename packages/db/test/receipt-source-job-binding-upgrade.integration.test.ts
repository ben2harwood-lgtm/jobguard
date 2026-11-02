// CI ONLY: populated real-writer F5/F7 upgrade, with a constraint-removal control.
import {readFile} from "node:fs/promises";
import {afterAll,beforeAll,expect,it} from "vitest";
import {migrate,MIGRATION_URLS} from "../src/migrate.js";
import {createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {proofBefore,proofDifferences,rolledBack} from "./upgrade-proof-utils.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";

let f:FinalCheckFixture;
const environment=process.env.JOBGUARD_ENV;
const target="0386_receipt_source_job_binding.sql";
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{
 await closeFinalCheckFixture(f);
 if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;
});
it("#346: populated F5/F7 survive upgrade; SQL refuses a same-tenant movement from another job",async()=>{
 const own=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith(`/${target}`));
 expect(own).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,own)){
  const name=url.pathname.split("/").at(-1)!,sql=await readFile(url,"utf8");
  await f.admin.query(name.startsWith("0095_")?sql.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);"):sql);
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
 }
 // The generated test logins are created before roles exist in this upgrade fixture.
 for(const [pool,role] of [[f.runtime,"jobguard_runtime"],[f.shadow,"jobguard_shadow"]] as const){
  const login=(await pool.query("SELECT current_user AS name")).rows[0].name as string;
  await f.admin.query(`GRANT ${role} TO "${login.replaceAll('"','""')}"`);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const a=await realReceiptFixture(f,"F5"),b=await realReceiptFixture(f,"F7");
 const tables=["receipt_allocation_fact_source","receipt_allocation_fact_line","customer_payment","customer_invoice","final_account_lock"].map(n=>`app.${n}`);
 const before=await proofBefore(f.admin,tables);
 await migrate(f.admin);await migrate(f.admin);
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 const constraints=(await f.admin.query(`SELECT conname,convalidated,pg_get_constraintdef(oid) definition FROM pg_constraint
  WHERE conrelid='app.receipt_allocation_fact_source'::regclass AND confrelid='app.practice_feed_event'::regclass`)).rows;
 expect(constraints).toEqual([{conname:"receipt_fact_source_job_movement_fk",convalidated:true,
  definition:"FOREIGN KEY (tenant_id, job_id, movement_id) REFERENCES app.practice_feed_event(tenant_id, job_id, id)"}]);
 await rolledBack(f.admin,async db=>{
  // Isolate the FK from the independent append-only guard, only in a rolled-back
  // admin test transaction. All FKs, checks and financial triggers stay enabled.
  await db.query("ALTER TABLE app.receipt_allocation_fact_source DISABLE TRIGGER receipt_fact_immutable");
  const update=()=>db.query("UPDATE app.receipt_allocation_fact_source SET movement_id=$1 WHERE tenant_id=$2 AND job_id=$3 AND payment_id=$4",[b.fact.movementId,a.context.tenantId,a.jobId,a.paymentId]);
  await db.query("SAVEPOINT wrong_job");
  await expect(update()).rejects.toMatchObject({code:"23503",constraint:"receipt_fact_source_job_movement_fk"});
  await db.query("ROLLBACK TO SAVEPOINT wrong_job");
  await db.query("ALTER TABLE app.receipt_allocation_fact_source DROP CONSTRAINT receipt_fact_source_job_movement_fk");
  expect((await update()).rowCount).toBe(1); // proves this exact FK rejects the attack
 });
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1",[target])).rows).toEqual([{n:1}]);
},120000);
