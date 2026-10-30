// CI ONLY: synthetic real-writer upgrade and adversarial storage/producer tests.
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {afterAll,beforeAll,expect,it} from "vitest";
import {migrate,MIGRATION_URLS} from "../src/migrate.js";
import {createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {proofBefore,proofDifferences,rolledBack} from "./upgrade-proof-utils.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";

let f:FinalCheckFixture;
const environment=process.env.JOBGUARD_ENV;
const target="0407_receipt_movement_job_fk.sql";
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{
 await closeFinalCheckFixture(f);
 if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;
});
it("0407 preserves populated F5/F7 and validates both movement FKs",async()=>{
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
  WHERE conrelid='app.receipt_allocation_fact_source'::regclass AND confrelid='app.practice_feed_event'::regclass ORDER BY conname`)).rows;
 expect(constraints).toEqual([{conname:"receipt_allocation_fact_source_tenant_id_movement_id_fkey",convalidated:true,
  definition:"FOREIGN KEY (tenant_id, movement_id) REFERENCES app.practice_feed_event(tenant_id, id)"}, {conname:"receipt_fact_source_job_movement_fk",convalidated:true,
  definition:"FOREIGN KEY (tenant_id, job_id, movement_id) REFERENCES app.practice_feed_event(tenant_id, job_id, id)"}]);
 for(const x of [a,b]) {
  const approval={version:"receipt-line-facts-command.v1",action:"approve",commandId:x.produced.commandId,
   reviewId:x.produced.reviewId,approvalHash:x.produced.approvalHash,expectedSourceRevision:x.produced.sourceRevision};
  expect(await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,approval)).toEqual({...x.produced,replayed:true});
 }
 const normal=await realReceiptFixture(f,"F7",undefined,undefined,"receipt-line-allocation-command.v1");
 expect(normal.fact.gross).toEqual({numerator:"96000",denominator:"1"});
 expect(normal.fact.net).toEqual({numerator:"80000",denominator:"1"});
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1",[target])).rows).toEqual([{n:1}]);
},120000);

it("direct INSERT refuses another job's movement in the same tenant, even with the tenant FK intact",async()=>{
 const a=await realReceiptFixture(f,"F7"),b=await realReceiptFixture(f,"F7");
 expect(a.context.tenantId).toBe(b.context.tenantId);expect(a.jobId).not.toBe(b.jobId);
 await rolledBack(f.admin,async db=>{
  // Allow a second source for the existing revision only inside this rolled-back
  // fixture, so uniqueness cannot mask the FK attack. Keep all triggers active.
  await db.query("ALTER TABLE app.receipt_allocation_fact_source DROP CONSTRAINT receipt_allocation_fact_sourc_tenant_id_allocation_revision_key");
  const insert=()=>db.query(`INSERT INTO app.receipt_allocation_fact_source
   SELECT (jsonb_populate_record(NULL::app.receipt_allocation_fact_source,
    to_jsonb(s)||jsonb_build_object('id',$1::uuid,'movement_id',$2::uuid))).*
   FROM app.receipt_allocation_fact_source s WHERE tenant_id=$3 AND job_id=$4 AND payment_id=$5`,
   [randomUUID(),b.fact.movementId,a.context.tenantId,a.jobId,a.paymentId]);
  await db.query("SAVEPOINT wrong_movement");
  await expect(insert()).rejects.toMatchObject({code:"23503",constraint:"receipt_fact_source_job_movement_fk"});
  await db.query("ROLLBACK TO SAVEPOINT wrong_movement");
  await db.query("ALTER TABLE app.receipt_allocation_fact_source DROP CONSTRAINT receipt_fact_source_job_movement_fk");
  expect((await insert()).rowCount).toBe(1); // tenant FK alone accepts this attack
 });
});

it("latest producer cannot persist a cross-job movement supplied by its proposal",async()=>{
 const x=await realReceiptFixture(f,"F7",undefined,undefined,"receipt-line-allocation-command.v1");
 const other=await realReceiptFixture(f,"F7");
 expect(x.context.tenantId).toBe(other.context.tenantId);
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,
  actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 const reversal=(await f.admin.query("SELECT id FROM app.customer_payment_reversal WHERE tenant_id=$1 AND payment_id=$2",[x.context.tenantId,x.paymentId])).rows[0].id as string;
 const current=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
 await rolledBack(f.admin,async db=>{
  await db.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.receipt_line_environment','synthetic_demo',true)",[x.context.tenantId]);
  // Fault injection uses the installed latest definition, never a stale copied
  // producer. Only the proposal's movement ID changes; rollback restores it.
  const definition=(await db.query("SELECT pg_get_functiondef('app.receipt_fact_proposal(uuid,uuid,jsonb)'::regprocedure) definition")).rows[0].definition as string;
  const original="'movement',to_jsonb(movement)";
  expect(definition.split(original)).toHaveLength(2);
  await db.query(definition.replace(original,`'movement',jsonb_set(to_jsonb(movement),'{id}',to_jsonb('${other.fact.movementId}'::uuid))`));
  const execute=async(p:unknown)=>(await db.query("SELECT app.write_receipt_allocation_facts($1,$2,$3,$4,NULL) result",[x.context.tenantId,x.jobId,x.auth.digest,p])).rows[0].result;
  const review=await execute({version:"receipt-line-allocation-command.v1",action:"review_reverse",commandId:randomUUID(),
   expectedSourceRevision:current.revision,allocationRevisionId:x.produced.allocationRevisionId,
   reversalSource:{kind:"payment_reversal",sourceId:reversal},grossPence:96000});
  const approval={version:"receipt-line-allocation-command.v1",action:"reverse",commandId:randomUUID(),
   expectedSourceRevision:review.sourceRevision,reviewId:review.reviewId,approvalHash:review.approvalHash};
  await db.query("SAVEPOINT producer_attack");
  await expect(execute(approval)).rejects.toMatchObject({code:"23503",constraint:"receipt_fact_source_job_movement_fk"});
  await db.query("ROLLBACK TO SAVEPOINT producer_attack");
  expect((await db.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_command WHERE tenant_id=$1 AND command_id=$2",[x.context.tenantId,approval.commandId])).rows).toEqual([{n:0}]);
  await db.query("ALTER TABLE app.receipt_allocation_fact_source DROP CONSTRAINT receipt_fact_source_job_movement_fk");
  expect(await execute(approval)).toMatchObject({action:"reverse",replayed:false});
 });
});
