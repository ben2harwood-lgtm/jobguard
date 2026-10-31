import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, seedWorkJob, workTenant, CH4_HASH, type WorkFixture, type WorkJob } from "./job-work-state-fixtures.js";

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

const own = "0208_meter_small_trip.sql";
describe("MON1-T own-migration upgrade proof", () => {
  let f: WorkFixture;
  beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
  afterAll(async () => closeWorkFixture(f));
  it("M1T-10 populated predecessor preservation, migration N alone and every successor twice", async () => {
    const n = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(own)); expect(n).toBeGreaterThan(0);
    await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    for(const url of MIGRATION_URLS.slice(0,n)) {
      await f.admin.query(await readFile(url,"utf8"));
      await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split('/').at(-1)]);
    }
    await installLegacySyntheticPartyFixtures(f.admin);
    const a = await activated(f), p = await priced(f,a,300001,"2026-10-02T12:00:00.123456Z");
    const before = await proofBefore(f.admin,["app.account","app.membership","app.job","app.quote_version","app.job_activation","app.job_activation_terms","app.variation","app.variation_revision","app.variation_approval"]);
    for(const table of Object.values(before)) expect(Object.keys(table.rows).length).toBeGreaterThan(0);
    const acl = (await f.admin.query("SELECT oid,relacl::text FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid")).rows;
    const policies = (await f.admin.query("SELECT schemaname,tablename,policyname,permissive,roles::text[],cmd,qual,with_check FROM pg_policies WHERE schemaname='app' ORDER BY tablename,policyname")).rows;
    await f.admin.query(await readFile(MIGRATION_URLS[n]!,"utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
    expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
    expect((await f.admin.query("SELECT oid,relacl::text FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid",[acl.map(row=>row.oid)])).rows).toEqual(acl);
    expect((await f.admin.query("SELECT schemaname,tablename,policyname,permissive,roles::text[],cmd,qual,with_check FROM pg_policies WHERE schemaname='app' AND tablename=ANY($1::text[]) ORDER BY tablename,policyname",[[...new Set(policies.map(row=>row.tablename))]])).rows).toEqual(policies);
    const id = await trip(f,a,p.approval); expect(id).toEqual(expect.any(String));
    const ownRows = await proofBefore(f.admin,["app.job_small_trip_event","app.job_small_trip_observation"]);
    await migrate(f.admin); await migrate(f.admin);
    expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
    expect(await proofDifferences(f.admin,ownRows)).toEqual({rows:[],types:[]});
    expect(await trip(f,a,p.approval)).toBe(id); expect(await observations(f,a)).toHaveLength(1);
    // Comparator controls prove byte/type/deletion damage is detected while
    // additive successor columns, rows and function replacements are allowed.
    for(const sql of ["UPDATE app.job SET created_at=created_at+interval '1 microsecond'","ALTER TABLE app.job ALTER COLUMN title TYPE text","DELETE FROM app.job"]) {
      await rolledBack(f.admin,async db=> { await db.query("SET LOCAL session_replication_role='replica'"); await db.query(sql); expect(await proofDifferences(db,before)).not.toEqual({rows:[],types:[]}); });
    }
    await rolledBack(f.admin,async db=> {
      await db.query("ALTER TABLE app.job ADD COLUMN mon1t_successor_nullable text");
      await db.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional successor')",[randomUUID(),a.tenantId]);
      await db.query("CREATE OR REPLACE FUNCTION app.mon1t_successor_control() RETURNS integer LANGUAGE sql AS 'SELECT 2'");
      expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]});
    });
  });
});
