import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import { randomUUID } from "node:crypto";
import { readSmallTrip } from "../src/meter-small-trip.js";
import { withTenant } from "../src/tenant-context.js";
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
async function priced(f: WorkFixture, a: WorkJob, net: number, at: string, approve = true, existing?: { variation: string; revision: string; sequence: number }, origin: "builder_logged" | "final_review" = "builder_logged") {
  const variation = existing?.variation ?? randomUUID(), revision = randomUUID(), approval = randomUUID(), scope = randomUUID(), sequence = (existing?.sequence ?? 0) + 1;
  await workTenant(f.admin, a.tenantId, async db => {
    if (!existing) {
      await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, a.tenantId, a.jobId]);
      await db.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,origin) VALUES($1,$2,$3,$4,'text','Fictional final-review extra','Fictional extra',$5)", [variation, a.tenantId, a.jobId, scope, origin]);
      if (origin === "final_review") {
        // Synthetic command parents; normal 0053 constraint/trigger enforcement.
        await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'AddFinalReviewExtra',$3,$4,'processing',$5)", [a.tenantId,variation,`extra-origin:${a.jobId}:${variation}`,CH4_HASH,a.actorId]);
        await db.query("INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_capture_kind,source_capture_hash) VALUES($1,$2,$3,'small_builder','final_review',$3,$4,'owner','command','text',$5)", [a.tenantId,a.jobId,variation,a.actorId,CH4_HASH]);
        await db.query("UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2", [a.tenantId,variation,JSON.stringify({variationId:variation})]);
      }
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

describe("MON1-T private trip foundation (source integration held MON1-I)", () => {
  let f: WorkFixture;
  beforeAll(async () => { f = await createWorkFixture(true, "jobguard_synthetic_demo"); }, 60000);
  afterAll(async () => closeWorkFixture(f));

  it.each([399999,400000,400001])("M1T-01 exact authoritative net %i crosses only above 400000p", async net => {
    const a = await activated(f), p = await priced(f, a, net - 100000, "2026-10-02T12:00:00.123456Z");
    const id = await trip(f, a, p.approval), rows = await observations(f, a);
    if (net <= 400000) { expect(id).toBeNull(); expect(rows).toEqual([]); }
    else { expect(id).toEqual(expect.any(String)); expect(rows).toEqual([expect.objectContaining({trip_id:id,net_pence:String(net),source_id:p.approval,effective_at:"2026-10-02T12:00:00.123456Z"})]); }
  });

  it("M1T-01 only latest approved revision per variation contributes at each chronological point", async () => {
    const a = await activated(f), first = await priced(f,a,100000,"2026-10-02T12:00:00Z");
    expect(await trip(f,a,first.approval)).toBeNull();
    const revised = await priced(f,a,200001,"2026-10-03T12:00:00Z",true,first);
    expect(await trip(f,a,revised.approval)).toBeNull();
    const other = await priced(f,a,100000,"2026-10-04T12:00:00Z");
    expect(await trip(f,a,other.approval)).toEqual(expect.any(String));
 await assertLp4SealedEvents(f.admin, a.tenantId, "meter.small_trip_observed");
    expect(await observations(f,a)).toEqual([expect.objectContaining({net_pence:"400001",source_id:other.approval,effective_at:"2026-10-04T12:00:00.000000Z"})]);
  });

  it("M1T-08 missing tenant-first lock is refused instead of acquiring a late lock", async () => {
    const a = await activated(f), p = await priced(f,a,300001,"2026-10-02T12:00:00Z");
    await expect(workTenant(f.admin,a.tenantId,async db=> {
      await db.query("SET LOCAL ROLE jobguard_migration");
      return db.query("SELECT app.mon1_capture_small_trip($1,$2,'variation_approval',$3)",[a.tenantId,a.jobId,p.approval]);
    })).rejects.toThrow("SMALL_TRIP_LOCK_ORDER_REQUIRED");
    expect(await observations(f,a)).toEqual([]);
  });

  it("M1T-02 approved omission and later unapproved price never restore smallness", async () => {
    const a = await activated(f), first = await priced(f,a,300001,"2026-10-02T12:00:00Z"), id = await trip(f,a,first.approval);
    const original = await observations(f,a);
    const omission = await priced(f,a,-1,"2026-10-03T12:00:00Z",true,first);
    expect(await trip(f,a,omission.approval)).toBe(id);
    await priced(f,a,0,"2026-10-04T12:00:00Z",false,omission);
    expect(await trip(f,a,omission.approval)).toBe(id);
    expect((await observations(f,a))[0]).toEqual(original[0]);
    expect((await f.admin.query("SELECT id FROM app.job_small_trip_event WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{id}]);
  });

  it("M1T-03 final-review approval can trip without any final-account draft rebuild", async () => {
    const a = await activated(f), p = await priced(f,a,300001,"2026-10-02T12:00:00Z",true,undefined,"final_review");
    expect((await f.admin.query(`SELECT v.origin, o.kind, o.provenance, o.command_id, o.raising_membership_id, o.raising_role, c.command_type, c.status, c.semantic_key
      FROM app.variation v JOIN app.extra_origin o ON (o.tenant_id,o.variation_id)=(v.tenant_id,v.id)
      JOIN app.command_receipt c ON (c.tenant_id,c.command_id)=(o.tenant_id,o.command_id)
      WHERE v.tenant_id=$1 AND v.job_id=$2 AND v.id=$3`, [a.tenantId,a.jobId,p.variation])).rows).toEqual([{
      origin:"final_review",kind:"final_review",provenance:"command",command_id:p.variation,
      raising_membership_id:a.actorId,raising_role:"owner",command_type:"AddFinalReviewExtra",status:"succeeded",
      semantic_key:`extra-origin:${a.jobId}:${p.variation}`,
    }]);
    expect(await trip(f,a,p.approval)).toEqual(expect.any(String));
    expect(await observations(f,a)).toEqual([expect.objectContaining({net_pence:"400001",source_id:p.approval,effective_at:"2026-10-02T12:00:00.000000Z"})]);
    expect((await f.admin.query("SELECT id FROM app.final_account_draft WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([]);
  });

  it("M1T-04 draft, priced, rejected and withdrawn proposals supply no approval fact", async () => {
    const a = await activated(f);
    for (const state of ["draft","priced","rejected","withdrawn"]) {
      const p = await priced(f,a,900000,"2026-10-02T12:00:00Z",false);
      if (state === "withdrawn") await f.admin.query("INSERT INTO app.variation_withdrawal(tenant_id,job_id,id,variation_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,$5,'builder_withdrawn')",[a.tenantId,a.jobId,randomUUID(),p.variation,a.actorId]);
      else await f.admin.query("UPDATE app.variation SET state=$1 WHERE tenant_id=$2 AND id=$3",[state,a.tenantId,p.variation]);
    }
    expect(await workTenant(f.admin,a.tenantId,db=>capture(db,a,a.activation,"activation"))).toBeNull();
    expect(await observations(f,a)).toEqual([]);
  });

  it("M1T-05 delayed earlier approval preserves event and appends one observation at original microsecond time", async () => {
    const a = await activated(f), later = await priced(f,a,300001,"2026-10-04T12:00:00.000002Z"), id = await trip(f,a,later.approval);
    const event = (await f.admin.query("SELECT row_to_json(t)::text bytes FROM app.job_small_trip_event t WHERE id=$1",[id])).rows;
    const original = await observations(f,a);
    const earlier = await priced(f,a,300001,"2026-10-02T12:00:00.000001Z");
    expect(await trip(f,a,earlier.approval)).toBe(id);
    expect(await trip(f,a,earlier.approval)).toBe(id);
    const rows = await observations(f,a);
    expect(rows).toHaveLength(2); expect(rows[0]).toEqual(original[0]);
    expect(rows[1]).toMatchObject({trip_id:id,revision:2,previous_observation_id:rows[0]!.id,effective_at:"2026-10-02T12:00:00.000001Z",net_pence:"400001"});
    expect((await f.admin.query("SELECT row_to_json(t)::text bytes FROM app.job_small_trip_event t WHERE id=$1",[id])).rows).toEqual(event);
  });

  it("M1T-07 post-lock approval cannot create a trip", async () => {
    const a = await activated(f), p = await priced(f,a,300001,"2099-10-02T12:00:00Z");
    await boundaryLock(f,a);
    await expect(trip(f,a,p.approval)).rejects.toThrow("INVALID_SMALL_TRIP_SOURCE"); expect(await observations(f,a)).toEqual([]);
  });

  it("M1T-05 a late earlier omission that invalidates the derivation holds without restoring smallness", async () => {
    const a = await activated(f), later = await priced(f,a,300001,"2026-10-04T12:00:00.000002Z"), id = await trip(f,a,later.approval);
    const original = await observations(f,a);
    const earlier = await priced(f,a,-1,"2026-10-02T12:00:00.000001Z");
    await expect(trip(f,a,earlier.approval)).rejects.toThrow("SMALL_TRIP_RECONCILIATION_REQUIRED");
    expect(await observations(f,a)).toEqual(original);
    expect((await f.admin.query("SELECT id FROM app.job_small_trip_event WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{id}]);
  });

  it("M1T-04 M1T-07 price, payment and catch source kinds cannot create a trip", async () => {
    const a = await activated(f), p = await priced(f,a,300001,"2026-10-02T12:00:00Z");
    for (const kind of ["variation_revision","payment","jobguard_catch"]) {
      await expect(workTenant(f.admin,a.tenantId,db=>capture(db,a,p.approval,kind))).rejects.toThrow("INVALID_SMALL_TRIP_SOURCE");
    }
    expect(await observations(f,a)).toEqual([]);
  });

  it("M1T-08 tenant/job/source mismatches and absent source are refused without rows", async () => {
    const a = await activated(f), b = await activated(f), p = await priced(f,b,300001,"2026-10-02T12:00:00Z");
    await expect(trip(f,a,p.approval)).rejects.toThrow();
    await expect(trip(f,a,randomUUID())).rejects.toThrow();
    await expect(workTenant(f.admin,b.tenantId,db=>capture(db,a,p.approval))).rejects.toThrow();
    expect(await observations(f,a)).toEqual([]); expect(await observations(f,b)).toEqual([]);
  });


  it("M1T-05 M1T-08 read helper returns latest source revision in an authenticated tenant transaction", async () => {
    const a = await activated(f), b = await activated(f);
    expect(await withTenant(f.runtime,a.context,db=>readSmallTrip(db,a.jobId))).toBeNull();
    const later = await priced(f,a,300001,"2026-10-04T12:00:00.000002Z"), id = await trip(f,a,later.approval);
    const first = await withTenant(f.runtime,a.context,db=>readSmallTrip(db,a.jobId));
    expect(first).toMatchObject({version:"meter-small-trip.v1",tripId:id,jobId:a.jobId,revision:1,netPence:400001,effectiveAt:"2026-10-04T12:00:00.000002Z",sourceId:later.approval});
    const earlier = await priced(f,a,300001,"2026-10-02T12:00:00.000001Z"); await trip(f,a,earlier.approval);
    expect(await withTenant(f.runtime,a.context,db=>readSmallTrip(db,a.jobId))).toMatchObject({tripId:id,revision:2,previousObservationId:first!.observationId,effectiveAt:"2026-10-02T12:00:00.000001Z",sourceId:earlier.approval});
    expect(await withTenant(f.runtime,b.context,db=>readSmallTrip(db,a.jobId))).toBeNull();
    await expect(withTenant(f.runtime,a.context,db=>readSmallTrip(db,"not-a-job"))).rejects.toMatchObject({code:"INVALID_SMALL_TRIP_INPUT"});
  });

  it("M1T-08 runtime cannot execute private capture, write trip rows, or override amount/time", async () => {
    const a = await activated(f), p = await priced(f,a,300001,"2026-10-02T12:00:00Z");
    await expect(workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.mon1_capture_small_trip($1,$2,'variation_approval',$3)",[a.tenantId,a.jobId,p.approval]))).rejects.toMatchObject({code:"42501"});
    const signature = "app.mon1_capture_small_trip(uuid,uuid,text,uuid)";
    expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[signature])).rows).toEqual([{allowed:false}]);
    for (const table of ["job_small_trip_event","job_small_trip_observation"]) {
      expect((await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
      for(const action of ["INSERT","UPDATE","DELETE","TRUNCATE"]) expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,$2) allowed",[`app.${table}`,action])).rows).toEqual([{allowed:false}]);
    }
    expect((await f.admin.query("SELECT pronargs FROM pg_proc WHERE oid=$1::regprocedure",[signature])).rows).toEqual([{pronargs:4}]);
    expect(await trip(f,a,p.approval)).toEqual(expect.any(String));
    expect((await f.runtime.query("SELECT id FROM app.job_small_trip_event")).rows).toEqual([]);
    expect((await workTenant(f.runtime,randomUUID(),db=>db.query("SELECT id FROM app.job_small_trip_event"))).rows).toEqual([]);
  });
});
