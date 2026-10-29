import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { runJobChecks } from "@jobguard/core";
import { authenticatePracticeSession, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID,
  issuePracticeSession, listDecisionInbox, migrate, persistFindings, suppressAdvisoryFinding, withTenant, verifyAuditChain } from "../src/index.js";
import { DecisionsApplication } from "../../../apps/api/src/decisions/decisions.application.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const directory = await mkdtemp(join(tmpdir(), "jg-later-decisions-")), port = await freePort(59000, 200);
  const credential = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const connection = { host: "127.0.0.1", port, database: "postgres", password: credential };
  const control = new Pool({ ...connection, user: "postgres" });
  try { await control.query("CREATE DATABASE jobguard_synthetic_demo"); } finally { await control.end(); }
  connection.database = "jobguard_synthetic_demo";
  admin = new Pool({ ...connection, user: "postgres" }); await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  const account = randomUUID();
  await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional decisions')", [DEMO_TENANT_ID, account]);
  await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, account, DEMO_IDENTITY_USER_ID]);
  await admin.query(`ALTER ROLE jobguard_runtime LOGIN PASSWORD '${credential}'`);
  runtime = new Pool({ ...connection, user: "jobguard_runtime", max: 2 });
}, 120000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); vi.unstubAllEnvs(); });
async function fixture() {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session);
  const job = (await admin.query("SELECT id FROM app.job WHERE practice_session_digest=$1 AND status='live'", [auth.digest])).rows[0]!.id as string;
  const scope = randomUUID();
  await admin.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')", [DEMO_TENANT_ID, job, scope]);
  const command = { version: "finding-evaluation-command.v1", tenantId: DEMO_TENANT_ID, jobId: job, commandId: randomUUID() };
  return { session, auth, job, scope, command, app: new DecisionsApplication(runtime, session) };
}
it("L063 completion proof comes from current persisted proof, including invalidation and subject binding", async () => {
  const f = await fixture();
  const before = await f.app.evaluate(f.command);
  expect(before.decisions.filter((x: any) => x.classification === "mandatory")).toHaveLength(1);
  // Persist finalized linked proof as fixture setup; no provider or storage integration is claimed.
  const upload = randomUUID(), evidence = randomUUID(), objectKey = `synthetic/later/${evidence}`, version = randomUUID();
  // Fixture writes obey the same transaction-local tenant guard as evidence commands.
  await withTenant(admin, f.auth.context, async db => {
    await db.$client.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,state,object_version_id,server_verified_at,retention_class,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'application/pdf',100,'verified',$7,clock_timestamp(),'standard_evidence',clock_timestamp()+interval '1 day')`, [upload, DEMO_TENANT_ID, f.job, f.scope, objectKey, "a".repeat(64), version]);
    await db.$client.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,evidence_type,kind,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
      VALUES($1,$2,$3,$4,$5,'electrical_certificate','original',$6,$7,$8,1,'application/pdf','standard_evidence',clock_timestamp(),clock_timestamp())`, [evidence, DEMO_TENANT_ID, upload, f.job, f.scope, objectKey, version, "a".repeat(64)]);
    await db.$client.query("INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,$5,'electrical_certificate')", [randomUUID(), DEMO_TENANT_ID, evidence, f.job, f.scope]);
  });
  expect((await f.app.list({ tenantId: DEMO_TENANT_ID, jobId: f.job })).counts.mandatory).toBe(0);
  const after = await f.app.evaluate({ ...f.command, commandId: randomUUID() });
  expect(after.counts.mandatory).toBe(0);
  expect(await f.app.evaluate(f.command)).toEqual(before);
  await withTenant(admin, f.auth.context, db => db.$client.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), DEMO_TENANT_ID, evidence, DEMO_MEMBERSHIP_ID]));
  expect((await f.app.evaluate({ ...f.command, commandId: randomUUID() })).counts.mandatory).toBe(1);
});
it("L064 retired finding disappears from current projection but remains in history", async () => {
  const f = await fixture(); await f.app.evaluate(f.command);
  const history = (await admin.query("SELECT row_to_json(t)::text AS bytes FROM app.job_finding t WHERE job_id=$1 ORDER BY id", [f.job])).rows;
  await admin.query("UPDATE app.scope_identity SET state='retired' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, f.scope]);
  expect((await f.app.list({ tenantId: DEMO_TENANT_ID, jobId: f.job })).decisions).toEqual([]);
  const readableHistory = await withTenant(runtime, f.auth.context, db => db.$client.query(
    "SELECT row_to_json(t)::text AS bytes FROM app.job_finding t WHERE job_id=$1 ORDER BY id", [f.job]));
  expect(readableHistory.rows).toEqual(history);
  expect((await f.app.evaluate({ ...f.command, commandId: randomUUID() })).decisions).toEqual([]);
  expect((await admin.query("SELECT row_to_json(t)::text AS bytes FROM app.job_finding t WHERE job_id=$1 ORDER BY id", [f.job])).rows).toEqual(history);
});
it("L065 same check ID replays and changed job/payload conflicts; concurrent replay has one audit", async () => {
  const f = await fixture();
  const results = await Promise.all([f.app.evaluate(f.command), f.app.evaluate(f.command)]);
  expect(results[0]).toEqual(results[1]);
  const other = (await admin.query("SELECT id FROM app.job WHERE practice_session_digest=$1 AND id<>$2 LIMIT 1", [f.auth.digest, f.job])).rows[0]!.id;
  await expect(f.app.evaluate({ ...f.command, jobId: other })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(f.app.evaluate({ ...f.command, extra: true })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 await assertLp4SealedEvents(admin, DEMO_TENANT_ID, "finding.checked");
  expect((await admin.query("SELECT 1 FROM app.audit_event WHERE event_type='finding.checked' AND payload->'references'->>'commandId'=$1", [f.command.commandId])).rowCount).toBe(1);
});
it("L065 audit and receipt roll back with a failed check transaction", async () => {
  const f = await fixture();
  await admin.query(`CREATE FUNCTION app.later_test_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type='finding.checked' THEN RAISE EXCEPTION 'fixture audit refusal'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER later_test_refuse_audit BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.later_test_refuse_audit()`);
  await expect(f.app.evaluate(f.command)).rejects.toThrow("fixture audit refusal");
  await admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER later_test_refuse_audit");
  expect((await admin.query("SELECT 1 FROM app.command_receipt WHERE command_id=$1", [f.command.commandId])).rowCount).toBe(0);
  expect((await admin.query("SELECT 1 FROM app.job_finding WHERE job_id=$1", [f.job])).rowCount).toBe(0);
  await f.app.evaluate(f.command);
});
it("L071 changed mandatory classification cannot retain obsolete suppression or dismissal", async () => {
  const f = await fixture();
  const snapshot = { version: "job-fact-snapshot.v1" as const, tenantId: DEMO_TENANT_ID, jobId: f.job, revision: 1, scopes: [],
    unresolvedQuestions: [{ id: randomUUID(), text: "Fictional scope question", commercialBlocker: false }] };
  const advisory = runJobChecks(snapshot)[0]!;
  await withTenant(runtime, f.auth.context, async db => {
    await persistFindings(db, DEMO_TENANT_ID, 1, [advisory]);
    const row = (await listDecisionInbox(db, f.job))[0]!;
    await suppressAdvisoryFinding(db, DEMO_TENANT_ID, row.id, "daily_advisory_budget", "decision-suppression.v1");
    await db.$client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'dismissed',$4)", [randomUUID(), DEMO_TENANT_ID, row.decision_id, DEMO_MEMBERSHIP_ID]);
    const mandatory = runJobChecks({ ...snapshot, revision: 2, unresolvedQuestions: [{ ...snapshot.unresolvedQuestions[0]!, commercialBlocker: true }] });
    await persistFindings(db, DEMO_TENANT_ID, 2, mandatory);
    const current = await listDecisionInbox(db, f.job);
    expect(current).toHaveLength(1); expect(current[0]).toMatchObject({ classification: "mandatory", resolution: null, snapshot_revision: 2 });
  });
  expect((await admin.query("SELECT 1 FROM app.finding_suppression s JOIN app.job_finding f ON (f.tenant_id,f.id)=(s.tenant_id,s.finding_id) WHERE f.job_id=$1", [f.job])).rowCount).toBe(1);
  expect((await admin.query("SELECT 1 FROM app.decision_resolution r JOIN app.job_finding f ON (f.tenant_id,f.decision_id)=(r.tenant_id,r.decision_id) WHERE f.job_id=$1", [f.job])).rowCount).toBe(1);
});
it("L065 unauthorized callers receive identical refusals before check replay or job state", async () => {
  const f = await fixture(), stranger = new DecisionsApplication(runtime, await issuePracticeSession(runtime));
  const foreignDraft = (await admin.query("SELECT id FROM app.job WHERE practice_session_digest=$1 AND status<>'live' LIMIT 1", [f.auth.digest])).rows[0]!.id;
  for (const jobId of [randomUUID(), foreignDraft, f.job]) {
    await expect(stranger.evaluate({ ...f.command, jobId })).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
  }
  const digest = createHash("sha256").update(f.session).digest("hex");
  await admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [digest]);
  await expect(f.app.evaluate(f.command)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("L065 stored check audit remains a valid immutable chain", async () => {
  const rows = (await admin.query(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",event_type AS "eventType",
    subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,trim(payload_hash) AS "payloadHash",
    trim(previous_hash) AS "previousHash",trim(event_hash) AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [DEMO_TENANT_ID])).rows;
  expect(rows.length).toBeGreaterThan(0); expect(() => verifyAuditChain(rows)).not.toThrow();
});

it("L065 checked write routine rechecks persisted authority and completed responses cannot change", async () => {
  const f = await fixture(); await f.app.evaluate(f.command);
  const stranger = await authenticatePracticeSession(runtime, await issuePracticeSession(runtime));
  await expect(withTenant(runtime, f.auth.context, db => db.$client.query(
    "SELECT app.decision_check_command($1,$2::jsonb,'begin','{}'::jsonb)", [stranger.digest, JSON.stringify(f.command)]))).rejects.toMatchObject({ message: "NOT_FOUND" });
  await expect(withTenant(runtime, f.auth.context, db => db.$client.query(
    "UPDATE app.command_receipt SET result='{}'::jsonb WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, f.command.commandId]))).rejects.toMatchObject({ message: "DECISION_CHECK_IMMUTABLE" });
  const incomplete = { ...f.command, commandId: randomUUID() };
  await expect(withTenant(runtime, f.auth.context, db => db.$client.query(
    "SELECT app.decision_check_command($1,$2::jsonb,'begin','{}'::jsonb)", [f.auth.digest, JSON.stringify(incomplete)]))).rejects.toMatchObject({ message: "DECISION_CHECK_INCOMPLETE" });
});

it("L063 proof for another scope and pending uploads do not complete the current requirement", async () => {
  const f = await fixture(), scope = randomUUID(), upload = randomUUID(), evidence = randomUUID(), version = randomUUID();
  await admin.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')", [DEMO_TENANT_ID, f.job, scope]);
  const objectKey = `synthetic/later/${evidence}`;
  await withTenant(admin, f.auth.context, async db => {
    await db.$client.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,state,object_version_id,server_verified_at,retention_class,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'application/pdf',100,'verified',$7,clock_timestamp(),'standard_evidence',clock_timestamp()+interval '1 day')`, [upload, DEMO_TENANT_ID, f.job, scope, objectKey, "a".repeat(64), version]);
    await db.$client.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,evidence_type,kind,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
      VALUES($1,$2,$3,$4,$5,'electrical_certificate','original',$6,$7,$8,1,'application/pdf','standard_evidence',clock_timestamp(),clock_timestamp())`, [evidence, DEMO_TENANT_ID, upload, f.job, scope, objectKey, version, "a".repeat(64)]);
    await db.$client.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day')`, [randomUUID(), DEMO_TENANT_ID, f.job, f.scope, `synthetic/later/${randomUUID()}`, "b".repeat(64)]);
  });
  expect((await f.app.evaluate(f.command)).counts.mandatory).toBe(1);
});
