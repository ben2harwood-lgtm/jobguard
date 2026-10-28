import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finalizeMeterLifecycleOwnership } from "../src/demo-bootstrap.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { MeterTodayRepository } from "../src/meter-today-repository.js";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";

describe("MON-1 company stored-day reader (real PostgreSQL, CI)", () => {
  let f: WorkFixture;
  beforeAll(async () => {
    f = await createWorkFixture();
    // Migration-only posture fails closed until the real administrative finalizer.
    expect((await f.admin.query("SELECT prosecdef FROM pg_proc WHERE oid='app.mon1_fresh_counted_meter_today(uuid,text)'::regprocedure")).rows).toEqual([{ prosecdef: false }]);
    const admin = await f.admin.connect();
    try { await finalizeMeterLifecycleOwnership(admin); } finally { admin.release(); }
  }, 60000);
  afterAll(async () => closeWorkFixture(f));
  const read = (a: Awaited<ReturnType<typeof meterCompany>>, digest = a.digest) => new MeterTodayRepository(f.runtime).read(a.context, digest);
  async function stored(a: Awaited<ReturnType<typeof meterCompany>>, count: number, revision = 1, scope = randomUUID(), counted = true) {
    const source = randomUUID(), computation = randomUUID();
    await workTenant(f.admin, a.tenantId, async db => {
      await db.query("INSERT INTO app.meter_lifecycle_scope(tenant_id,id,kind) VALUES($1,$2,'normal_company') ON CONFLICT DO NOTHING", [a.tenantId, scope]);
      // Explicit made-up storage projection, not an activation/admission journey.
      await db.query(`INSERT INTO app.meter_lifecycle_source(tenant_id,scope_id,id,command_id,period_start,revision,expected_revision,source,source_hash,actor_membership_id)
        SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,today,$5::integer,$5::integer-1,s,encode(sha256(convert_to(s::text,'UTF8')),'hex'),$6::uuid
        FROM (SELECT today,jsonb_build_object('version','meter-lifecycle-source.v1','provenance','actual_normal_company.v1',
          'asOf',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'tenantId',$1::text,'scopeId',$2::text,'startDate',today::text,'endDateExclusive',(today+1)::text,'plan','Builder') s
          FROM (SELECT (clock_timestamp() AT TIME ZONE 'Europe/London')::date today) d) src`,
      [a.tenantId, scope, source, randomUUID(), revision, a.actorId]);
      if (!counted) return;
      await db.query(`INSERT INTO app.meter_lifecycle_computation(tenant_id,scope_id,id,source_id,source_hash,recipe_version,status)
        SELECT tenant_id,scope_id,$2,id,source_hash,'london-midnight-stops.v1','counted' FROM app.meter_lifecycle_source WHERE id=$1`, [source, computation]);
      await db.query(`INSERT INTO app.meter_lifecycle_day_ledger(tenant_id,scope_id,computation_id,date,source_hash,status,result)
        SELECT tenant_id,scope_id,$2,period_start,source_hash,'counted',jsonb_build_object('date',period_start::text,
          'places',(SELECT coalesce(jsonb_agg(jsonb_build_object('syntheticPlace',i)),'[]'::jsonb) FROM generate_series(1,$3::integer) i),
          'rawPlaces',$3::integer,'freeSmallPlaces',0,'countedPlaces',$3::integer)
        FROM app.meter_lifecycle_source WHERE id=$1`, [source, computation, count]);
    });
    return { scope, source, computation };
  }
  it("returns only its own stored numbers, rechecking persisted session and membership", async () => {
    const a = await meterCompany(f), b = await meterCompany(f);
    await stored(a, 5); await stored(b, 2);
    expect(await read(a)).toMatchObject({ version: "meter-today-read.v1", hypothetical: true, plan: "Builder", countedPlaces: 5 });
    expect(await read(b)).toMatchObject({ countedPlaces: 2 });
    await expect(read(b, a.digest)).rejects.toThrow("METER_FORBIDDEN");
    await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
    await expect(read(a)).rejects.toThrow("METER_FORBIDDEN");
    await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [b.tenantId, b.actorId]);
    await expect(read(b)).rejects.toThrow("METER_FORBIDDEN");
  });
  it("does not replace missing ledger data with zero or fall back to an older revision", async () => {
    const a = await meterCompany(f);
    await expect(read(a)).rejects.toThrow("METER_UNAVAILABLE");
    const first = await stored(a, 0); expect((await read(a)).countedPlaces).toBe(0);
    await stored(a, 9, 2, first.scope, false);
    await expect(read(a)).rejects.toThrow("METER_UNAVAILABLE");
  });
  it("MON1-J held path: a command invalidates a previously fresh counted screen source", async () => {
    const a=await meterCompany(f); await stored(a,1); expect((await read(a)).countedPlaces).toBe(1);
    await new JobWorkStateRepository(f.runtime).finish(a.context,a.jobId,a.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),action:"finish",expectedRevision:0});
    await expect(read(a)).rejects.toThrow("METER_UNAVAILABLE");
    // Retiring the legacy reader prevents a raw runtime fallback to stale data.
    expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime','app.mon1_counted_meter_today(uuid,text)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  });
  it("keeps forced RLS and table grants; the narrow routine cannot be used without tenant context", async () => {
    const a = await meterCompany(f); await stored(a, 3);
    await expect(f.runtime.query("SELECT app.mon1_fresh_counted_meter_today($1,$2)", [a.tenantId, a.digest])).rejects.toThrow("METER_FORBIDDEN");
    await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT * FROM app.meter_lifecycle_day_ledger"))).rejects.toThrow("permission denied");
    const posture = (await f.admin.query(`SELECT relrowsecurity,relforcerowsecurity,
      has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') runtime
      FROM pg_class WHERE oid='app.meter_lifecycle_day_ledger'::regclass`)).rows[0];
    expect(posture).toEqual({ relrowsecurity: true, relforcerowsecurity: true, runtime: false });
    expect((await f.admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,
      has_function_privilege('jobguard_runtime',oid,'EXECUTE') executable FROM pg_proc
      WHERE oid='app.mon1_fresh_counted_meter_today(uuid,text)'::regprocedure`)).rows[0]).toEqual({
      owner: "jobguard_meter_owner", prosecdef: true, proconfig: ["search_path=pg_catalog"], executable: true,
    });
  });
});
