import { snapshotRows } from "./upgrade-proof-utils.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cluster, type Cluster } from "./contractor-entitlement-fixtures.js";
import { command, historicalAgreement, meterCompany, terms } from "./subscription-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 120000);
afterAll(async () => { await c?.close(); });
// These existing fixture functions only use the real admin/runtime pools. This
// cluster deliberately names the database jobguard_synthetic_demo, as MON-8 requires.
const pools = () => c as unknown as WorkFixture;
const read = (a: Awaited<ReturnType<typeof meterCompany>>, feature = "invoices") => workTenant(c.runtime, a.tenantId,
  async db => (await db.query("SELECT app.mon8_company_feature($1,$2,NULL) decision", [a.digest, feature])).rows[0].decision, { membershipId: a.actorId, bindRequest: false });
it("MON-8 missing persisted trial authority refuses; an effective signed subscription supplies the plan", async () => {
  const a = await meterCompany(pools());
  expect(await read(a)).toMatchObject({ entitlement: "held", executable: false });
  await command(pools(), a, terms(a, "Solo"));
  expect(await read(a)).toMatchObject({ entitlement: "included", executable: true });
  for (const feature of ["operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"]) {
    expect(await read(a, feature)).toMatchObject({ entitlement: "excluded", executable: false });
  }
  for (const feature of ["pay_now", "accounting_export"]) expect(await read(a, feature)).toMatchObject({ executable: false, reason: "feature_disabled" });
});
it("MON-8 Solo and Builder have identical feature decisions across upgrades and pending downgrades", async () => {
  const a = await meterCompany(pools()); await historicalAgreement(pools(), a, "Solo", "2000-01-01");
  const features = ["watchdog", "final_check", "invoices", "recovery_cases", "pay_now", "accounting_export", "operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"];
  const solo = await Promise.all(features.map(feature => read(a, feature)));
  await command(pools(), a, { ...terms(a, "Builder", 1), kind: "change" });
  expect(await Promise.all(features.map(feature => read(a, feature)))).toEqual(solo);
  await command(pools(), a, { ...terms(a, "Solo", 2), kind: "change" });
  expect(await Promise.all(features.map(feature => read(a, feature)))).toEqual(solo);
});
it("MON-8 effective-date boundary excludes a future-only agreement and includes today's agreement", async () => {
  const a = await meterCompany(pools()); await command(pools(), a, terms(a));
  await workTenant(c.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.subscription_agreement_revision SET effective_date=(clock_timestamp() AT TIME ZONE 'Europe/London')::date+1 WHERE tenant_id=$1", [a.tenantId]);
  }, { membershipId: a.actorId });
  expect(await read(a)).toMatchObject({ executable: false });
  await workTenant(c.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.subscription_agreement_revision SET effective_date=(clock_timestamp() AT TIME ZONE 'Europe/London')::date WHERE tenant_id=$1", [a.tenantId]);
  }, { membershipId: a.actorId });
  expect(await read(a)).toMatchObject({ executable: true });
});
it("MON-8 foreign, revoked and stale sessions cannot reuse a previous result", async () => {
  const a = await meterCompany(pools()), b = await meterCompany(pools()); await command(pools(), a, terms(a));
  expect((await read(a)).executable).toBe(true);
  const before=await snapshotRows(c.admin);
  await expect(read({ ...a, digest: b.digest })).rejects.toMatchObject({code:"42501",message:"REQUEST_BINDING_REFUSED"});
  expect(await snapshotRows(c.admin)).toEqual(before);
  await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
  await expect(read(a)).rejects.toThrow("METER_FORBIDDEN");
});
it("MON-8 a subscription boundary change during a lock wait invalidates an earlier available plan", async () => {
  const a = await meterCompany(pools());await command(pools(),a,terms(a));
  const writer=await c.admin.connect();let pending:Promise<unknown>|undefined;
  try {
    await writer.query("BEGIN");await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))",[a.tenantId]);
    pending=read(a);
    let waiting=false;
    for(let i=0;i<200;i++){
      waiting=(await c.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) waiting")).rows[0].waiting;
      if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
    }
    expect(waiting).toBe(true);
    await writer.query("SET LOCAL session_replication_role='replica'");
    await writer.query("UPDATE app.subscription_agreement_revision SET effective_date=(clock_timestamp() AT TIME ZONE 'Europe/London')::date+1 WHERE tenant_id=$1",[a.tenantId]);
    await writer.query("COMMIT");
    expect(await pending).toMatchObject({executable:false});
  }finally{await writer.query("ROLLBACK");writer.release();await pending;}
});
it("MON-8 a bound read serializes before session revocation during subscription lock contention", async () => {
  const a=await meterCompany(pools());await command(pools(),a,terms(a));
  const before=await snapshotRows(c.admin),writer=await c.admin.connect(),revoker=await c.admin.connect();
  let pending:ReturnType<typeof read>|undefined,revocation:Promise<unknown>|undefined;
  const blocked=async(pid:number)=>{
    for(let i=0;i<200;i++){
      const row=(await c.admin.query("SELECT pid FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))",[pid])).rows[0];
      if(row)return Number(row.pid);
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error("Expected PostgreSQL lock wait");
  };
  try {
    await writer.query("BEGIN");await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))",[a.tenantId]);
    const writerPid=Number((await writer.query("SELECT pg_backend_pid() pid")).rows[0].pid);
    pending=read(a);void pending.catch(()=>undefined);
    const readerPid=await blocked(writerPid);
    await revoker.query("BEGIN");
    const revokerPid=Number((await revoker.query("SELECT pg_backend_pid() pid")).rows[0].pid);
    revocation=revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
    void revocation.catch(()=>undefined);
    // 1217 binds the session before waiting for subscription authority. Its
    // SHARE lock makes a later revocation wait until this request commits.
    expect(await blocked(readerPid)).toBe(revokerPid);
    await writer.query("COMMIT");
    expect(await pending).toMatchObject({executable:true});
    await revocation;
    expect(await snapshotRows(c.admin)).toEqual(before);
    await revoker.query("COMMIT");
    const revoked=await snapshotRows(c.admin);
    for(let replay=0;replay<2;replay++)await expect(read(a)).rejects.toThrow("METER_FORBIDDEN");
    expect(await snapshotRows(c.admin)).toEqual(revoked);
  }finally{
    await writer.query("ROLLBACK");await pending?.catch(()=>undefined);
    await revocation?.catch(()=>undefined);await revoker.query("ROLLBACK");
    writer.release();revoker.release();
  }
});
