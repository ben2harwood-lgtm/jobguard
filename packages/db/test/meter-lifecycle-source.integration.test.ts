import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { historicalAgreement } from "./subscription-persistence-fixtures.js";
import { MeterLifecycleRepository } from "../src/meter-lifecycle-repository.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";

// Checked lifecycle functions run as jobguard_migration; no test-only source grants.
describe("MON1-S normal-company source kernel, CI PostgreSQL only", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("M1S-02 missing agreement fails closed, leaving no partial source or scope", async () => {
  const a = await meterCompany(f);
  await expect(new MeterLifecycleRepository(f.runtime).capture(a.context,a.digest,{ version:"meter-lifecycle-capture.v1",commandId:randomUUID(),periodStart:"2026-09-01",expectedSourceRevision:0 })).rejects.toThrow("METER_LIFECYCLE_TERMS_UNAVAILABLE");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_lifecycle_scope WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
 });
 it("M1S-01/03 fixture activation plus real CH-4 finish → immutable source → fresh connection/replay", async () => {
  const a = await meterCompany(f);
  await historicalAgreement(f,a);
  // Activation parents are a labelled synthetic storage fixture, not a claim
  // to have exercised the accepted-document/switch-live command journey.
  const activation=randomUUID(),baseline=randomUUID(),terms=randomUUID();
  await workTenant(f.admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   const binding=(await db.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].binding_id;
   await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING",[a.tenantId,a.jobId]);
   await db.query("INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at,party_binding_id) VALUES($1,$2,$3,$4,1,$5,'synthetic_demo','synthetic_demo_activation.v3','reference_fee_policy_v3',$6,'2026-09-01T00:00:00.000001Z',$7)",[activation,a.tenantId,a.jobId,baseline,'a'.repeat(64),a.actorId,binding]);
   await db.query("INSERT INTO app.job_activation_terms(id,tenant_id,job_id,activation_id,baseline_quote_version_id,baseline_document_version,baseline_document_hash,accepted_net_pence,highest_sent_net_pence,small_job,policy_version,commercial_track,trial_plan_context,activated_at) VALUES($1,$2,$3,$4,$5,1,$6,100000,100000,true,'reference_fee_policy_v3','small_builder','none_recorded_pre_mon2a','2026-09-01T00:00:00.000001Z')",[terms,a.tenantId,a.jobId,activation,baseline,'a'.repeat(64)]);
  });
  const revision=(await f.admin.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId])).rows[0].revision;
  await new JobWorkStateRepository(f.runtime).finish(a.context,a.jobId,a.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),action:"finish",expectedRevision:revision});
  const repository=new MeterLifecycleRepository(f.runtime),input={version:"meter-lifecycle-capture.v1",commandId:randomUUID(),periodStart:"2026-09-01",expectedSourceRevision:0};
  const first=await repository.capture(a.context,a.digest,input);
  expect(first.result.timelines[0]?.events.some(e=>e.kind==='finished_on_site')).toBe(true);
  expect(first.result.timelines[0]?.day31Candidate.activatedAt).toBe('2026-09-01T00:00:00.000001Z');
  expect(first.result.days.every(day=>day.countedPlaces===null)).toBe(true);
  const again=await Promise.all([repository.capture(a.context,a.digest,input),new MeterLifecycleRepository(f.runtime).read(a.context,a.digest,{version:"meter-lifecycle-read.v1",computationId:first.computationId})]);
  expect(again).toEqual([first,first]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_lifecycle_computation WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
  await expect(repository.capture(a.context,a.digest,{...input,expectedSourceRevision:1})).rejects.toThrow('METER_LIFECYCLE_CONFLICT');
  const original=(await f.admin.query("SELECT source::text FROM app.meter_lifecycle_source WHERE tenant_id=$1",[a.tenantId])).rows;
  await f.admin.query("ALTER TABLE app.meter_lifecycle_day_ledger DISABLE TRIGGER immutable");
  try { await f.admin.query("UPDATE app.meter_lifecycle_day_ledger SET source_hash=$2 WHERE tenant_id=$1",[a.tenantId,'0'.repeat(64)]); }
  finally { await f.admin.query("ALTER TABLE app.meter_lifecycle_day_ledger ENABLE TRIGGER immutable"); }
  for(let i=0;i<2;i++) {
   const rebuilt=await repository.rebuild(a.context,a.digest,{version:"meter-lifecycle-rebuild.v1",sourceId:first.sourceId});
   expect(rebuilt.resultHash).toBe(first.resultHash);expect(rebuilt.alerts).toEqual(['METER_CACHE_MISMATCH']);
  }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_lifecycle_alert WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT source::text FROM app.meter_lifecycle_source WHERE tenant_id=$1",[a.tenantId])).rows).toEqual(original);
 });
});
