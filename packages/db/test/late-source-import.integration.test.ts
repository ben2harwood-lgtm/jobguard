import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";
// CI-only PostgreSQL: upgrade from the exact base, then exercise the new command with real runtime/shadow roles.
import {readFile} from "node:fs/promises";
import {randomUUID,createHash} from "node:crypto";
import {beforeAll,afterAll,expect,it} from "vitest";
import {MIGRATION_URLS,migrate} from "../src/migrate.js";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,finalCheckTenant,type FinalCheckFixture,type FinalCheckJob} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {importLateSource,readLateSourceObservations} from "../src/late-source-import.js";
import {ShadowDetectionRepository} from "../src/shadow-detection-repository.js";
import {detectShadowObservations} from "@jobguard/core";
import {testTenantContext} from "./tenant-context-test-utils.js";
let f:FinalCheckFixture,a:FinalCheckJob,before:unknown;
const own="0541_late_source_import.sql";
const input=()=>({version:"late-source-import.v1",commandId:randomUUID(),fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},text:"Fitted outside tap.",statedSentAt:"2020-01-01T00:00:00Z"});
async function fixedState(){
 const result:Record<string,unknown>={};
 for(const table of ["final_account_lock","job_work_state_event","job_site_source_receipt","subscription_place","subscription_place_binding"])
  result[table]=(await f.admin.query(`SELECT to_jsonb(r) row FROM app.${table} r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`,[a.tenantId])).rows;
 return result;
}
beforeAll(async()=>{
 f=await createFinalCheckFixture(false);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS){
  const name=url.pathname.split("/").at(-1)!;if(name===own)break;
  await f.admin.query(await readFile(url,"utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const runtime=(await f.runtime.query("SELECT session_user name")).rows[0].name;
 const shadow=(await f.shadow.query("SELECT session_user name")).rows[0].name;
 // Generated fixture logins only, not runtime-supplied identifiers.
 await f.admin.query(`GRANT jobguard_runtime TO "${runtime}"`);await f.admin.query(`GRANT jobguard_shadow TO "${shadow}"`);
 a=await seedFinalCheckJob(f);
 await finalCheckTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture') ON CONFLICT DO NOTHING",[a.tenantId,a.jobId]));
 await a.lock();before=await fixedState();await migrate(f.admin);
},120_000);
afterAll(async()=>closeFinalCheckFixture(f));
it("0613 upgrades without changing a locked job, work events or meter; replay is inert",async()=>{
 expect(await fixedState()).toEqual(before);
 const p=input(),saved=await importLateSource(f.runtime,a.context,a.jobId,a.digest,p);
 expect(saved).toMatchObject({evidenceAfterLock:true,realExternalActions:0,record:{actualTesterMembershipId:"d1500000-0000-4000-8000-000000000003"}});
 expect(saved.record.evidence.sha256).toBe(createHash("sha256").update(p.text).digest("hex"));
 expect(new Date(saved.record.evidence.serverReceivedAt).getTime()).toBeGreaterThan(new Date(saved.statedSentAt).getTime());
 const retries=await Promise.all([1,2].map(()=>importLateSource(f.runtime,a.context,a.jobId,a.digest,p)));
 expect(retries).toEqual([saved,saved]);
 await expect(importLateSource(f.runtime,a.context,a.jobId,a.digest,{...p,text:"Changed source"})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
 expect((await f.admin.query("SELECT count(*)::int n FROM infrastructure.demo_source_hold_request WHERE id=$1",[p.commandId])).rows).toEqual([{n:1}]);
 const observations=await readLateSourceObservations(f.runtime,a.context,a.jobId);
 expect(observations).toHaveLength(1);expect(observations[0]!.evidence).toEqual(saved.record.evidence);
 const sink=new ShadowDetectionRepository(f.shadow),batch={version:"shadow-detection-batch.v1",jobId:a.jobId,observations,captures:[],proposals:detectShadowObservations(observations,[],new Date().toISOString())};
 await sink.persist(verifiedTenantContextForQueuedJob(a.tenantId),batch);await sink.persist(verifiedTenantContextForQueuedJob(a.tenantId),batch);
 await finalCheckTenant(f.shadow,a.tenantId,async db=>{
  expect((await db.query("SELECT count(*)::int n FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND coalesced_into_signal_id IS NULL",[a.tenantId,a.jobId])).rows).toEqual([{n:1}]);
  expect((await db.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toContainEqual({reason:"evidence_after_lock"});
 });
 expect(await fixedState()).toEqual(before);await migrate(f.admin);expect(await fixedState()).toEqual(before);
});
it("invalid future dates, foreign tenant/session and direct runtime writes fail closed",async()=>{
 const original=await fixedState();
 await expect(importLateSource(f.runtime,a.context,a.jobId,a.digest,{...input(),statedSentAt:"2099-01-01T00:00:00Z"})).rejects.toThrow("INVALID_JOB_SOURCE_INPUT");
 await expect(importLateSource(f.runtime,testTenantContext(randomUUID()),a.jobId,a.digest,input())).rejects.toThrow();
 await expect(importLateSource(f.runtime,a.context,a.jobId,"f".repeat(64),input())).rejects.toThrow();
 await finalCheckTenant(f.runtime,randomUUID(),async db=>expect((await db.query("SELECT * FROM app.late_source_import")).rows).toEqual([]));
 await expect(finalCheckTenant(f.runtime,a.tenantId,db=>db.query("UPDATE app.late_source_import SET stated_sent_at='2019-01-01'"))).rejects.toThrow();
 expect((await f.admin.query("SELECT has_table_privilege('jobguard_shadow','app.late_source_import','SELECT') allowed")).rows).toEqual([{allowed:false}]);
 expect(await fixedState()).toEqual(original);
});
it("audit failure rolls the original, request and command back together; the same command can retry",async()=>{
 const p=input();
 const evidence=()=>f.admin.query("SELECT count(*)::int n FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
 const prior=(await evidence()).rows;
 await f.admin.query(`CREATE FUNCTION app.sv5_late_import_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='job_source.historical_imported' THEN RAISE EXCEPTION 'SV5_IMPORT_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER sv5_late_import_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.sv5_late_import_audit_failure()`);
 try{await expect(importLateSource(f.runtime,a.context,a.jobId,a.digest,p)).rejects.toThrow("SV5_IMPORT_AUDIT_FAILURE");}
 finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER sv5_late_import_audit_failure");}
 expect((await evidence()).rows).toEqual(prior);
 expect((await f.admin.query("SELECT command_id FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[a.tenantId,p.commandId])).rows).toEqual([]);
 expect((await f.admin.query("SELECT id FROM infrastructure.demo_source_hold_request WHERE id=$1",[p.commandId])).rows).toEqual([]);
 await expect(importLateSource(f.runtime,a.context,a.jobId,a.digest,p)).resolves.toMatchObject({evidenceAfterLock:true});
});
