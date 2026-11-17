import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { finalizeMeterLifecycleOwnership } from "../src/demo-bootstrap.js";
import { MeterTodayRepository } from "../src/meter-today-repository.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, insertPhoto, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
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
 });
 expect((await read()).countedPlaces).toBe(0);
 await commands.command(a.context,a.jobId,a.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:2,action:"resume"});
 expect((await read()).countedPlaces).toBe(1);
 await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
 await expect(read()).rejects.toThrow("METER_FORBIDDEN");
});

it("fresh capture is a finalized narrow entrypoint, with no direct runtime table access", async () => {
 const a=await meterCompany(f);
 await expect(f.runtime.query("SELECT app.mon1_today_source($1,$2)",[a.tenantId,a.digest])).rejects.toThrow("METER_FORBIDDEN");
 expect((await f.admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,
  has_function_privilege('jobguard_runtime',oid,'EXECUTE') executable FROM pg_proc
  WHERE oid='app.mon1_today_source(uuid,text)'::regprocedure`)).rows[0]).toEqual({owner:"jobguard_meter_owner",prosecdef:true,proconfig:["search_path=pg_catalog"],executable:true});
 await expect(workTenant(f.runtime,a.tenantId,db=>db.query("SELECT * FROM app.meter_lifecycle_source"))).rejects.toThrow("permission denied");
 expect((await f.admin.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='app' AND c.relkind IN ('r','p','v','m') AND c.relname LIKE 'shadow%'
  AND has_table_privilege('jobguard_meter_owner',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`)).rows).toEqual([]);
});
