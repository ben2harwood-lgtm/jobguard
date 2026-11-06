import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectShadowObservations, parseObservation, type Observation } from "@jobguard/core";
import { ShadowDetectionRepository } from "../src/shadow-detection-repository.js";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { freePort, closeTestPools, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

/* MIGFIX-7: group disclosure, real PostgreSQL 16, actual logins. */
const T = randomUUID(), O = randomUUID(), M = randomUUID(), U = randomUUID(), L = randomUUID();
const at = "2026-10-01T00:00:00Z", credential = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, shadow: Pool, emergency: Pool, directory: string, port: number;
const pool = (user: string) => new Pool({ host: "127.0.0.1", port, database: "postgres", user, password: credential, max: 4 });
const ctx = (tenant = T) => testTenantContext(tenant);
async function tenantTx<R>(p: Pool, tenant: string, work: (db: PoolClient) => Promise<R>) {
  const db = await p.connect();
  try { await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]); const r = await work(db); await db.query("COMMIT"); return r; }
  catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}
const newJob = async (tenant = T) => {
  const job = randomUUID();
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional MIGFIX-7 job','live')", [job, tenant]);
  await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING", [tenant, job]);
  return job;
};
async function evidence(o: Observation) {
  await tenantTx(admin, o.tenantId, async db => {
    const upload = randomUUID();
    await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
     VALUES($1,$2,$3,$4,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day')`, [upload, o.tenantId, o.jobId, `synthetic/${upload}`, o.evidence.sha256]);
    await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
     VALUES($1,$2,$3,$4,'original','completion_photo',$5,$6,$7,100,'image/png','standard_evidence',$8,$8)`, [o.evidence.id, o.tenantId, upload, o.jobId, `synthetic/${upload}`, o.evidence.objectVersionId, o.evidence.sha256, o.evidence.serverReceivedAt]);
  });
}
const observation = (job: string, workReference: string, kind: Observation["kind"] = "completion_photo", safety = false, tenant = T): Observation => parseObservation({
  version: "observation.v1", tenantId: tenant, jobId: job, kind, evidence: { id: randomUUID(), objectVersionId: "synthetic-v1", sha256: "a".repeat(64), serverReceivedAt: at },
  text: "Fitted outside tap.", citations: [{ start: 0, end: 19, quote: "Fitted outside tap." }],
  facts: { workReference, scopeArea: "job", description: "outside tap", status: "completed", estimatedValuePence: null, safetyImplication: safety, customerClearlyRequested: false,
    needsPriorWrittenAgreement: false, significantWork: null, activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false } });
const batch = (job: string, observations: readonly Observation[]) => ({ version: "shadow-detection-batch.v1", jobId: job, observations, captures: [], proposals: detectShadowObservations(observations, [], at) });
/** A persisted group of three coalescing observations: one survivor, two duplicates. */
async function group(job: string) {
  const ref = randomUUID(), obs = (["customer_request", "note_or_voice", "completion_photo"] as const).map(k => observation(job, ref, k));
  for (const o of obs) await evidence(o);
  await new ShadowDetectionRepository(shadow).persist(ctx(), batch(job, obs));
  const rows = (await admin.query("SELECT id,coalesced_into_signal_id FROM app.shadow_commercial_signal WHERE job_id=$1", [job])).rows;
  return { survivor: rows.find(r => r.coalesced_into_signal_id === null).id as string, dups: rows.filter(r => r.coalesced_into_signal_id !== null).map(r => r.id as string), ids: rows.map(r => r.id as string) };
}
const insertSignal = (job: string, mandatory = false, tenant = T) => {
  const id = randomUUID();
  return withTenant(shadow, ctx(tenant), db => db.$client.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,must_surface_now)
   VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:migfix7',$4,'outside tap','low',$5)`, [tenant, job, id, at, mandatory])).then(() => id);
};
const disclose = (signal: string, job: string, event = randomUUID(), p: Pool = emergency) =>
  withTenant(p, ctx(), db => db.$client.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'support_conversation') AS id", [T, job, signal, event])).then(r => ({ id: r.rows[0].id as string, event }));
const state = async (ids: string[]) => (await admin.query("SELECT id,state,disclosed_before_lock,first_builder_visible_at FROM app.shadow_commercial_signal WHERE id=ANY($1::uuid[]) ORDER BY id", [ids])).rows;
const reasons = async (id: string) => (await admin.query("SELECT DISTINCT reason FROM app.shadow_signal_ineligibility WHERE signal_id=$1 ORDER BY reason", [id])).rows.map(r => r.reason as string);
async function lockJob(job: string, tenant = T) {
  await tenantTx(admin, tenant, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query(`INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
     VALUES($1,$2,$3,$4,$5,$6,$6,$6,$6,'{}','I''ve reviewed the work and extras on this job and this is my complete final account.','final_account_declaration.v1','synthetic_final_check_terms.v1',$7,clock_timestamp(),$8,$9)`,
      [tenant, job, randomUUID(), randomUUID(), randomUUID(), "b".repeat(64), M, randomUUID(), randomUUID()]);
  });
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const pending = async (p: Promise<unknown>) => { const flag = { done: false }; p.then(() => { flag.done = true; }, () => { flag.done = true; }); await sleep(400); return !flag.done; };
describe("MIGFIX-7 real PostgreSQL group disclosure", () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "migfix7-pg16-")); port = await freePort(58700, 200);
    postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
    await postgres.initialise(); await postgres.start(); admin = pool("postgres"); await migrate(admin);
    await installLegacySyntheticPartyFixtures(admin);
    for (const tenant of [T, O]) await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [U]); const a = randomUUID();
    await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic MIGFIX-7')", [a, T]);
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [M, T, a, U]);
    await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional no-terms job','live')", [L, O]);
    await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING", [O, L]);
    for (const [login, role] of [["m7_runtime", "jobguard_runtime"], ["m7_shadow", "jobguard_shadow"], ["m7_emergency", "jobguard_shadow_emergency_access"]])
      await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT ${role} TO ${login}`);
    runtime = pool("m7_runtime"); shadow = pool("m7_shadow"); emergency = pool("m7_emergency");
    await withTenant(runtime, ctx(), db => db.$client.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)", [T, M, randomUUID(), "synthetic_final_check_terms.v1"]));
  }, 120000);
  afterAll(async () => { await closeTestPools(runtime, shadow, emergency, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

  it("disclosure of a coalesced duplicate excludes its survivor (and its sibling) permanently, with one replay-safe effect", async () => {
    const job = await newJob(), g = await group(job), dup = g.dups[0]!;
    expect(g.dups).toHaveLength(2);
    const first = await disclose(dup, job);
    const rows = await state(g.ids);
    expect(rows.every(r => r.disclosed_before_lock && r.state === "surfaced_early" && r.first_builder_visible_at)).toBe(true);
    for (const id of g.ids) expect(await reasons(id)).toEqual(["disclosed_before_lock", "surfaced_early"]);
    const visible = (await admin.query("SELECT first_builder_visible_at v,(SELECT created_at FROM app.shadow_disclosure_event WHERE id=$1) c FROM app.shadow_commercial_signal WHERE id=$2", [first.event, g.survivor])).rows[0];
    expect(visible.v.getTime()).toBe(visible.c.getTime());
    const effects = async () => (await admin.query("SELECT (SELECT count(*)::int FROM app.shadow_disclosure_event WHERE job_id=$1) e,(SELECT count(*)::int FROM app.shadow_signal_ineligibility WHERE job_id=$1) i,(SELECT count(*)::int FROM app.audit_event WHERE event_type='shadow.disclosed' AND subject_ref=$1::text) a", [job])).rows[0];
    const before = await effects();
    expect((await disclose(dup, job, first.event)).id).toBe(first.event); expect(await effects()).toEqual(before);
    await expect(disclose(g.survivor, job, first.event)).rejects.toMatchObject({ code: "23505" });
    // Disclosing the survivor again later: monotonic first-visible time, same permanent exclusions.
    await disclose(g.survivor, job);
    expect((await state(g.ids)).map(r => r.first_builder_visible_at.getTime())).toEqual(rows.map(r => r.first_builder_visible_at.getTime()));
    for (const id of g.ids) expect(await reasons(id)).toEqual(["disclosed_before_lock", "surfaced_early"]);
  });

  it("disclosure racing coalescence cannot lose provenance: both commit orders give the same permanent group exclusions", async () => {
    // Order 1: coalescing transaction holds the detection key and commits first; the disclosure waits behind it.
    const job1 = await newJob(), a1 = await insertSignal(job1), b1 = await insertSignal(job1);
    const coalescer = await shadow.connect();
    await coalescer.query("BEGIN"); await coalescer.query("SELECT set_config('app.tenant_id',$1,true)", [T]);
    await coalescer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`shadow-detection:${T}:${job1}`]);
    await coalescer.query("UPDATE app.shadow_commercial_signal SET state='reconciled',outcome='duplicate_signal',coalesced_into_signal_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2", [T, b1, a1]);
    const racing = disclose(b1, job1);
    try { expect(await pending(racing)).toBe(true); }
    finally { await coalescer.query("COMMIT"); coalescer.release(); }
    await racing;
    for (const id of [a1, b1]) expect(await reasons(id)).toEqual(["disclosed_before_lock", "surfaced_early"]);
    expect((await state([a1, b1])).every(r => r.disclosed_before_lock && r.first_builder_visible_at)).toBe(true);
    // Order 2: the survivor's disclosure holds the key and commits first; the coalescing transaction then runs.
    const job2 = await newJob(), a2 = await insertSignal(job2), b2 = await insertSignal(job2);
    const discloser = await emergency.connect();
    await discloser.query("BEGIN"); await discloser.query("SELECT set_config('app.tenant_id',$1,true)", [T]);
    await discloser.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'support_conversation')", [T, job2, a2, randomUUID()]);
    const coalescing = tenantTx(shadow, T, async db => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`shadow-detection:${T}:${job2}`]);
      await db.query("UPDATE app.shadow_commercial_signal SET state='reconciled',outcome='duplicate_signal',coalesced_into_signal_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2", [T, b2, a2]);
    });
    try { expect(await pending(coalescing)).toBe(true); }
    finally { await discloser.query("COMMIT"); discloser.release(); }
    await coalescing;
    for (const id of [a2, b2]) expect(await reasons(id)).toEqual(["disclosed_before_lock", "surfaced_early"]);
    const rows = await state([a2, b2]);
    expect(rows.every(r => r.disclosed_before_lock && r.first_builder_visible_at && r.state === "surfaced_early")).toBe(true);
    expect(rows[0]!.first_builder_visible_at.getTime()).toBe(rows[1]!.first_builder_visible_at.getTime());
  });


  it("carries a disclosed duplicate's exclusions to a survivor and its existing siblings", async () => {
    const job = await newJob(), g = await group(job), incoming = await insertSignal(job);
    await disclose(incoming, job);
    // Preserve the immutable surfaced_early state when this disclosed signal becomes a duplicate.
    await withTenant(shadow, ctx(), async db => {
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`shadow-detection:${T}:${job}`]);
      await db.$client.query("UPDATE app.shadow_commercial_signal SET coalesced_into_signal_id=$3 WHERE tenant_id=$1 AND id=$2", [T, incoming, g.survivor]);
    });
    for (const id of [...g.ids, incoming]) expect(await reasons(id)).toEqual(["disclosed_before_lock", "surfaced_early"]);
    expect((await state([...g.ids, incoming])).every(r => r.disclosed_before_lock && r.first_builder_visible_at)).toBe(true);
  });

  it("rolls back group disclosure and audit together, and refuses unauthorized and foreign subjects", async () => {
    const job = await newJob(), g = await group(job), event = randomUUID();
    const before = await state(g.ids);
    await expect(withTenant(emergency, ctx(), async db => {
      await db.$client.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'support_conversation')", [T, job, g.survivor, event]);
      throw new Error("rollback group");
    })).rejects.toThrow("rollback group");
    expect(await state(g.ids)).toEqual(before);
    for (const id of g.ids) expect(await reasons(id)).toEqual([]);
    expect((await admin.query("SELECT id FROM app.audit_event WHERE id=$1", [event])).rows).toEqual([]);
    await expect(disclose(g.survivor, job, event, runtime)).rejects.toMatchObject({ code: "42501" });
    await expect(disclose(g.survivor, job, event, shadow)).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(emergency, ctx(O), db => db.$client.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'support_conversation')", [T, job, g.survivor, event]))).rejects.toMatchObject({ code: "42501" });
    await expect(disclose(g.survivor, await newJob(), event)).rejects.toMatchObject({ code: "23503" });
    expect(await state(g.ids)).toEqual(before);
  });

  it("the existing worker creates one audited mandatory firing and excludes its entire group", async () => {
    const job = await newJob(), ref = randomUUID();
    const obs = [observation(job, ref, "completion_photo", true), observation(job, ref, "note_or_voice")];
    for (const o of obs) await evidence(o);
    const repo = new ShadowDetectionRepository(shadow), request = batch(job, obs);
    await repo.persist(ctx(), request);
    const signals = (await admin.query("SELECT id FROM app.shadow_commercial_signal WHERE job_id=$1", [job])).rows;
    expect(signals).toHaveLength(2);
    for (const { id } of signals) expect(await reasons(id)).toEqual(["disclosed_before_lock", "surfaced_early"]);
    await repo.persist(ctx(), request);
    expect((await admin.query("SELECT decision_id FROM app.shadow_must_surface_firing WHERE job_id=$1", [job])).rows).toHaveLength(1);
    expect((await admin.query("SELECT id FROM app.shadow_disclosure_event WHERE job_id=$1", [job])).rows).toHaveLength(1);
    const audit = (await admin.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [T])).rows as AuditEvent[];
    expect(audit.filter(r => r.subjectRef === job && r.eventType === "shadow.must_surface_fired")).toHaveLength(1);
    expect(() => verifyAuditChain(audit)).not.toThrow();
  });

  it("keeps post-lock completion disabled and records truthful late disclosure timing", async () => {
    const job = await newJob(), g = await group(job);
    const o = observation(job, randomUUID(), "completion_photo", true);
    await evidence(o);
    const mandatory = await insertSignal(job, true);
    await withTenant(shadow, ctx(), db => db.$client.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [T, job, mandatory, o.evidence.id, o.evidence.objectVersionId, o.evidence.sha256, o.evidence.serverReceivedAt]));
    await lockJob(job);
    await expect(withTenant(shadow, ctx(), db => db.$client.query("SELECT app.surface_shadow_signal_early($1,$2,$3,$4,$5,$6,'safety','shadow_attribution_policy_v3',$7,$8,$9::jsonb)",
      [T, job, mandatory, randomUUID(), randomUUID(), randomUUID(), o.evidence.id, o.evidence.objectVersionId, JSON.stringify(o.facts)]))).rejects.toThrow("early surface requires an unlocked job");
    expect((await admin.query("SELECT decision_id FROM app.shadow_must_surface_firing WHERE job_id=$1", [job])).rows).toEqual([]);
    const { event } = await disclose(g.dups[0]!, job);
    expect((await admin.query("SELECT before_lock FROM app.shadow_disclosure_event WHERE id=$1", [event])).rows[0]).toEqual({ before_lock: false });
    expect((await state(g.ids)).every(r => !r.disclosed_before_lock && r.first_builder_visible_at)).toBe(true);
    expect((await admin.query("SELECT to_regprocedure('app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)') routine")).rows[0].routine).toBeNull();
  });
});
