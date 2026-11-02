import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, seedWorkJob, workTenant, boundaryLock, CH4_HASH, type WorkFixture, type WorkJob } from "./job-work-state-fixtures.js";

// Private-seam foundation evidence only. MON1-I owns real source command wiring.
// Replica mode is confined to activation's pre-existing FK/trigger fixture; the
// routine, trip storage and qualifying approval inserts use normal enforcement.
async function activated(f: WorkFixture) {
  const a = await seedWorkJob(f), activation = randomUUID(), baseline = randomUUID();
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')", [baseline,a.tenantId,a.jobId,CH4_HASH]);
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING",[a.tenantId,a.jobId]);
    await db.query("INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at) VALUES($1,$2,$3,$4,1,$5,'synthetic_demo','synthetic_demo_activation.v3','reference_fee_policy_v3',$6,'2026-10-01T00:00:00.000001Z')",[activation,a.tenantId,a.jobId,baseline,CH4_HASH,a.actorId]);
    await db.query(`INSERT INTO app.job_activation_terms(id,tenant_id,job_id,activation_id,baseline_quote_version_id,baseline_document_version,baseline_document_hash,accepted_net_pence,highest_sent_net_pence,small_job,policy_version,commercial_track,trial_plan_context,activated_at)
      VALUES($1,$2,$3,$4,$5,1,$6,100000,100000,true,'reference_fee_policy_v3','small_builder','none_recorded_pre_mon2a','2026-10-01T00:00:00.000001Z')`, [randomUUID(), a.tenantId, a.jobId, activation, baseline, CH4_HASH]);
    await db.query("SET LOCAL session_replication_role='origin'");
  });
  return { ...a, activation, baseline };
}
async function priced(f: WorkFixture, a: WorkJob, net: number, at: string, approve = true, existing?: { variation: string; revision: string; sequence: number }, origin = "builder_logged") {
  const variation = existing?.variation ?? randomUUID(), revision = randomUUID(), approval = randomUUID(), scope = randomUUID(), sequence = (existing?.sequence ?? 0) + 1;
  await workTenant(f.admin, a.tenantId, async db => {
    if (!existing) {
      await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, a.tenantId, a.jobId]);
      await db.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,origin) VALUES($1,$2,$3,$4,'text','Fictional final-review extra','Fictional extra',$5)", [variation, a.tenantId, a.jobId, scope, origin]);
    }
    const identity = (await db.query("SELECT scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2", [a.tenantId, variation])).rows[0]!.scope_item_id;
    await db.query(`INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,previous_revision_id,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,'Fictional approved amount','1','each',$8,$9,$10,$11,'human_entered','fixture://mon1-t',$10,'synthetic.v1')`, [revision, a.tenantId, a.jobId, variation, identity, sequence, existing?.revision ?? null, Math.abs(net), net, CH4_HASH, a.actorId]);
    if (approve) await db.query(`INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'builder_attestation',$9,'1999-01-01',$10)`, [approval, a.tenantId, a.jobId, variation, revision, sequence, CH4_HASH, net, a.actorId, at]);
  });
  return { variation, revision, approval, sequence };
}
async function capture(db: PoolClient, a: WorkJob, source: string, kind = "variation_approval") {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,184))", [a.tenantId]);
  await db.query("SET LOCAL ROLE jobguard_migration");
  return (await db.query("SELECT app.mon1_capture_small_trip($1,$2,$3,$4) id", [a.tenantId, a.jobId, kind, source])).rows[0]!.id as string | null;
}
async function trip(f: WorkFixture, a: WorkJob, source: string) {
  return workTenant(f.admin, a.tenantId, db => capture(db, a, source));
}
async function observations(f: WorkFixture, a: WorkJob) {
  return (await f.admin.query(`SELECT id,trip_id,revision,previous_observation_id,net_pence::text,source_id,source_hash,to_char(effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') effective_at FROM app.job_small_trip_observation WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision`, [a.tenantId, a.jobId])).rows;
}

async function approveSource(db: PoolClient, a: WorkJob, p: {approval:string;variation:string;revision:string;sequence:number}, net: number, at: string) {
  await db.query(`INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'builder_attestation',$9,'1999-01-01',$10)`,[p.approval,a.tenantId,a.jobId,p.variation,p.revision,p.sequence,CH4_HASH,net,a.actorId,at]);
}

describe("MON1-T private seam race and transactional guarantees", () => {
  let f: WorkFixture;
  beforeAll(async () => { f = await createWorkFixture(); }, 60000);
  afterAll(async () => closeWorkFixture(f));

  it("M1T-06 overlapping authoritative approval INSERT plus capture transactions serialize to one trip", async () => {
    const a = await activated(f), first = await priced(f,a,300001,"2026-10-02T12:00:00.000001Z",false), second = await priced(f,a,300001,"2026-10-03T12:00:00Z",false);
    async function deliver(p: typeof first, at: string) {
      return workTenant(f.admin,a.tenantId,async db=> {
        // Source owner locks tenant BEFORE source/business locks, as MON1-I must.
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,184))",[a.tenantId]);
        await approveSource(db,a,p,300001,at);
        return capture(db,a,p.approval);
      });
    }
    const ids = await Promise.all([deliver(first,"2026-10-02T12:00:00.000001Z"),deliver(second,"2026-10-03T12:00:00Z")]);
    expect(ids[0]).toEqual(expect.any(String)); expect(ids[1]).toBe(ids[0]);
    const before = await observations(f,a);
    expect(await Promise.all([trip(f,a,first.approval),trip(f,a,second.approval)])).toEqual(ids);
    expect(await observations(f,a)).toEqual(before);
    // If the later source won the tenant lock, the earlier source appends a
    // second observation; both execution orders preserve one stable event.
    expect(before.length).toBeGreaterThanOrEqual(1); expect(before.length).toBeLessThanOrEqual(2);
    expect(before.at(-1)).toMatchObject({effective_at:"2026-10-02T12:00:00.000001Z"});
    expect((await f.admin.query("SELECT id FROM app.job_small_trip_event WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{id:ids[0]}]);
  });

  it("M1T-06 failed transaction rolls back trip, observation and audit changes together", async () => {
    const a = await activated(f), p = await priced(f,a,300001,"2026-10-02T12:00:00Z",false);
    const audit = (await f.admin.query("SELECT row_to_json(t)::text bytes FROM app.audit_event t WHERE tenant_id=$1 ORDER BY sequence",[a.tenantId])).rows;
    await expect(workTenant(f.admin,a.tenantId,async db => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,184))",[a.tenantId]);
      await approveSource(db,a,p,300001,"2026-10-02T12:00:00Z");
      expect(await capture(db,a,p.approval)).toEqual(expect.any(String));
      throw new Error("synthetic source transaction failure");
    })).rejects.toThrow("synthetic source transaction failure");
    expect(await observations(f,a)).toEqual([]);
    expect((await f.admin.query("SELECT id FROM app.job_small_trip_event WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([]);
    expect((await f.admin.query("SELECT row_to_json(t)::text bytes FROM app.audit_event t WHERE tenant_id=$1 ORDER BY sequence",[a.tenantId])).rows).toEqual(audit);
    expect((await f.admin.query("SELECT id FROM app.variation_approval WHERE tenant_id=$1 AND id=$2",[a.tenantId,p.approval])).rows).toEqual([]);
  });

  it.each(["lock_first","approval_first"])("M1T-07 tenant-first serialized %s foundation transactions", async order => {
    const a = await activated(f), p = await priced(f,a,300001,"2026-10-02T12:00:00Z",false);
    const first = await f.admin.connect(), second = await f.admin.connect();
    async function fixtureLock(db: PoolClient) {
      // Existing SV-4 lock command authority is held. This is its storage boundary.
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query(`INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
        VALUES($1,$2,$3,$4,$5,$6,$6,$6,$6,'{}','I''ve reviewed the work and extras on this job and this is my complete final account.','final_account_declaration.v1','synthetic_final_check_terms.v1',$7,clock_timestamp(),$8,$9)`,[a.tenantId,a.jobId,randomUUID(),randomUUID(),a.baseline,CH4_HASH,a.actorId,randomUUID(),randomUUID()]);
      await db.query("SET LOCAL session_replication_role='origin'");
    }
    try {
      for(const db of [first,second]) { await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]); }
      await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,184))",[a.tenantId]);
      let id: string | null = null;
      if (order === "lock_first") await fixtureLock(first);
      else { await approveSource(first,a,p,300001,"2026-10-02T12:00:00.000001Z"); id = await capture(first,a,p.approval); }
      // Send the second lock request before first commits, making the overlap
      // deterministic without wall-clock sleeps or an extra worker process.
      const waiting = second.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,184))",[a.tenantId]);
      await first.query("COMMIT"); await waiting;
      if (order === "lock_first") {
        await approveSource(second,a,p,300001,(await second.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') at")).rows[0]!.at as string);
        await expect(capture(second,a,p.approval)).rejects.toThrow("INVALID_SMALL_TRIP_SOURCE");
        await second.query("ROLLBACK");
        expect(await observations(f,a)).toEqual([]);
      } else {
        await fixtureLock(second); await second.query("COMMIT");
        expect(await trip(f,a,p.approval)).toBe(id);
        expect(await observations(f,a)).toHaveLength(1);
      }
    } finally {
      await first.query("ROLLBACK"); await second.query("ROLLBACK"); first.release(); second.release();
    }
  });

  it("M1T-07 pre-lock authoritative approval captured after lock keeps its original time", async () => {
    const a = await activated(f), p = await priced(f,a,300001,"2026-10-02T12:00:00.000001Z");
    await boundaryLock(f,a);
    expect(await trip(f,a,p.approval)).toEqual(expect.any(String));
    expect(await observations(f,a)).toEqual([expect.objectContaining({effective_at:"2026-10-02T12:00:00.000001Z"})]);
  });

  it("M1T-06 concurrent late deliveries append exactly one immutable earlier derivation", async () => {
    const a = await activated(f), later = await priced(f,a,300001,"2026-10-04T12:00:00Z"), id = await trip(f,a,later.approval);
    const earlier = await priced(f,a,300001,"2026-10-02T12:00:00Z");
    expect(await Promise.all([trip(f,a,earlier.approval),trip(f,a,earlier.approval)])).toEqual([id,id]);
    const rows = await observations(f,a); expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({revision:2,previous_observation_id:rows[0]!.id});
    for(const table of ["job_small_trip_event","job_small_trip_observation"]) {
      await expect(workTenant(f.admin,a.tenantId,db=>db.query(`UPDATE app.${table} SET net_pence=0 WHERE tenant_id=$1`,[a.tenantId]))).rejects.toThrow();
      await expect(workTenant(f.admin,a.tenantId,db=>db.query(`DELETE FROM app.${table} WHERE tenant_id=$1`,[a.tenantId]))).rejects.toThrow();
    }
    expect(await observations(f,a)).toEqual(rows);
  });
});
