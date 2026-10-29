import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { persistMeterDayLedger } from "../src/meter-day-ledger.js";
import { withTenant } from "../src/tenant-context.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";

describe("MON-1 part 2: immutable counted day ledger (real PostgreSQL, CI)", () => {
  let f: WorkFixture, meter: Pool;
  beforeAll(async () => {
    f = await createWorkFixture();
    const login = `ledger_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
    await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_meter TO ${login}`);
    meter = new Pool({ ...f.admin.options, user: login, password, max: 2 });
  }, 60000);
  afterAll(async () => { await meter?.end(); await closeWorkFixture(f); });
  const write = (a: Awaited<ReturnType<typeof seedWorkJob>>, sourceId: string) =>
    withTenant(meter, a.context, tx => persistMeterDayLedger(tx, { version: "meter-day-ledger-write.v1", sourceId }));
  async function source(a: Awaited<ReturnType<typeof seedWorkJob>>, revision = 1, previousScope?: string) {
    const scope = previousScope ?? randomUUID(), id = randomUUID();
    const job = {
      version: "meter-lifecycle-input.v1", tenantId: a.tenantId, jobId: a.jobId, sourceRevision: revision,
      activation: { id: randomUUID(), at: "2026-07-01T12:00:00.000000Z", termsId: randomUUID(), termsRevision: 1,
        track: "small_builder", partyBindingId: randomUUID(), customerId: randomUUID(), siteId: randomUUID(), small: false },
      events: [{ version: "job-work-state-event.v1", id: randomUUID(), jobId: a.jobId, sequence: 1,
        kind: "first_site_evidence", factAt: "2026-07-01T23:00:00.000000Z", recordedAt: "2026-07-01T23:00:00.000000Z",
        sourceReceiptId: randomUUID(), commandId: null, predecessorId: null, closeReason: null, closeNote: null }],
      lock: { id: randomUUID(), at: revision === 1 ? "2026-07-02T23:00:00.000000Z" : "2026-07-03T00:00:00.000000Z" },
      trip: null, trial: { status: "unavailable" },
      policy: { version: "meter-lifecycle-policy.v1", revision: "specified-foundation.v1", clockStatus: "held" },
      asOf: "2026-07-04T12:00:00.000000Z", startDate: "2026-07-01", endDateExclusive: "2026-07-04",
    };
    // Made-up storage source; not an activation/session/admission journey.
    const input = { version: "meter-lifecycle-source.v1", tenantId: a.tenantId, scopeId: scope,
      provenance: "actual_normal_company.v1", plan: "Solo", agreementId: randomUUID(), agreementRevision: 1,
      asOf: job.asOf, startDate: job.startDate, endDateExclusive: job.endDateExclusive, jobs: [job], links: [], tripObservations: [] };
    await workTenant(f.admin, a.tenantId, async db => {
      if (!previousScope) await db.query("INSERT INTO app.meter_lifecycle_scope(tenant_id,id,kind) VALUES($1,$2,'normal_company')", [a.tenantId, scope]);
      await db.query(`INSERT INTO app.meter_lifecycle_source(tenant_id,scope_id,id,command_id,period_start,revision,expected_revision,source,source_hash,actor_membership_id)
        VALUES($1,$2,$3,$4,'2026-07-01',$5,$5-1,$6::jsonb,encode(sha256(convert_to(($6::jsonb)::text,'UTF8')),'hex'),$7)`,
      [a.tenantId, scope, id, randomUUID(), revision, JSON.stringify(input), a.actorId]);
    });
    return { id, scope };
  }
  const days = (a: Awaited<ReturnType<typeof seedWorkJob>>, id: string) => workTenant(meter, a.tenantId,
    async db => (await db.query("SELECT date::text,result FROM app.meter_lifecycle_day_ledger WHERE computation_id=$1 ORDER BY date", [id])).rows);

  it("concurrent identical writes return one computation, with London midnight exclusive stop and zero days", async () => {
    const a = await seedWorkJob(f), s = await source(a);
    const heldId = randomUUID();
    await workTenant(f.admin, a.tenantId, async db => {
      await db.query(`INSERT INTO app.meter_lifecycle_computation(tenant_id,scope_id,id,source_id,source_hash,recipe_version,status)
        SELECT tenant_id,scope_id,$2,id,source_hash,'specified-foundation.v1','held' FROM app.meter_lifecycle_source WHERE id=$1`, [s.id, heldId]);
      await db.query(`INSERT INTO app.meter_lifecycle_day_ledger(tenant_id,scope_id,computation_id,date,source_hash,status)
        SELECT tenant_id,scope_id,$2,'2026-07-01',source_hash,'held' FROM app.meter_lifecycle_source WHERE id=$1`, [s.id, heldId]);
    });
    const ids = await Promise.all([write(a, s.id), write(a, s.id)]);
    expect(ids[0]).toBe(ids[1]);
    expect(await write(a, s.id)).toBe(ids[0]);
    const rows = await days(a, ids[0]!);
    // UTC July 1 23:00 is London July 2; July 2 23:00 is July 3 midnight.
    expect(rows.map(row => [row.date, row.result.countedPlaces])).toEqual([
      ["2026-07-01", 0], ["2026-07-02", 1], ["2026-07-03", 0],
    ]);
    expect(rows[1]!.result).toMatchObject({ rawPlaces: 1, freeSmallPlaces: 0, places: [{ jobIds: [a.jobId] }] });
    expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_lifecycle_computation WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(2);
    expect(await days(a, heldId)).toEqual([{ date: "2026-07-01", result: null }]);
  });
  it("new source revision appends history; retries refuse missing or changed cached results", async () => {
    const a = await seedWorkJob(f), s = await source(a), id = await write(a, s.id), before = await days(a, id);
    const next = await source(a, 2, s.scope), nextId = await write(a, next.id);
    expect(nextId).not.toBe(id);
    expect(await days(a, id)).toEqual(before);
    expect((await days(a, nextId))[2]!.result.countedPlaces).toBe(1);
    await expect(workTenant(meter, a.tenantId, db => db.query("UPDATE app.meter_lifecycle_day_ledger SET status='held' WHERE computation_id=$1", [id]))).rejects.toThrow();
    // Privileged corruption probe: an internally consistent wrong value still refuses.
    await f.admin.query("ALTER TABLE app.meter_lifecycle_day_ledger DISABLE TRIGGER immutable");
    try {
      await f.admin.query(`UPDATE app.meter_lifecycle_day_ledger SET result=jsonb_build_object('date',date::text,'places','[]'::jsonb,'rawPlaces',0,'freeSmallPlaces',0,'countedPlaces',0)
        WHERE computation_id=$1 AND date='2026-07-02'`, [id]);
    } finally { await f.admin.query("ALTER TABLE app.meter_lifecycle_day_ledger ENABLE TRIGGER immutable"); }
    await expect(write(a, s.id)).rejects.toThrow("METER_PROJECTION_MISMATCH");
    expect((await days(a, id))[1]!.result.countedPlaces).toBe(0);
    await f.admin.query("ALTER TABLE app.meter_lifecycle_day_ledger DISABLE TRIGGER immutable");
    try { await f.admin.query("DELETE FROM app.meter_lifecycle_day_ledger WHERE computation_id=$1 AND date='2026-07-01'", [nextId]); }
    finally { await f.admin.query("ALTER TABLE app.meter_lifecycle_day_ledger ENABLE TRIGGER immutable"); }
    await expect(write(a, next.id)).rejects.toThrow("METER_PROJECTION_MISMATCH");
  });
  it("RLS prevents cross-tenant source/ledger reads and writes, absent context fails closed, runtime has no access", async () => {
    const a = await seedWorkJob(f), b = await seedWorkJob(f), s = await source(a), id = await write(a, s.id);
    expect(await days(b, id)).toEqual([]);
    await expect(write(b, s.id)).rejects.toThrow("METER_FORBIDDEN");
    await expect(workTenant(meter, b.tenantId, db => db.query(`INSERT INTO app.meter_lifecycle_day_ledger(tenant_id,scope_id,computation_id,date,source_hash,status)
      VALUES($1,$2,$3,'2026-07-05',$4,'held')`, [a.tenantId, s.scope, id, "a".repeat(64)]))).rejects.toThrow("row-level security");
    expect((await meter.query("SELECT * FROM app.meter_lifecycle_day_ledger")).rows).toEqual([]);
    await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT * FROM app.meter_lifecycle_day_ledger"))).rejects.toThrow("permission denied");
    const posture = (await f.admin.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.meter_lifecycle_day_ledger'::regclass`)).rows[0];
    expect(posture).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
