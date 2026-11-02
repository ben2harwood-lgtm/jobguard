import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, ReadinessRepository, withTenant } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";

let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool;
const tenantId = randomUUID(), context = testTenantContext(tenantId);
const on = "2026-03-27T09:00:00.000Z", at = "2026-03-30T08:00:00.000Z";
const input = () => ({ commandId: randomUUID(), scenarioNow: at });
beforeAll(async () => {
  const databaseDir = await mkdtemp(join(tmpdir(), "jg-readiness-later-"));
  const port = await freePort(59500, 100), connectionValue = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: connectionValue,
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: connectionValue, database: "postgres" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  // Start each test connection in the existing runtime role without adding any grant.
  runtime = new Pool({ host: "127.0.0.1", port, user: "postgres", password: connectionValue,
    database: "postgres", options: "-c role=jobguard_runtime" });
  expect((await runtime.query(`SELECT current_user AS role, rolsuper, rolbypassrls
    FROM pg_roles WHERE rolname=current_user`)).rows).toEqual([
    { role: "jobguard_runtime", rolsuper: false, rolbypassrls: false },
  ]);
}, 60000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); });

async function job() {
  const id = randomUUID(); await importWatchdogFixtureJob(admin, tenantId, id); return id;
}
async function counts(jobId: string) {
  return (await admin.query(`SELECT
    (SELECT count(*)::int FROM app.readiness_decision WHERE job_id=$1) decisions,
    (SELECT count(*)::int FROM app.watchdog_command_identity WHERE job_id=$1) identities,
    (SELECT count(*)::int FROM app.watchdog_command_result r JOIN app.watchdog_command_identity i
      USING(tenant_id,command_id) WHERE i.job_id=$1) results,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$2) audits`, [jobId, tenantId])).rows[0];
}

describe("LATER-B13 readiness references and meaningful decisions", () => {
  it("L060 api-file-readiness#3 existing plan from another job is refused, with a valid positive twin", async () => {
    const repo = new ReadinessRepository(runtime), sourceJob = await job(), targetJob = await job();
    const recorded = await repo.record(context, sourceJob, { commandId: randomUUID(), scenarioNow: on });
    const source = (await admin.query("SELECT planned_work_revision_id FROM app.readiness_snapshot WHERE id=$1", [recorded.snapshot?.id])).rows[0];
    expect((await admin.query("SELECT job_id FROM app.planned_work_revision WHERE id=$1", [source.planned_work_revision_id])).rows).toEqual([{ job_id: sourceJob }]);
    const constraints = (await admin.query(`SELECT conname FROM pg_constraint
      WHERE conrelid='app.readiness_snapshot'::regclass AND confrelid='app.planned_work_revision'::regclass AND contype='f'`)).rows;
    expect(constraints).toHaveLength(1);
    const insert = (target: string) => withTenant(runtime, context, db => db.$client.query(`
      INSERT INTO app.readiness_snapshot(id,tenant_id,job_id,command_id,planned_work_revision_id,revision,
        rule_revision,source_facts_hash,adapter_revision,adapter_reading_hash,scenario_now,weather_observed_at,
        weather_state,ready,reasons,exposure_pence,recovery_fee_pence,actor_ref,subject_ref,payload_hash,audit_event_id)
      SELECT $1,tenant_id,$2,$3,planned_work_revision_id,99,rule_revision,source_facts_hash,adapter_revision,
        adapter_reading_hash,scenario_now,weather_observed_at,weather_state,ready,reasons,exposure_pence,
        recovery_fee_pence,actor_ref,$2,payload_hash,audit_event_id
      FROM app.readiness_snapshot WHERE tenant_id=$4 AND id=$5`,
    [randomUUID(), target, randomUUID(), tenantId, recorded.snapshot?.id]));
    expect((await insert(sourceJob)).rowCount).toBe(1);
    await expect(insert(targetJob)).rejects.toMatchObject({ code: "23503", table: "readiness_snapshot", constraint: constraints[0].conname });
    expect((await repo.view(context, targetJob)).snapshot).toBeNull();
  });

  it("L068 api-file-readiness#2 fully ready work creates no due-review Decision and replays its first result", async () => {
    const repo = new ReadinessRepository(runtime), id = await job();
    await repo.record(context, id, { commandId: randomUUID(), scenarioNow: on, resolved: true });
    const before = await counts(id), command = input(), ready = await repo.advance(context, id, command);
    expect(ready).toMatchObject({ snapshot: { ready: true, reasons: [], recoveryFeePence: 0 }, dueReviewDecisions: 0, externalActions: 0, scheduleRewrites: 0 });
    expect(await counts(id)).toEqual({ ...before, identities: before.identities + 1, results: before.results + 1 });
    await repo.record(context, id, { commandId: randomUUID(), scenarioNow: on });
    await repo.advance(context, id, input());
    expect(await repo.advance(context, id, command)).toEqual(ready);
    const after = await counts(id);
    await expect(repo.advance(context, id, { ...command, scenarioNow: on })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await counts(id)).toEqual(after);
    const otherJob = await job(), otherBefore = await counts(otherJob);
    await expect(repo.advance(context, otherJob, command)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await counts(otherJob)).toEqual(otherBefore);
    expect((await counts(id)).decisions).toBe(after.decisions);
  });

  it("L068 unresolved mandatory work creates the required Decision only once, including concurrent duplicates", async () => {
    const repo = new ReadinessRepository(runtime), id = await job();
    await repo.record(context, id, { commandId: randomUUID(), scenarioNow: on });
    const before = await counts(id), command = input();
    const results = await Promise.all([repo.advance(context, id, command), repo.advance(context, id, command)]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toMatchObject({ snapshot: { ready: false, reasons: ["A predecessor is not complete", "2 units still needed", "Crew availability unknown"] }, dueReviewDecisions: 1 });
    expect(await repo.advance(context, id, input())).toEqual(results[0]);
    const after = await counts(id);
    expect(after).toEqual({ decisions: 1, identities: before.identities + 2, results: before.results + 2, audits: before.audits + 1 });
    expect((await repo.view(context, id)).dueReviewDecisions).toBe(1);
  });

  it("L068 resolving later work preserves the earlier mandatory Decision without creating another", async () => {
    const repo = new ReadinessRepository(runtime), id = await job();
    await repo.record(context, id, { commandId: randomUUID(), scenarioNow: on });
    const command = input(), unresolved = await repo.advance(context, id, command);
    await repo.record(context, id, { commandId: randomUUID(), scenarioNow: on, resolved: true });
    const before = await counts(id);
    expect(await repo.advance(context, id, input())).toMatchObject({ snapshot: { ready: true }, dueReviewDecisions: 1 });
    expect(await counts(id)).toEqual({ ...before, identities: before.identities + 1, results: before.results + 1 });
    expect(await repo.advance(context, id, command)).toEqual(unresolved);
  });

  it("L068 command, Decision and audit roll back together when result persistence fails", async () => {
    const repo = new ReadinessRepository(runtime), id = await job();
    await repo.record(context, id, { commandId: randomUUID(), scenarioNow: on });
    const command = input(), before = await counts(id);
    // Failure injection in real PostgreSQL after the Decision and audit writes; scoped to this generated command.
    await admin.query(`CREATE FUNCTION app.test_readiness_later_result_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.command_id='${command.commandId}'::uuid AND (NEW.result->>'dueReviewDecisions')::int=1
      THEN RAISE EXCEPTION 'readiness_later_result_failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_readiness_later_result_failure BEFORE INSERT ON app.watchdog_command_result
      FOR EACH ROW EXECUTE FUNCTION app.test_readiness_later_result_failure()`);
    await expect(repo.advance(context, id, command)).rejects.toThrow("readiness_later_result_failure");
    expect(await counts(id)).toEqual(before);
    await repo.record(context, id, { commandId: randomUUID(), scenarioNow: on, resolved: true });
    expect(await repo.advance(context, id, command)).toMatchObject({ dueReviewDecisions: 0 });
    expect((await counts(id)).decisions).toBe(0);
  });
});
