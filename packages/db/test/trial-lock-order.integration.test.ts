import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FreeFirstJobLifecycleRepository } from "../src/free-first-job-lifecycle-repository.js";
import { createWorkFixture, closeWorkFixture, meterCompany, verifyBusiness, workTenant, type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { activateMeterJob } from "./meter-journey-fixtures.js";
import { exactTarget } from "./free-first-job-lifecycle-fixtures.js";
import { historicalAgreement } from "./subscription-persistence-fixtures.js";

describe("lock-order-418 trial versus MON-1 admission (real PostgreSQL)", () => {
 let f: WorkFixture;
 const old = process.env.JOBGUARD_ENV;
 beforeAll(async () => { f = await createWorkFixture(); process.env.JOBGUARD_ENV = "synthetic_demo"; }, 60000);
 afterAll(async () => {
  if (old === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = old;
  await closeWorkFixture(f);
 });

 it("upgrades the latest routine without changing its ACL, owner, security or stored facts", async () => {
  const a = await meterCompany(f); await verifyBusiness(f, a);
  const source = await readFile(new URL("../migrations/0373_free_first_job_eligibility.sql", import.meta.url), "utf8");
  const original = source.slice(source.indexOf("CREATE FUNCTION app.mon3_activate("), source.indexOf("CREATE FUNCTION app.mon3_require_registered_admission("));
  const attributes = async () => (await f.admin.query(`SELECT proowner,proacl,prosecdef,proconfig FROM pg_proc
   WHERE oid='app.mon3_activate(uuid,text,uuid,jsonb)'::regprocedure`)).rows;
  const facts = async () => (await f.admin.query("SELECT to_jsonb(v) value FROM app.trial_business_verification v WHERE tenant_id=$1", [a.tenantId])).rows;
  const before = await attributes(), data = await facts();
  try {
   // Restore the exact predecessor, then exercise the forward-only upgrade on populated main.
   await f.admin.query(original.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
   await f.admin.query(await readFile(new URL("../migrations/0400_trial_activation_lock_order.sql", import.meta.url), "utf8"));
   expect(await attributes()).toEqual(before); expect(await facts()).toEqual(data);
  } finally {
   await f.admin.query(await readFile(new URL("../migrations/0400_trial_activation_lock_order.sql", import.meta.url), "utf8"));
  }
 });

 it("preserves capacity refusal through the restricted runtime and rejects foreign or expired session authority", async () => {
  const a = await meterCompany(f); await verifyBusiness(f, a); await exactTarget(f, a);
  const grants = (await f.admin.query(`SELECT has_table_privilege('jobguard_runtime','app.job','UPDATE') job_update,
   pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
   has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
   has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
   EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public
   FROM pg_proc p WHERE p.oid='app.mon3_lock_activation(uuid,text,uuid)'::regprocedure`)).rows;
  expect(grants).toEqual([{job_update:false,owner:'jobguard_migration',prosecdef:true,proconfig:['search_path=pg_catalog'],runtime:true,infrastructure:false,public:false}]);
  await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [a.tenantId,a.jobId])))
   .rejects.toMatchObject({code:'42501'});
  const repo = new FreeFirstJobLifecycleRepository(f.runtime), view = await repo.read(a.context,a.digest,a.jobId);
  await expect(repo.activate(a.context,a.digest,a.actorId,{version:'trial-switch-live.v1',commandId:randomUUID(),jobId:a.jobId,...view.target}))
   .rejects.toThrow('CAPACITY_ADMISSION_UNAVAILABLE');
  const b = await meterCompany(f);
  const lock = (tenant:string,digest:string) => workTenant(f.runtime,tenant,db => db.query("SELECT app.mon3_lock_activation($1,$2,$3)",[tenant,digest,a.jobId]));
  await expect(lock(b.tenantId,a.digest)).rejects.toThrow('METER_FORBIDDEN');
  await f.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[a.sessionId]);
  await expect(lock(a.tenantId,a.digest)).rejects.toThrow('METER_FORBIDDEN');
 });

 it.each(["dispatcher", "SQL"] as const)("%s trial waits for the job without blocking same-job meter admission", async entry => {
  const a = await meterCompany(f); await historicalAgreement(f, a); await verifyBusiness(f, a); await activateMeterJob(f, a);
  const input = { version: "trial-switch-live.v1", commandId: randomUUID(), jobId: a.jobId,
   acceptedDocumentId: randomUUID(), acceptedDocumentVersion: 1, acceptedDocumentHash: "a".repeat(64), expectedJobRevision: 1 };
  const trial = async () => {
   try {
    if (entry === "dispatcher") await new FreeFirstJobLifecycleRepository(f.runtime).activate(a.context, a.digest, a.actorId, input);
    else await workTenant(f.runtime, a.tenantId, db => db.query("SELECT app.mon3_activate($1,$2,$3,$4::jsonb)",
     [a.tenantId, a.digest, input.commandId, JSON.stringify({ ...input, version: "trial-admission.v1", commandId: undefined,
      activationId: randomUUID(), termsId: randomUUID(), authorizationId: randomUUID() })]));
    return "unexpected success";
   } catch (error) { return (error as Error).message; }
  };
  // Both entry points must preserve the serial legacy-conversion refusal and leave no receipt.
  expect(await trial()).toBe("TRIAL_LEGACY_POLICY_CONVERSION_FORBIDDEN");
  const meter = await f.runtime.connect();
  let pending: Promise<string> | undefined;
  try {
   await meter.query("BEGIN"); await meter.query("SET LOCAL statement_timeout='10s'");
   await meter.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
   await meter.query("SELECT app.require_watchdog_live($1)", [a.jobId]);
   const pid = (await meter.query("SELECT pg_backend_pid() pid")).rows[0].pid;
   pending = trial();
   // Observe the real lock wait before running capacity admission; no timing assumption.
   let blocked = false;
   for (let n = 0; n < 200 && !blocked; n++) {
    blocked = (await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))) blocked", [pid])).rows[0].blocked;
   }
   expect(blocked).toBe(true);
   // Real checked MON-1 resume takes company capacity after the job; no routine substitute.
   const command = { version: "job-work-state-command.v1", commandId: randomUUID(), action: "resume", expectedRevision: 0 };
   const result = (await meter.query("SELECT app.ch4_record_work_state($1,$2,$3,$4::jsonb) result",
    [a.tenantId, a.jobId, a.actorId, JSON.stringify(command)])).rows[0].result;
   expect(result.events).toMatchObject([{ kind: "resumed" }]);
   await meter.query("COMMIT");
   expect(await pending).toBe("TRIAL_LEGACY_POLICY_CONVERSION_FORBIDDEN");
   const replay = await workTenant(f.runtime, a.tenantId, async db => (await db.query("SELECT app.ch4_record_work_state($1,$2,$3,$4::jsonb) result",
    [a.tenantId, a.jobId, a.actorId, JSON.stringify(command)])).rows[0].result);
   expect(replay).toEqual(result);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId, input.commandId])).rows[0].n).toBe(0);
  } finally {
   await meter.query("ROLLBACK"); meter.release(); await pending;
  }
 });
});
