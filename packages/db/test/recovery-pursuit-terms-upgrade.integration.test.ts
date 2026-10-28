// Written before 0207. Real PostgreSQL only; CI execution required, NOT RUN locally.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EvidencePackRepository, MIGRATION_URLS, RecoveryMessageRepository, RecoveryFollowUpRepository, SandboxRepository, migrate, withTenant } from "../src/index.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
const name = "0242_recovery_pursuit_terms_required.sql", password = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const position = MIGRATION_URLS.findIndex(url => basename(fileURLToPath(url)) === name);
const tables = ["app.job", "app.recovery_case", "app.recovery_claim_revision", "app.recovery_case_event", "app.recovery_message", "app.recovery_message_event", "app.recovery_message_approval", "app.recovery_message_sink", "app.command_receipt", "app.decision", "app.decision_resolution", "app.action_authorization", "app.action_outbox", "app.action_attempt", "app.audit_event"];
type Fixture = Awaited<ReturnType<typeof seedEvidencePackFixture>>;
let reminder: { f: Fixture; followUp: NonNullable<Awaited<ReturnType<RecoveryFollowUpRepository["read"]>>["latest"]> };
type State = Awaited<ReturnType<RecoveryMessageRepository["read"]>>;
const saved: { f: Fixture; input: Record<string, unknown>; approval: Record<string, unknown>; view: NonNullable<State["latest"]>; merchant: State }[] = [];
async function preview(f: Fixture, caseId: string) {
  // Shared evidence fixture has claim revisions but no opening events. Populate
  // the historical opening fact before pursuit, as the existing journey does.
  await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,encode(sha256(convert_to($6,'UTF8')),'hex'))", [randomUUID(), f.tenantId, f.jobId, caseId, randomUUID(), caseId]);
  const ctx = testTenantContext(f.tenantId), actor = { membershipId: f.memberId, actorRef: `membership:${f.memberId}` }, packs = new EvidencePackRepository(runtime), repo = new RecoveryMessageRepository(runtime);
  const pack = await packs.generate(ctx, caseId, { commandId: randomUUID() }, actor.actorRef);
  await packs.approveAttachment(ctx, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
  const ready = await repo.read(ctx, caseId), input = { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: ready.readiness.caseRevision, packId: pack.id };
  const state = await repo.preview(ctx, caseId, input, actor), v = state.latest!;
  const approval = { version: "recovery-message-command.v1", action: "approve", commandId: randomUUID(), messageId: v.id, expectedRevision: v.revision, recipient: v.message.recipient, body: v.message.body, amountPence: v.message.amountPence, packId: v.message.packId, contentHash: v.message.contentHash };
  return { input, approval, state: await repo.command(ctx, caseId, approval, actor), actor, ctx };
}
beforeAll(async () => {
  expect(position).toBeGreaterThan(0);
  directory = await mkdtemp(join(tmpdir(), "jg-pursuit-upgrade-")); const port = await freePort(62400, 100);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, position)) { await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [basename(fileURLToPath(url))]); }
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query(`CREATE ROLE pursuit_upgrade_login LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO pursuit_upgrade_login`);
  runtime = new Pool({ host: "127.0.0.1", port, user: "pursuit_upgrade_login", password, database: "postgres", max: 4 });
  for (const policy of [null, "reference_fee_policy_v1"]) {
    const f = await seedEvidencePackFixture(admin);
    if (policy === null) { // Negative historical fixture before N; not a policy conversion path.
      const db = await admin.connect(); try { await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role=replica"); await db.query("UPDATE app.job SET fee_policy_version=NULL,baseline_quote_version_id=NULL,accepted_net_value_pence=NULL,recovery_cap_pence=NULL WHERE tenant_id=$1 AND id=$2", [f.tenantId, f.jobId]); await db.query("COMMIT"); } finally { db.release(); }
    }
    const customer = await preview(f, f.customerCaseId), merchant = await preview(f, f.caseId), repo = new RecoveryMessageRepository(runtime), v = merchant.state.latest!;
    const delivered = await repo.command(merchant.ctx, f.caseId, { version: "recovery-message-command.v1", action: "advance", commandId: randomUUID(), messageId: v.id, expectedRevision: v.revision, outcome: "success" }, merchant.actor);
    expect(delivered.sinkCount).toBe(1);
    saved.push({ f, input: customer.input, approval: customer.approval, view: customer.state.latest!, merchant: delivered });
  }
  // A real pre-N v1 delivered pursuit and due reminder, kept as historical data.
  const f = await seedEvidencePackFixture(admin, { practice: true }), initial = await preview(f, f.customerCaseId), repo = new RecoveryMessageRepository(runtime), v = initial.state.latest!;
  const delivered = await repo.command(initial.ctx, f.customerCaseId, { version: "recovery-message-command.v1", action: "advance", commandId: randomUUID(), messageId: v.id, expectedRevision: v.revision, outcome: "success" }, initial.actor);
  const sandbox = new SandboxRepository(runtime), follow = new RecoveryFollowUpRepository(runtime);
  await sandbox.create(f.sessionToken!, randomUUID());
  const scheduled = await follow.schedule(initial.ctx, f.customerCaseId, { version: "recovery-follow-up-command.v1", action: "schedule", commandId: randomUUID(), sourceMessageId: v.id, expectedCaseRevision: delivered.readiness.caseRevision }, initial.actor);
  let due = scheduled;
  for (let tick = 0; tick < 3; tick++) due = await follow.advanceTime(initial.ctx, f.customerCaseId, { version: "recovery-follow-up-command.v1", action: "advance_time", commandId: randomUUID(), followUpId: scheduled.latest!.id }, initial.actor, (run, command) => sandbox.advance(f.sessionToken!, run, command));
  reminder = { f, followUp: due.latest! };
  tables.push("app.recovery_follow_up", "app.recovery_follow_up_event", "app.recovery_follow_up_owner");
});
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });
it("HistoricalPursuitPreserved: own migration alone, named rows/types/identities, successor migrations twice and immutable replays", async () => {
  const proof = await proofBefore(admin, tables); for (const [table, p] of Object.entries(proof)) expect(Object.keys(p.rows).length, table).toBeGreaterThan(0);
  const security = async () => ({
    routines: (await admin.query("SELECT oid,proowner,proacl::text,prosecdef,provolatile,proconfig FROM pg_proc WHERE oid IN('app.recovery_case_terms_approved(uuid,uuid,uuid)'::regprocedure,'app.guard_recovery_pursuit_terms()'::regprocedure,'app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ORDER BY oid")).rows,
    triggers: (await admin.query("SELECT oid,tgname,tgfoid,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgname IN('recovery_message_terms_guard','recovery_message_approval_terms_guard','recovery_message_sink_terms_guard') ORDER BY oid")).rows,
  });
  const before = await security(), writer = (await admin.query("SELECT pg_get_functiondef('app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) definition")).rows;
  await admin.query(await readFile(MIGRATION_URLS[position]!, "utf8"));
  expect(await security()).toEqual(before); expect(before.triggers).toHaveLength(3);
  expect((await admin.query("SELECT pg_get_functiondef('app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) definition")).rows).toEqual(writer);
  expect(await proofDifferences(admin, proof)).toEqual({ rows: [], types: [] });
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  await migrate(admin); await migrate(admin); expect(await proofDifferences(admin, proof)).toEqual({ rows: [], types: [] });
  for (const { f, input, approval, view, merchant } of saved) {
    const repo = new RecoveryMessageRepository(runtime), ctx = testTenantContext(f.tenantId), actor = { membershipId: f.memberId, actorRef: `membership:${f.memberId}` };
    expect((await repo.preview(ctx, f.customerCaseId, input, actor)).latest).toEqual(view);
    expect((await repo.command(ctx, f.customerCaseId, approval, actor)).latest).toEqual(view);
    await expect(repo.preview(ctx, f.customerCaseId, { ...input, packId: randomUUID() }, actor)).rejects.toMatchObject({ code: "RECOVERY_MESSAGE_COMMAND_CONFLICT" });
    expect(await repo.read(ctx, f.caseId)).toEqual(merchant);
  }
  expect(await proofDifferences(admin, proof)).toEqual({ rows: [], types: [] });
  const clean = { rows: [], types: [] };
  expect(await rolledBack(admin, async db => { await db.query("SET LOCAL session_replication_role=replica"); await db.query("UPDATE app.recovery_message SET created_at=created_at+interval '1 microsecond'"); return proofDifferences(db, proof); })).not.toEqual(clean);
  expect(await rolledBack(admin, async db => { await db.query("ALTER TABLE app.recovery_message ALTER COLUMN case_sequence TYPE bigint"); return proofDifferences(db, proof); })).not.toEqual(clean);
  expect(await rolledBack(admin, async db => { await db.query("ALTER TABLE app.recovery_message ADD COLUMN ch7c_nullable text"); return proofDifferences(db, proof); })).toEqual(clean);
  expect(await rolledBack(admin, async db => { await scratchReplaceFunction(db, "app.recovery_case_terms_approved(uuid,uuid,uuid)"); return proofDifferences(db, proof); })).toEqual(clean);
  expect(await rolledBack(admin, async db => { await db.query("SET LOCAL session_replication_role=replica"); await db.query("INSERT INTO app.recovery_message SELECT gen_random_uuid(),tenant_id,job_id,case_id,case_sequence+1,pack_id,pack_revision,manifest_hash,attachment_hash,attachment_approval_id,gen_random_uuid(),request_hash,case_type,case_revision,amount_pence,currency,sender,recipient,body,policy_version,content_hash,immutable_content,actor_membership_id,environment,created_at FROM app.recovery_message LIMIT 1"); return proofDifferences(db, proof); })).toEqual(clean);
});
it("RawPreviewApprovalSinkRefused: historical null/v1 approvals cannot authorize new row writes; every attempted write rolls back", async () => {
  const proof = await proofBefore(admin, tables), counts = async () => Promise.all(tables.map(async table => (await admin.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n)), before = await counts();
  for (const { f, view } of saved) {
    const ctx = testTenantContext(f.tenantId), action = view.approval!.outboxActionId;
    await expect(withTenant(runtime, ctx, async db => {
      await db.$client.query("UPDATE app.action_outbox SET status='cancelled' WHERE tenant_id=$1 AND id=$2", [f.tenantId, action]);
      return db.$client.query("INSERT INTO app.recovery_message SELECT gen_random_uuid(),tenant_id,job_id,case_id,case_sequence+1,pack_id,pack_revision,manifest_hash,attachment_hash,attachment_approval_id,gen_random_uuid(),request_hash,case_type,case_revision,amount_pence,currency,sender,recipient,body,policy_version,content_hash,immutable_content,actor_membership_id,environment,created_at FROM app.recovery_message WHERE tenant_id=$1 AND id=$2", [f.tenantId, view.id]);
    })).rejects.toMatchObject({ code: "23514", message: "RECOVERY_TERMS_NOT_APPROVED" });
    await expect(withTenant(runtime, ctx, db => db.$client.query("INSERT INTO app.recovery_message_approval SELECT * FROM app.recovery_message_approval WHERE tenant_id=$1 AND message_id=$2", [f.tenantId, view.id]))).rejects.toMatchObject({ code: "23514", message: "RECOVERY_TERMS_NOT_APPROVED" });
    await expect(withTenant(runtime, ctx, async db => {
      await db.$client.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.tenantId, action]);
      return db.$client.query("INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'raw','synthetic_demo',0)", [randomUUID(), f.tenantId, f.jobId, f.customerCaseId, view.id, action, view.message.recipient, view.message.body, view.message.contentHash, view.message.attachmentHash]);
    })).rejects.toMatchObject({ code: "23514", message: "RECOVERY_TERMS_NOT_APPROVED" });
  }
  expect(await proofDifferences(admin, proof)).toEqual({ rows: [], types: [] });
  expect(await counts()).toEqual(before);
});

it("ReminderUsesSameGuard: new reminder on a historical v1 pursuit is refused, leaving the delivered original unchanged", async () => {
  const { f, followUp } = reminder, ctx = testTenantContext(f.tenantId), actor = { membershipId: f.memberId, actorRef: `membership:${f.memberId}` }, repo = new RecoveryMessageRepository(runtime);
  const original = await repo.read(ctx, f.customerCaseId), proof = await proofBefore(admin, tables), follow = new RecoveryFollowUpRepository(runtime);
  await expect(follow.openReview(ctx, f.customerCaseId, { version: "recovery-follow-up-command.v1", action: "open_review", commandId: randomUUID(), followUpId: followUp.id, expectedRevision: followUp.revision, expectedCaseRevision: original.readiness.caseRevision, packId: original.readiness.packId! }, actor)).rejects.toMatchObject({ code: "RECOVERY_TERMS_NOT_APPROVED" });
  expect(await repo.read(ctx, f.customerCaseId)).toEqual(original);
  expect(await proofDifferences(admin, proof)).toEqual({ rows: [], types: [] });
});
