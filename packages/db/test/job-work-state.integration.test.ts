import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { createWorkFixture,closeWorkFixture,seedWorkJob,fixtureLifecycle,workEvents,workTenant,type WorkFixture } from "./job-work-state-fixtures.js";
describe("CH-4 held command storage boundary tests",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A06 finished and cancellation append immutable facts (fixture storage only)",async()=>{
  const a=await seedWorkJob(f),marker=await fixtureLifecycle(f,a,"finished_on_site"),cancel=await fixtureLifecycle(f,a,"finished_cancelled",marker);
  expect((await workEvents(f,a)).map(x=>x.id)).toEqual([marker,cancel]);
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("UPDATE app.job_work_state_event SET kind='resumed' WHERE tenant_id=$1",[a.tenantId]))).rejects.toThrow();
  await expect(fixtureLifecycle(f,a,"finished_cancelled",marker)).rejects.toThrow("INVALID_WORK_PREDECESSOR");
 });
 it("CH4-A07 CH4-A09 close requires reason and note and reopen preserves history (fixture storage only)",async()=>{
  const a=await seedWorkJob(f),before=(await f.admin.query("SELECT row_to_json(j)::text row FROM app.job j WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId])).rows;
  const closed=await fixtureLifecycle(f,a,"closed");await fixtureLifecycle(f,a,"reopened",closed);await fixtureLifecycle(f,a,"resumed");
  expect((await workEvents(f,a)).map(x=>x.kind)).toEqual(["closed","reopened","resumed"]);
  expect((await f.admin.query("SELECT row_to_json(j)::text row FROM app.job j WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId])).rows).toEqual(before);
  const audits=(await f.admin.query("SELECT payload::text payload FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'job.work_state.%'",[a.tenantId])).rows;
  expect(audits).toHaveLength(3);expect(JSON.stringify(audits)).not.toContain("Fictional customer stopped work");
 });
});

describe("CH-4 rollback and link storage (held admission remains unbuilt)",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A17 rollback removes source receipt event and audit atomically",async()=>{
  const a=await seedWorkJob(f),before=(await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1",[a.tenantId])).rows;
  // A fault injected by the deferred audit trigger aborts the whole source transaction.
  await f.admin.query(`CREATE FUNCTION app.ch4_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type LIKE 'job.work_state.%' THEN RAISE EXCEPTION 'CH4_FIXTURE_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER ch4_test_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.ch4_test_audit_failure()`);
  const {insertPhoto}=await import("./job-work-state-fixtures.js");await expect(insertPhoto(f,a)).rejects.toThrow("CH4_FIXTURE_FAILURE");
  expect(await workEvents(f,a)).toEqual([]);expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1",[a.tenantId])).rows).toEqual(before);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_site_source_receipt WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
  // The fixture trigger is disabled, preserving its diagnostic definition for inspection.
  await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER ch4_test_failure");
 });
 it("CH4-A18 CH4-A19 link storage refuses self-link and different party identities; no runtime linking routine exists",async()=>{
  const a=await seedWorkJob(f),b=await seedWorkJob(f,a.tenantId);
  const {randomUUID}=await import("node:crypto");
  const binding=(await f.admin.query("SELECT * FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0],other=(await f.admin.query("SELECT id FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2",[b.tenantId,b.jobId])).rows[0];
  for(const successor of [a.jobId,b.jobId])await expect(workTenant(f.admin,a.tenantId,db=>db.query(`INSERT INTO app.job_link(tenant_id,id,predecessor_job_id,successor_job_id,predecessor_binding_id,successor_binding_id,customer_id,site_id,paying_party_id,command_id,actor_membership_id,request_hash,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[a.tenantId,randomUUID(),a.jobId,successor,binding.id,successor===a.jobId?binding.id:other.id,binding.customer_id,binding.site_id,binding.paying_party_id,randomUUID(),a.actorId,"a".repeat(64),randomUUID()]))).rejects.toThrow();
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_link WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
 });
});

describe("CH-4 persisted authenticated read",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(true,"jobguard_synthetic_demo")},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A20 CH4-A23 CH4-A27 fresh repositories read the same synthetic history through persisted session authority",async()=>{
  const {seedWorkPractice}=await import("./job-work-state-fixtures.js"),{JobWorkStateRepository}=await import("../src/job-work-state-repository.js");
  const {authorizePracticeJob}=await import("../src/practice-session.js"),p=await seedWorkPractice(f),auth=await authorizePracticeJob(f.runtime,p.sessionId,p.jobId);
  const a=await new JobWorkStateRepository(f.runtime).read(auth.context,p.jobId,auth.digest),b=await new JobWorkStateRepository(f.runtime).read(auth.context,p.jobId,auth.digest);
  expect(a).toEqual(b);expect(a.environment).toBe("synthetic_demo");expect(a.realExternalActions).toBe(0);
  const {randomUUID}=await import("node:crypto");await expect(new JobWorkStateRepository(f.runtime).read(auth.context,randomUUID(),auth.digest)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[p.auth.digest]);
  await expect(new JobWorkStateRepository(f.runtime).read(auth.context,p.jobId,auth.digest)).rejects.toThrow("WORK_STATE_FORBIDDEN");
 });
});

describe("CH-4 hidden-data equivalence (actual PostgreSQL)",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(true,"jobguard_synthetic_demo")},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A22 zero and many hidden signals leave persisted public history byte-identical",async()=>{
  const {seedWorkPractice}=await import("./job-work-state-fixtures.js"),{JobWorkStateRepository}=await import("../src/job-work-state-repository.js"),{randomUUID}=await import("node:crypto"),p=await seedWorkPractice(f);
  const before=JSON.stringify(await new JobWorkStateRepository(f.runtime).read(p.auth.context,p.jobId,p.auth.digest));
  await workTenant(f.admin,p.auth.context.tenantId,async db=>{for(let n=0;n<10;n++)await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band) VALUES($1,$2,$3,$4,'fixture_site_work','deterministic','ch4.boundary.v1',clock_timestamp(),'Fictional private candidate','low')",[p.auth.context.tenantId,p.jobId,randomUUID(),randomUUID()])});
  expect(JSON.stringify(await new JobWorkStateRepository(f.runtime).read(p.auth.context,p.jobId,p.auth.digest))).toBe(before);
 });
});

describe("CH-4 valid link fixture storage",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A18 CH4-A19 exact common party bindings create only an immutable link (fixture, admission held)",async()=>{
  const {randomUUID}=await import("node:crypto"),{boundaryLock}=await import("./job-work-state-fixtures.js"),a=await seedWorkJob(f),b=await seedWorkJob(f,a.tenantId);await boundaryLock(f,a);
  const source=(await f.admin.query("SELECT * FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0],binding=randomUUID(),id=randomUUID();
  const before=(await f.admin.query("SELECT row_to_json(j)::text row FROM app.job j WHERE tenant_id=$1 ORDER BY id",[a.tenantId])).rows;
  await workTenant(f.admin,a.tenantId,async db=>{
   await db.query("INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,'backfilled_synthetic_fixture')",[a.tenantId,binding,b.jobId,source.customer_id,source.customer_revision_id,source.paying_party_id,source.paying_party_revision_id,source.site_id,source.site_revision_id]);
   await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,'ch4.fixture.link',$2::uuid::text,$3,'succeeded',$4,'{}',clock_timestamp())",[a.tenantId,id,"a".repeat(64),a.actorId]);
   await db.query("INSERT INTO app.job_link(tenant_id,id,predecessor_job_id,successor_job_id,predecessor_binding_id,successor_binding_id,customer_id,site_id,paying_party_id,command_id,actor_membership_id,request_hash,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$2,$10,$11,$2)",[a.tenantId,id,a.jobId,b.jobId,source.id,binding,source.customer_id,source.site_id,source.paying_party_id,a.actorId,"a".repeat(64)]);
  });
  expect((await f.admin.query("SELECT row_to_json(j)::text row FROM app.job j WHERE tenant_id=$1 ORDER BY id",[a.tenantId])).rows).toEqual(before);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_link WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
  for(const table of ["job_activation","synthetic_obligation","journal","recovery_fee_journal"])expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[a.tenantId])).rows[0].n).toBe(0);
 });
});
