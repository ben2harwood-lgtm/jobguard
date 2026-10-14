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

/* MIGFIX-7: group disclosure and post-lock completion, real PostgreSQL 16, actual logins. */
const T = randomUUID(), O = randomUUID(), M = randomUUID(), U = randomUUID(), L = randomUUID();
const at = "2026-10-01T00:00:00Z", credential = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, shadow: Pool, emergency: Pool, probe: Pool, directory: string, port: number;
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
const complete = "SELECT app.complete_shadow_firing_post_lock($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)";
const safetyFacts = (safety = true) => ({ workReference: "wr", scopeArea: "job", description: "outside tap", status: "completed", estimatedValuePence: null, safetyImplication: safety, customerClearlyRequested: false,
  needsPriorWrittenAgreement: false, significantWork: null, activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false });
/** A mandatory signal persisted before the lock with its evidence link; no firing yet. */
async function pendingMandatory(job: string, tenant = T) {
  const o = observation(job, randomUUID(), "completion_photo", true, tenant); await evidence(o);
  const signal = await insertSignal(job, true, tenant);
  await withTenant(shadow, ctx(tenant), db => db.$client.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [tenant, job, signal, o.evidence.id, o.evidence.objectVersionId, o.evidence.sha256, o.evidence.serverReceivedAt]));
  return { o, signal };
}
const args = (job: string, signal: string, o: Observation, ids = { firing: randomUUID(), decision: randomUUID(), disclosure: randomUUID() }, facts: object = safetyFacts(), over: Partial<Record<number, unknown>> = {}) => {
  const a: unknown[] = [T, job, signal, ids.firing, ids.decision, ids.disclosure, "safety", "shadow_attribution_policy_v3", o.evidence.id, o.evidence.objectVersionId, JSON.stringify(facts)];
  for (const [i, v] of Object.entries(over)) a[Number(i)] = v;
  return a;
};
const callComplete = (a: unknown[], tenant = T) => withTenant(probe, ctx(tenant), db => db.$client.query(complete, a));
const counts = async (job: string) => (await admin.query(`SELECT (SELECT count(*)::int FROM app.decision d WHERE d.tenant_id=$1 AND d.subject_ref IN(SELECT id::text FROM app.shadow_commercial_signal WHERE job_id=$2)) decisions,
  (SELECT count(*)::int FROM app.shadow_must_surface_firing WHERE job_id=$2) firings,(SELECT count(*)::int FROM app.shadow_disclosure_event WHERE job_id=$2) disclosures,
  (SELECT count(*)::int FROM app.job_finding WHERE job_id=$2 AND kind='must_surface_signal') findings,(SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audits`, [T, job])).rows[0];

describe("MIGFIX-7 real PostgreSQL group disclosure and post-lock completion", () => {
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
    // Test-only login for the completion routine; it is NOT granted to any product role.
    await admin.query(`CREATE ROLE m7_probe LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT USAGE ON SCHEMA app TO m7_probe`);
    // Conditional only so the unchanged baseline can be run to show the failing-first state.
    await admin.query(`DO $$ BEGIN IF to_regprocedure('app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)') IS NOT NULL THEN
     GRANT EXECUTE ON FUNCTION app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb) TO m7_probe; END IF; END $$`);
    runtime = pool("m7_runtime"); shadow = pool("m7_shadow"); emergency = pool("m7_emergency"); probe = pool("m7_probe");
    await withTenant(runtime, ctx(), db => db.$client.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)", [T, M, randomUUID(), "synthetic_final_check_terms.v1"]));
  }, 120000);
  afterAll(async () => { await closeTestPools(runtime, shadow, emergency, probe, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

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
    expect(await pending(racing)).toBe(true);
    await coalescer.query("COMMIT"); coalescer.release();
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
    expect(await pending(coalescing)).toBe(true);
    await discloser.query("COMMIT"); discloser.release();
    await coalescing;
    for (const id of [a2, b2]) expect(await reasons(id)).toEqual(["disclosed_before_lock", "surfaced_early"]);
    const rows = await state([a2, b2]);
    expect(rows.every(r => r.disclosed_before_lock && r.first_builder_visible_at && r.state === "surfaced_early")).toBe(true);
    expect(rows[0]!.first_builder_visible_at.getTime()).toBe(rows[1]!.first_builder_visible_at.getTime());
  });

  it("completes a pending mandatory firing after the final-account lock: exactly one Decision, finding, firing and disclosure, no fabricated pre-lock disclosure", async () => {
    const job = await newJob(), { o, signal } = await pendingMandatory(job);
    await lockJob(job);
    // The early-surface routine still refuses a locked job, with no effect.
    const before = await counts(job);
    await expect(withTenant(shadow, ctx(), db => db.$client.query("SELECT app.surface_shadow_signal_early($1,$2,$3,$4,$5,$6,'safety','shadow_attribution_policy_v3',$7,$8,$9::jsonb)",
      [T, job, signal, randomUUID(), randomUUID(), randomUUID(), o.evidence.id, o.evidence.objectVersionId, JSON.stringify(safetyFacts())]))).rejects.toThrow("early surface requires an unlocked job");
    expect(await counts(job)).toEqual(before);
    const ids = { firing: randomUUID(), decision: randomUUID(), disclosure: randomUUID() }, a = args(job, signal, o, ids);
    const started = Date.now();
    expect((await callComplete(a)).rows[0].complete_shadow_firing_post_lock).toBe(ids.decision);
    expect((await callComplete(a)).rows[0].complete_shadow_firing_post_lock).toBe(ids.decision); // replay
    const c = await counts(job);
    expect({ decisions: c.decisions, firings: c.firings, disclosures: c.disclosures, findings: c.findings }).toEqual({ decisions: 1, firings: 1, disclosures: 1, findings: 1 });
    const s = (await admin.query("SELECT disclosed_before_lock,state,first_builder_visible_at FROM app.shadow_commercial_signal WHERE id=$1", [signal])).rows[0];
    expect(s.disclosed_before_lock).toBe(false); expect(s.state).not.toBe("surfaced_early"); expect(s.first_builder_visible_at).not.toBeNull();
    expect(s.first_builder_visible_at.getTime()).toBeGreaterThan(started - 5000);
    const event = (await admin.query("SELECT before_lock,created_at,route FROM app.shadow_disclosure_event WHERE id=$1", [ids.disclosure])).rows[0];
    expect(event).toMatchObject({ before_lock: false, route: "must_surface_override" }); expect(event.created_at.getTime()).toBe(s.first_builder_visible_at.getTime());
    expect(await reasons(signal)).toEqual(["evidence_after_lock"]); // fee-ineligible, never labelled disclosed_before_lock
    const rows = (await admin.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [T])).rows as AuditEvent[];
    expect(rows.some(r => r.eventType === "shadow.must_surface_fired")).toBe(true); expect(() => verifyAuditChain(rows)).not.toThrow();
  });

  it("post-lock completion refuses missing terms, wrong tenant/job/version/source, false predicates, unlocked or late signals and changed replays", async () => {
    const job = await newJob(), { o, signal } = await pendingMandatory(job);
    const calls = async (over: Partial<Record<number, unknown>>, facts?: object) => callComplete(args(job, signal, o, undefined, facts, over));
    await expect(calls({})).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("requires a locked job") }); // unlocked
    await lockJob(job);
    await expect(callComplete(args(job, signal, o), O)).rejects.toMatchObject({ code: "42501" }); // tenant context mismatch
    await expect(calls({ 0: O })).rejects.toMatchObject({ code: "42501" });
    await expect(calls({ 1: randomUUID() })).rejects.toMatchObject({ code: "23503" }); // wrong job
    await expect(calls({ 7: "shadow_attribution_policy_v2" })).rejects.toMatchObject({ code: "22023" });
    await expect(calls({ 8: randomUUID() })).rejects.toMatchObject({ code: "23503" }); // wrong source
    await expect(calls({}, safetyFacts(false))).rejects.toMatchObject({ code: "23514" }); // false predicate
    await expect(calls({ 6: "disclosure_duty" }, { ...safetyFacts(false), disclosureDuty: false })).rejects.toMatchObject({ code: "23514" });
    // Missing terms: tenant O accepted none.
    const noTerms = await insertSignal(L, true, O);
    await expect(withTenant(probe, ctx(O), db => db.$client.query(complete, [O, L, noTerms, randomUUID(), randomUUID(), randomUUID(), "safety", "shadow_attribution_policy_v3", randomUUID(), "v", JSON.stringify(safetyFacts())]))).rejects.toMatchObject({ code: "55000", message: "TERMS_NOT_ACCEPTED" });
    // A signal persisted after the lock, a non-mandatory signal and a coalesced duplicate are not completable.
    const late = await insertSignal(job, true), plain = await insertSignal(job, false);
    for (const s of [late, plain]) await expect(callComplete(args(job, s, o))).rejects.toMatchObject({ code: "55000" });
    expect(await counts(job)).toMatchObject({ decisions: 0, firings: 0, disclosures: 0, findings: 0 });
    // Replay with changed payload conflicts; identical replay is idempotent.
    const ids = { firing: randomUUID(), decision: randomUUID(), disclosure: randomUUID() };
    await callComplete(args(job, signal, o, ids));
    await expect(callComplete(args(job, signal, o, ids, { ...safetyFacts(), description: "changed" }))).rejects.toMatchObject({ code: "23505" });
    await expect(callComplete(args(job, signal, o, ids, safetyFacts(), { 4: randomUUID() }))).rejects.toMatchObject({ code: "23505" });
    expect(await counts(job)).toMatchObject({ decisions: 1, firings: 1, disclosures: 1, findings: 1 });
    // The routine is not reachable by any product login.
    for (const p of [runtime, shadow, emergency]) await expect(withTenant(p, ctx(), db => db.$client.query(complete, args(job, signal, o)))).rejects.toMatchObject({ code: "42501" });
  });

  it("a firing rolled back before the audit commit leaves no partial effects, and retries and restarts repeat the identical result", async () => {
    const job = await newJob(), { o, signal } = await pendingMandatory(job); await lockJob(job);
    const before = await counts(job), sigBefore = await state([signal]), inel = (await admin.query("SELECT count(*)::int n FROM app.shadow_signal_ineligibility WHERE job_id=$1", [job])).rows[0].n;
    const ids = { firing: randomUUID(), decision: randomUUID(), disclosure: randomUUID() };
    await expect(withTenant(probe, ctx(), async db => { await db.$client.query(complete, args(job, signal, o, ids)); throw new Error("rollback before commit"); })).rejects.toThrow("rollback before commit");
    expect(await counts(job)).toEqual(before); expect(await state([signal])).toEqual(sigBefore);
    expect((await admin.query("SELECT count(*)::int n FROM app.shadow_signal_ineligibility WHERE job_id=$1", [job])).rows[0].n).toBe(inel);
    await callComplete(args(job, signal, o, ids)); const after = await counts(job);
    await callComplete(args(job, signal, o, ids)); await callComplete(args(job, signal, o, ids));
    expect(await counts(job)).toEqual(after);
    expect({ ...after, audits: undefined }).toEqual({ decisions: 1, firings: 1, disclosures: 1, findings: 1, audits: undefined });
    expect(after.audits - before.audits).toBe(2); // shadow.disclosed + shadow.must_surface_fired
    const rows = (await admin.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [T])).rows as AuditEvent[];
    expect(() => verifyAuditChain(rows)).not.toThrow();
  });

  it("completion of a post-lock group excludes the duplicates too and never marks them disclosed before the lock", async () => {
    const job = await newJob(), { o, signal } = await pendingMandatory(job), dup = await insertSignal(job, true);
    await withTenant(shadow, ctx(), db => db.$client.query("UPDATE app.shadow_commercial_signal SET state='reconciled',outcome='duplicate_signal',coalesced_into_signal_id=$2 WHERE tenant_id=$1 AND id=$3", [T, signal, dup]));
    await lockJob(job); await callComplete(args(job, signal, o));
    for (const id of [signal, dup]) expect(await reasons(id)).toEqual(["evidence_after_lock"]);
    expect((await state([signal, dup])).every(r => !r.disclosed_before_lock && r.first_builder_visible_at)).toBe(true);
  });
});
