import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, EvidencePackRepository, RecoveryFollowUpRepository, RecoveryMessageRepository, RecoveryCaseTermsRepository, SandboxRepository,
  bootstrapSyntheticDemo, issuePracticeSession, verifyAuditChain,
} from "../src/index.js";
import { createSyntheticInvoicePdf, money, recoveryCaseTermsHash } from "@jobguard/core";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const credential = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, server: Pool;

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-migfix-8-"));
  const port = await freePort(62300, 100);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential,
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"] });
  await postgres.initialise(); await postgres.start();
  server = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential });
  await server.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${credential}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
  await server.query("CREATE DATABASE jobguard_synthetic_demo OWNER neondb_owner");
  const url = new URL(`postgresql://127.0.0.1:${port}/jobguard_synthetic_demo`);
  url.username = "neondb_owner"; url.password = credential;
  const ownerUrl = url.href;
  url.username = "jobguard_runtime";
  process.env.JOBGUARD_ENV = "synthetic_demo";
  await bootstrapSyntheticDemo({ ownerUrl, runtimeUrl: url.href });
  runtime = new Pool({ connectionString: url.href, max: 6 });
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential, database: "jobguard_synthetic_demo" });
  await installLegacySyntheticPartyFixtures(admin);
}, 60_000);
afterAll(async () => { await closeTestPools(runtime, admin, server); await postgres?.stop(); });

/** Fixture-only exact activation inputs; the existing v3 routine checks the
 * owner, accepted document, authorization and lifecycle before binding v3. */
async function activatePursuitFixture(client: import("pg").PoolClient, tenant: string, job: string, expected: number) {
  const row = (await client.query("SELECT d.id,d.document_version,d.content_hash,m.id actor FROM app.quote_document_version d JOIN app.membership m ON m.tenant_id=d.tenant_id AND m.role='owner' AND m.revoked_at IS NULL WHERE d.tenant_id=$1 AND d.job_id=$2", [tenant, job])).rows[0];
  const command = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
  await client.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'job.switch_live',$3,$4,'processing',$5)", [command, tenant, `pursuit-fixture:${job}`, row.content_hash, row.actor]);
  await client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'job.switch_live')", [decision, tenant, job]);
  await client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenant, decision, row.actor]);
  await client.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'job.switch_live',$6,$7,'synthetic_demo_activation.v3',clock_timestamp()+interval '1 hour')", [authorization, tenant, decision, resolution, row.actor, row.content_hash, row.document_version]);
  return client.query("SELECT app.switch_job_live_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [tenant, randomUUID(), randomUUID(), job, row.id, row.document_version, row.content_hash, expected, row.actor, command, authorization]);
}

async function seedDemoFixture(db: Pool, sessionDigest: string) {
  const tenantId = DEMO_TENANT_ID, memberId = DEMO_MEMBERSHIP_ID, jobId = randomUUID();
  const scopeId = randomUUID(), quoteId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID(), acceptanceId = randomUUID();
  const proofId = randomUUID(), uploadId = randomUUID(), variationId = randomUUID(), variationRevisionId = randomUUID(), invoiceId = randomUUID();
  const proofBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII=", "base64"), proofHash = createHash("sha256").update(proofBytes).digest("hex");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    await client.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Recovery follow-up fixture job',$3,'home')", [jobId, tenantId, sessionDigest]);
    await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, tenantId, jobId]);
    await client.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [quoteDraftId, tenantId, jobId]);
    await client.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',1880000,0,1880000,376000,2256000,true,'[]')", [quoteRevisionId, tenantId, jobId, quoteDraftId]);
    await client.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$4,1,'FIXTURE-QUOTE-${jobId}',$5,'fixture/quote-${jobId}','quote-object-${jobId}',1,'{}','{}',$6)`, [quoteId, tenantId, jobId, quoteRevisionId, hash("quote immutable fixture"), { netPence: 1880000, taxPence: 376000, totalPence: 2256000 }]);
    await client.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,1880000,'accepted')", [quoteId, tenantId, jobId, hash("quote immutable fixture")]);
    const transition = (expected: number, to: string, reason: string, quote: string | null = null, net: number | null = null, policy: string | null = null, cap: number | null = null) =>
      client.query("SELECT app.transition_job($1,$2,$3,$4,$5,$6,$7,$8,$9)", [tenantId, jobId, expected, to, reason, quote, net, policy, cap]);
    await transition(0, "quoting", "start_quote"); await transition(1, "accepted", "accept_quote", quoteId);
    await client.query("INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at) VALUES($1,$2,$3,$4,1,$5,2256000,'GBP','builder_attestation',$6,'Fictional Customer','verbal','2026-09-20T12:00:00Z')", [acceptanceId, tenantId, jobId, quoteId, hash("quote immutable fixture"), memberId]);
    await activatePursuitFixture(client, tenantId, jobId, 2);
    await client.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,'fixture/proof-${jobId}',$5,'image/png',$6,'standard_evidence','verified','proof-object-${jobId}',now(),now()+interval '1 hour')`, [uploadId, tenantId, jobId, scopeId, proofHash, proofBytes.length]);
    await client.query(`INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,'fixture/proof-${jobId}','proof-object-${jobId}','synthetic_demo','image/png',$5)`, [tenantId, uploadId, jobId, scopeId, proofBytes]);
    await client.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo','fixture/proof-${jobId}','proof-object-${jobId}',$6,$7,'image/png','standard_evidence',now(),now())`, [proofId, tenantId, uploadId, jobId, scopeId, proofHash, proofBytes.length]);
    // Checked v3 activation already bound the track; verify it rather than insert a duplicate.
    expect((await client.query('SELECT job_track,environment FROM app.job_commercial_track WHERE tenant_id=$1 AND job_id=$2', [tenantId, jobId])).rows).toEqual([{ job_track: 'small_builder', environment: 'synthetic_demo' }]);
    await client.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,existing_scope_item_id,capture_kind,capture_text,description,state) VALUES($1,$2,$3,$4,$4,'text','Fictional additional work','Synthetic fixture extra','approved')", [variationId, tenantId, jobId, scopeId]);
    await client.query("INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) VALUES($1,$2,$3,$4,$5,1,'Synthetic fixture extra','1','each',12500,12500,$6,$7,'human_entered','fixture',$6,'fixture.v1')", [variationRevisionId, tenantId, jobId, variationId, scopeId, hash("approved variation fixture"), memberId]);
    await client.query("INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at) VALUES($1,$2,$3,$4,$5,1,$6,12500,'builder_attestation',$7,now())", [randomUUID(), tenantId, jobId, variationId, variationRevisionId, hash("approved variation fixture"), memberId]);
    await transition(3, "invoiced", "issue_invoice");
    const finalDraft = randomUUID(), finalRevision = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
    await client.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [finalDraft, tenantId, jobId]);
    await client.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',1880000,376000,2256000,false,'[]')", [finalRevision, tenantId, jobId, finalDraft, hash("final account fixture"), quoteId]);
    const invoiceBytes = Buffer.from(createSyntheticInvoicePdf({ invoiceNumber: `FX-${jobId.slice(0, 8)}-${jobId.slice(9, 13)}`, issuerName: "Fictional fixture builder", total: money(2256000), sourceRevisionId: finalRevision, evidenceVersionIds: [`proof-object-${jobId}`] }));
    await client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'final_account.issue')", [decision, tenantId, jobId]);
    await client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenantId, decision, memberId]);
    await client.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'final_account.issue','fixture@example.invalid',$6,1,2256000,'GBP','candidate_m1_standard_v1',now()+interval '1 hour')", [authorization, tenantId, decision, resolution, memberId, createHash("sha256").update(invoiceBytes).digest("hex")]);
    await client.query("INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark) VALUES($1,$2,$3,$4,$5,$9,'2026-09-20','{}','candidate_m1_standard_v1','GBP',1880000,376000,2256000,$6,$7,$8,true,'SYNTHETIC - NOT A REAL INVOICE')", [invoiceId, tenantId, jobId, finalRevision, authorization, hash("final account fixture"), createHash("sha256").update(invoiceBytes).digest("hex"), invoiceBytes, `FX-${jobId.slice(0, 8)}-${jobId.slice(9, 13)}`]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return { tenantId, jobId, invoiceId, memberId };
}


async function fixture(deliver = true) {
  const session = await issuePracticeSession(runtime);
  const f = await seedDemoFixture(admin, hash(session));
  const ctx = testTenantContext(f.tenantId), actor = { membershipId: f.memberId, actorRef: `membership:${f.memberId}` };
  const caseId = randomUUID();
  await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,32000,'GBP','identified',0,true,'withheld_customer_payment','Fictional counterparty','builder_customer','customer_invoice',$4)", [caseId, f.tenantId, f.jobId, JSON.stringify([f.invoiceId])]);
  await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,32000,'GBP','fixture-owner',$5)", [randomUUID(), f.tenantId, f.jobId, caseId, hash(caseId)]);
  await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,$6)",
    [randomUUID(), f.tenantId, f.jobId, caseId, randomUUID(), hash(caseId)]);
  const owner = (await admin.query('SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2', [f.tenantId, f.memberId])).rows[0];
  await new RecoveryCaseTermsRepository(runtime).approve(ctx, f.jobId, {
    version: 'recovery-case-terms-command.v1', action: 'approve', commandId: randomUUID(), caseId,
    termsVersion: 'synthetic_recovery_fee_terms.v1', feePolicyVersion: 'reference_fee_policy_v3',
    eligibilityPolicyVersion: 'reference_recovery_eligibility_policy_v3', termsHash: recoveryCaseTermsHash(caseId),
  }, { membershipId: f.memberId, identityUserId: owner.identity_user_id });
  const packs = new EvidencePackRepository(runtime), messages = new RecoveryMessageRepository(runtime);
  const pack = await packs.generate(ctx, caseId, { commandId: randomUUID() }, actor.actorRef);
  await packs.approveAttachment(ctx, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
  const ready = await messages.read(ctx, caseId);
  let state = await messages.preview(ctx, caseId, { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: ready.readiness.caseRevision, packId: pack.id }, actor);
  if (deliver) {
    const view = state.latest!;
    state = await messages.command(ctx, caseId, { version: "recovery-message-command.v1", action: "approve", commandId: randomUUID(), messageId: view.id, expectedRevision: view.revision,
      recipient: view.message.recipient, body: view.message.body, amountPence: view.message.amountPence, packId: view.message.packId, contentHash: view.message.contentHash }, actor);
    state = await messages.command(ctx, caseId, { version: "recovery-message-command.v1", action: "advance", commandId: randomUUID(), messageId: state.latest!.id, expectedRevision: state.latest!.revision, outcome: "success" }, actor);
    expect(state.latest!.status).toBe("simulated_delivery");
  }
  const sandbox = new SandboxRepository(runtime), runId = (await sandbox.create(session, randomUUID())).id;
  await sandbox.advance(session, runId, randomUUID()); await sandbox.advance(session, runId, randomUUID());
  return { ...f, caseId, ctx, actor, runId, sourceId: state.latest!.id, sourceSequence: state.latest!.sequence, caseRevision: state.readiness.caseRevision };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const command = (f: Fixture) => ({ version: "recovery-follow-up-command.v1", action: "schedule", commandId: randomUUID(), sourceMessageId: f.sourceId, expectedCaseRevision: f.caseRevision });
async function transaction(f: Fixture) {
  const db = await runtime.connect();
  await db.query("BEGIN");
  await db.query("SET LOCAL statement_timeout='8s'");
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenantId]);
  return db;
}
async function insertSchedule(db: PoolClient, f: Fixture, createdTick = 2) {
  const id = randomUUID(), commandId = randomUUID(), requestHash = hash(commandId);
  await db.query(`INSERT INTO app.recovery_follow_up(id,tenant_id,job_id,case_id,run_id,source_message_id,source_message_sequence,case_revision,case_event_sequence,created_tick,due_tick,due_after_ticks,fixture_version,command_id,request_hash,actor_membership_id,environment)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9+1,1,'recovery-follow-up-fixture.v1',$10,$11,$12,'synthetic_demo')`,
    [id, f.tenantId, f.jobId, f.caseId, f.runId, f.sourceId, f.sourceSequence, f.caseRevision, createdTick, commandId, requestHash, f.memberId]);
  await db.query("INSERT INTO app.recovery_follow_up_owner(tenant_id,follow_up_id,run_id,owner_kind,environment) VALUES($1,$2,$3,'practice_fake_clock','synthetic_demo')", [f.tenantId, id, f.runId]);
  await db.query("INSERT INTO app.recovery_follow_up_event(id,tenant_id,job_id,case_id,follow_up_id,revision,kind,command_id,request_hash,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,1,'scheduled',$6,$7,$8,'synthetic_demo')", [randomUUID(), f.tenantId, f.jobId, f.caseId, id, commandId, requestHash, f.memberId]);
  return id;
}
async function advance(db: PoolClient, f: Fixture) {
  await db.query(`INSERT INTO app.sandbox_adapter_receipt(id,tenant_id,run_id,work_id,attempt_number,adapter,input_hash,output_hash,fake_clock_tick,environment,external_action_count)
    SELECT $1,tenant_id,run_id,id,1,adapter,input_hash,input_hash,3,'synthetic_demo',0 FROM app.sandbox_work WHERE tenant_id=$2 AND run_id=$3 AND step=3 ON CONFLICT(tenant_id,work_id,attempt_number) DO NOTHING`, [randomUUID(), f.tenantId, f.runId]);
  await db.query("INSERT INTO app.sandbox_run_event(id,tenant_id,run_id,event_index,kind,fake_clock_tick,command_id,payload_hash) VALUES($1,$2,$3,4,'advanced',3,$4,$5) ON CONFLICT(tenant_id,run_id,event_index) DO NOTHING", [randomUUID(), f.tenantId, f.runId, randomUUID(), hash(f.runId)]);
}
async function effects(f: Fixture) {
  const tables = ["decision_resolution", "action_authorization", "action_outbox", "recovery_message_sink", "journal", "recovery_fee_journal"];
  return Promise.all(tables.map(async table => (await admin.query(`SELECT count(*)::int AS n FROM app.${table} WHERE tenant_id=$1`, [f.tenantId])).rows[0].n));
}
async function assertDue(f: Fixture) {
  const counts = (await admin.query(`SELECT app.recovery_follow_up_run_tick($1,$2) AS tick,
    (SELECT count(*)::int FROM app.recovery_follow_up WHERE tenant_id=$1 AND case_id=$3) AS intents,
    (SELECT count(*)::int FROM app.recovery_follow_up_due WHERE tenant_id=$1 AND case_id=$3) AS due,
    (SELECT count(*)::int FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND case_id=$3 AND kind='became_due') AS events,
    (SELECT count(*)::int FROM app.decision d JOIN app.recovery_follow_up_due u ON u.tenant_id=d.tenant_id AND u.decision_id=d.id WHERE u.tenant_id=$1 AND u.case_id=$3) AS decisions,
    (SELECT count(*)::int FROM app.audit_event a JOIN app.recovery_follow_up_due u ON u.tenant_id=a.tenant_id AND u.audit_event_id=a.id WHERE u.tenant_id=$1 AND u.case_id=$3 AND a.event_type='recovery.follow_up.became_due') AS audits`, [f.tenantId, f.runId, f.caseId])).rows[0];
  expect(counts).toEqual({ tick: 3, intents: 1, due: 1, events: 1, decisions: 1, audits: 1 });
  const history = (await admin.query("SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND subject_ref IN (SELECT id::text FROM app.recovery_follow_up WHERE tenant_id=$1 AND case_id=$2) AND event_type IN ('recovery.follow_up.time_advanced','recovery.follow_up.became_due') ORDER BY sequence", [f.tenantId, f.caseId])).rows;
  expect(history.map(row => row.event_type)).toEqual(["recovery.follow_up.time_advanced", "recovery.follow_up.became_due"]);
  const rows = (await admin.query(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,trim(payload_hash) AS "payloadHash",trim(previous_hash) AS "previousHash",trim(event_hash) AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [f.tenantId])).rows;
  expect(() => verifyAuditChain(rows)).not.toThrow();
}
// Observe a real lock waiter; no sleeps choose the winner, and a bounded query timeout catches deadlocks.
async function waitBlocked(pid: number) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if ((await admin.query("SELECT cardinality(pg_blocking_pids($1)) AS n", [pid])).rows[0].n > 0) return;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  throw new Error("expected the competing transaction to wait on the run fence");
}

describe("MIGFIX-8", () => {
  it("MIGFIX-8.CATALOG private trigger helper gives runtime and infrastructure no callable capability", async () => {
    await expect(runtime.query("SELECT app.recovery_follow_up_run_fence()")).rejects.toMatchObject({ code: "42501" });
    const catalog = (await admin.query(`SELECT pg_get_userbyid(proowner) AS owner,prosecdef,
      has_function_privilege('jobguard_runtime',oid,'EXECUTE') AS runtime,
      has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') AS infrastructure
      FROM pg_proc WHERE oid='app.recovery_follow_up_run_fence()'::regprocedure`)).rows[0];
    expect(catalog).toEqual({ owner: "jobguard_migration", prosecdef: false, runtime: false, infrastructure: false });
  });
  it("MIGFIX-8.1 scheduling races the final advance without losing the due transition", async () => {
    const f = await fixture(), before = await effects(f), scheduling = await transaction(f), clock = await transaction(f);
    let pending: Promise<unknown> | undefined;
    try {
      await insertSchedule(scheduling, f); // Intent and required parts exist, but remain uncommitted.
      const pid = (await clock.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = advance(clock, f); void pending.catch(() => undefined);
      await waitBlocked(pid);
      await scheduling.query("COMMIT");
      await pending; await clock.query("COMMIT");
      // Inspect before any repository read or catch-up signal can repair the result.
      await assertDue(f); expect(await effects(f)).toEqual(before);
    } finally { await scheduling.query("ROLLBACK"); await clock.query("ROLLBACK"); await pending?.catch(() => undefined); scheduling.release(); clock.release(); }
  }, 30_000);

  it("MIGFIX-8.2 clock winner refuses a tick-2 schedule as stale and persists no unreachable intent", async () => {
    const f = await fixture(), before = await effects(f), clock = await transaction(f), scheduling = await transaction(f);
    let pending: Promise<unknown> | undefined;
    try {
      await advance(clock, f);
      const pid = (await scheduling.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = insertSchedule(scheduling, f); void pending.catch(() => undefined);
      await waitBlocked(pid); await clock.query("COMMIT");
      await expect(pending).rejects.toMatchObject({ code: "23514", message: "RECOVERY_FOLLOW_UP_CLOCK_INVALID" });
      await scheduling.query("ROLLBACK");
      await expect(new RecoveryFollowUpRepository(runtime).schedule(f.ctx, f.caseId, command(f), f.actor)).rejects.toMatchObject({ code: "RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED" });
      expect((await admin.query("SELECT count(*)::int AS n FROM app.recovery_follow_up WHERE tenant_id=$1 AND case_id=$2", [f.tenantId, f.caseId])).rows[0].n).toBe(0);
      expect(await effects(f)).toEqual(before);
    } finally { await clock.query("ROLLBACK"); await scheduling.query("ROLLBACK"); await pending?.catch(() => undefined); scheduling.release(); clock.release(); }
  }, 30_000);

  it("MIGFIX-8.3 repeat advance and recreated repositories leave one due effect and zero sends", async () => {
    const f = await fixture(), before = await effects(f), db = await transaction(f), firstClock = await transaction(f);
    let pending: Promise<unknown> | undefined;
    try {
      await insertSchedule(db, f);
      const pid = (await firstClock.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = advance(firstClock, f); void pending.catch(() => undefined);
      await waitBlocked(pid); await db.query("COMMIT"); await pending; await firstClock.query("COMMIT");
      await assertDue(f);
    } finally { await db.query("ROLLBACK"); await firstClock.query("ROLLBACK"); await pending?.catch(() => undefined); db.release(); firstClock.release(); }
    for (let i = 0; i < 2; i++) {
      const clock = await transaction(f);
      try { await advance(clock, f); await clock.query("COMMIT"); } finally { clock.release(); }
      await new RecoveryFollowUpRepository(runtime).signalDue(f.ctx, f.runId);
      expect((await new RecoveryFollowUpRepository(runtime).read(f.ctx, f.caseId)).latest!.state).toBe("review_reminder");
    }
    await assertDue(f); expect(await effects(f)).toEqual(before);
  });

  it("MIGFIX-8.4 two repository schedulers and advancement serialize without duplicate due effects or deadlock", async () => {
    const f = await fixture(), before = await effects(f), gate = await transaction(f), clock = await transaction(f);
    let runners: Promise<unknown>[] = [];
    try {
      await insertSchedule(gate, f);
      const pid = (await clock.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const moving = advance(clock, f).then(() => clock.query("COMMIT")); void moving.catch(() => undefined);
      runners = [moving];
      await waitBlocked(pid);
      runners = [new RecoveryFollowUpRepository(runtime).schedule(f.ctx, f.caseId, command(f), f.actor),
        new RecoveryFollowUpRepository(runtime).schedule(f.ctx, f.caseId, command(f), f.actor), moving];
      for (const runner of runners) void runner.catch(() => undefined);
      await gate.query("COMMIT");
      const results = await Promise.allSettled(runners);
      expect(results[2]!.status).toBe("fulfilled");
      for (const result of results.slice(0, 2)) {
        expect(result.status).toBe("rejected");
        if (result.status === "rejected") expect(["RECOVERY_FOLLOW_UP_ALREADY_ACTIVE", "RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED"]).toContain(result.reason.code);
      }
      await assertDue(f); expect(await effects(f)).toEqual(before);
    } finally { await gate.query("ROLLBACK"); await Promise.allSettled(runners); await clock.query("ROLLBACK"); gate.release(); clock.release(); }
  }, 30_000);

  it("MIGFIX-8.5 archived run, changed case and undelivered source preserve specific refusals and zero effects", async () => {
    for (const kind of ["archived", "changed", "undelivered"] as const) {
      const f = await fixture(kind !== "undelivered"), before = await effects(f), db = await transaction(f);
      try {
        if (kind === "archived") await db.query("INSERT INTO app.sandbox_run_event(id,tenant_id,run_id,event_index,kind,fake_clock_tick,command_id,payload_hash) VALUES($1,$2,$3,5,'archived',2,$4,$5)", [randomUUID(), f.tenantId, f.runId, randomUUID(), hash(f.runId)]);
        if (kind === "changed") await db.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,2,32000,'GBP','fixture-owner',$5)", [randomUUID(), f.tenantId, f.jobId, f.caseId, hash(f.caseId)]);
        await expect(insertSchedule(db, f)).rejects.toMatchObject({ code: "23514", message: kind === "archived" ? "RECOVERY_FOLLOW_UP_RUN_INVALID" : kind === "changed" ? "RECOVERY_FOLLOW_UP_CHANGED" : "RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED" });
        await db.query("ROLLBACK"); expect(await effects(f)).toEqual(before);
        expect((await admin.query("SELECT count(*)::int AS n FROM app.recovery_follow_up WHERE tenant_id=$1 AND case_id=$2", [f.tenantId, f.caseId])).rows[0].n).toBe(0);
      } finally { await db.query("ROLLBACK"); db.release(); }
    }
  });

  it("MIGFIX-8.3 sandbox repository concurrent final advances and restart preserve the three-step clock and zero external actions", async () => {
    const session = await issuePracticeSession(runtime), sandbox = new SandboxRepository(runtime), run = await sandbox.create(session, randomUUID());
    await sandbox.advance(session, run.id, randomUUID()); await sandbox.advance(session, run.id, randomUUID());
    const commandId = randomUUID();
    const results = await Promise.all([sandbox.advance(session, run.id, commandId), sandbox.advance(session, run.id, commandId)]);
    for (const result of results) expect(result).toMatchObject({ fakeClockTick: 3, stepCount: 3, realExternalActions: 0 });
    expect(await new SandboxRepository(runtime).advance(session, run.id, commandId)).toMatchObject({ fakeClockTick: 3, realExternalActions: 0 });
  });
});
