import { testTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { finalizeMeterLifecycleOwnership } from "../src/demo-bootstrap.js";
import { MeterTodayRepository } from "../src/meter-today-repository.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, insertPhoto, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany, meterInput, storeMeter, refreshMeter, readMeter } from "./meter-persistence-fixtures.js";
import { historicalAgreement } from "./subscription-persistence-fixtures.js";
import { activateMeterJob } from "./meter-journey-fixtures.js";
let f: WorkFixture;
beforeAll(async () => {
 f = await createWorkFixture(); const db = await f.admin.connect();
 try { await finalizeMeterLifecycleOwnership(db); } finally { db.release(); }
}, 60000);
afterAll(async () => closeWorkFixture(f));
it("real site evidence and work commands refresh the screen; replay and foreign sessions cannot change its count", async () => {
 const a = await meterCompany(f), b = await meterCompany(f);
 await historicalAgreement(f,a,"Solo"); await activateMeterJob(f,a);
 const reader = new MeterTodayRepository(f.runtime), commands = new JobWorkStateRepository(f.runtime);
 const read = () => reader.read(a.context,a.digest);
 expect(await read()).toMatchObject({countedPlaces:0,plan:"Solo"});
 const revisions=async()=>Number((await f.admin.query("SELECT count(*) n FROM app.meter_lifecycle_source WHERE tenant_id=$1",[a.tenantId])).rows[0].n);
 expect(await revisions()).toBe(1);
 await Promise.all([read(),read()]); expect(await revisions()).toBe(1);
 // PostgreSQL transaction time preserves activation-before-photo ordering at microsecond precision.
 await insertPhoto(f,a,"now");
 const photoTimes=await f.admin.query("SELECT e.fact_at>=a.activated_at ordered FROM app.job_work_state_event e JOIN app.job_activation a ON (a.tenant_id,a.job_id)=(e.tenant_id,e.job_id) WHERE e.tenant_id=$1 AND e.job_id=$2",[a.tenantId,a.jobId]);
 expect(photoTimes.rows).toEqual([{ordered:true}]);
 expect((await read()).countedPlaces).toBe(1);
 expect(await revisions()).toBe(2); await read(); expect(await revisions()).toBe(2);
 const raw={version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:1,action:"finish"};
 const finished=await commands.command(a.context,a.jobId,a.actorId,raw);
 expect((await read()).countedPlaces).toBe(1); // finishing keeps the seven-day tail
 await commands.command(a.context,a.jobId,a.actorId,raw);
 expect((await read()).countedPlaces).toBe(1);
 await expect(reader.read(b.context,a.digest)).rejects.toThrow("METER_FORBIDDEN");
 await expect(commands.command(b.context,a.jobId,b.actorId,raw)).rejects.toThrow("WORK_STATE_FORBIDDEN");
 expect(finished.events).toHaveLength(2);
 // Explicit historical fixture only: move the two immutable facts back seven
 // London calendar dates, to test the actual midnight stop without a public clock.
 await workTenant(f.admin,a.tenantId,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`UPDATE app.job_activation SET activated_at=clock_timestamp()-interval '8 days' WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId]);
  // Preserve first-evidence-before-finish ordering when relocating these fictional facts.
  await db.query(`UPDATE app.job_work_state_event SET fact_at=(((clock_timestamp() AT TIME ZONE 'Europe/London')::date-7+time '12:00') AT TIME ZONE 'Europe/London')+sequence*interval '1 microsecond',recorded_at=(((clock_timestamp() AT TIME ZONE 'Europe/London')::date-7+time '12:00') AT TIME ZONE 'Europe/London')+sequence*interval '1 microsecond' WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId]);
 }, { membershipId: a.actorId });
 expect((await read()).countedPlaces).toBe(0);
 await commands.command(a.context,a.jobId,a.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:2,action:"resume"});
 expect((await read()).countedPlaces).toBe(1);
 await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
 await expect(reader.read(testTenantContext(a.tenantId, { membershipId: a.actorId, bindRequest: false }), a.digest)).rejects.toThrow("METER_FORBIDDEN");
});

it("fresh capture is a finalized narrow entrypoint, with no direct runtime table access", async () => {
 const a=await meterCompany(f);
 await expect(f.runtime.query("SELECT app.mon1_today_source($1,$2)",[a.tenantId,a.digest])).rejects.toThrow("METER_FORBIDDEN");
 expect((await f.admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,
  has_function_privilege('jobguard_runtime',oid,'EXECUTE') executable FROM pg_proc
  WHERE oid='app.mon1_today_source(uuid,text)'::regprocedure`)).rows[0]).toEqual({owner:"jobguard_meter_owner",prosecdef:true,proconfig:["search_path=pg_catalog"],executable:true});
 await expect(workTenant(f.runtime,a.tenantId,db=>db.query("SELECT * FROM app.meter_lifecycle_source"), { membershipId: a.actorId })).rejects.toThrow("permission denied");
 expect((await f.admin.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='app' AND c.relkind IN ('r','p','v','m') AND c.relname LIKE 'shadow%'
  AND has_table_privilege('jobguard_meter_owner',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`)).rows).toEqual([]);
});


it("MON1-J drill-down stays company-scoped and signals change neither its rows nor the bill", async () => {
 const a = await meterCompany(f), b = await meterCompany(f);
 for (const company of [a, b]) {
  await historicalAgreement(f, company, "Builder"); await activateMeterJob(f, company);
  await insertPhoto(f, company, "now");
 }
 const reader = new MeterTodayRepository(f.runtime);
 const before = await reader.readJobs(a.context, a.digest);
 expect(before.meter).toMatchObject({ countedPlaces: 1, freeSmallPlaces: 0 });
 expect(before.places).toEqual([{ kind: "place", jobIds: [a.jobId] }]);
 expect((await reader.readJobs(b.context, b.digest)).places).toEqual([{ kind: "place", jobIds: [b.jobId] }]);
 // Explicit synthetic billing fixture: compare the full persisted pricing result,
 // independently of the fresh work-command projection used by the screen.
 await storeMeter(f, a, meterInput(a.tenantId));
 const bill = (await readMeter(f, a, await refreshMeter(f, a))).result;
 await workTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.shadow_commercial_signal
  (tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
  VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Fictional hidden extra','low','held_for_final_check')`,
  [a.tenantId, a.jobId, randomUUID(), randomUUID()]), { membershipId: a.actorId });
 expect(await reader.readJobs(a.context, a.digest)).toEqual(before);
 expect((await readMeter(f, a, await refreshMeter(f, a))).result).toEqual(bill);
 await expect(reader.readJobs(b.context, a.digest)).rejects.toThrow("METER_FORBIDDEN");
 await expect(f.runtime.query("SELECT app.mon1_today_jobs($1,$2)", [a.tenantId, a.digest])).rejects.toThrow("METER_FORBIDDEN");
 await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
 await expect(reader.readJobs(testTenantContext(a.tenantId, { membershipId: a.actorId, bindRequest: false }), a.digest)).rejects.toThrow("METER_FORBIDDEN");
 await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [b.sessionId]);
 await expect(reader.readJobs(testTenantContext(b.tenantId, { membershipId: b.actorId, bindRequest: false }), b.digest)).rejects.toThrow("METER_FORBIDDEN");
});

it("drill-down grants only checked execution; its only business input is the meter work ledger", async () => {
 const empty = await meterCompany(f);
 await expect(workTenant(f.runtime, empty.tenantId, db => db.query("SELECT app.mon1_today_jobs($1,$2)", [empty.tenantId, empty.digest]), { membershipId: empty.actorId, bindRequest: false })).rejects.toThrow("METER_UNAVAILABLE");
 const row = (await f.admin.query(`SELECT pg_get_functiondef(oid) definition,prosecdef,proconfig,
  pg_get_userbyid(proowner) owner,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,
  has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure,
  EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public
  FROM pg_proc WHERE oid='app.mon1_today_jobs(uuid,text)'::regprocedure`)).rows[0];
 expect(row).toMatchObject({ prosecdef: true, proconfig: ["search_path=pg_catalog"], owner: "jobguard_migration",
  runtime: true, infrastructure: false, public: false });
 const inputs = [...String(row.definition).matchAll(/\b(?:FROM|JOIN)\s+app\.([a-z_]+)/giu)].map(match => match[1]);
 expect(inputs).toEqual(["meter_work_ledger"]);
 expect(row.definition.indexOf("PERFORM app.mon1_company_actor")).toBeLessThan(row.definition.indexOf("SELECT * INTO"));
 expect(row.definition).not.toMatch(/app\.(shadow|finding|recovery|eligibility)/u);
 expect((await f.admin.query(`SELECT has_table_privilege('jobguard_runtime','app.meter_work_ledger','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed`)).rows).toEqual([{ allowed: false }]);
 // The read migration must not change the restricted meter roles' shadow grants.
 for (const role of ["jobguard_runtime", "jobguard_meter", "jobguard_meter_owner"]) {
  expect((await f.admin.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='app' AND c.relkind IN ('r','p','v','m') AND c.relname LIKE 'shadow%'
   AND (has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))`, [role])).rows).toEqual([]);
 }
});
