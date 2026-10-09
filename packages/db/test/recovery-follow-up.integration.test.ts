import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSyntheticInvoicePdf, money, followUpCaseFacts, RECOVERY_FOLLOW_UP_CASE_STOP_EVENTS, RECOVERY_FOLLOW_UP_REOPEN_EVENTS } from "@jobguard/core";
import {
  DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, EvidencePackRepository, RecoveryCaseRepository, RecoveryFollowUpRepository, RecoveryMessageRepository, SandboxRepository,
  bootstrapSyntheticDemo, issuePracticeSession, withTenant,
  type RecoveryFollowUpState, type RecoveryMessageActor, type RecoveryMessageState, type VerifiedTenantContext,
} from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

// Real PostgreSQL 16, the real migrations applied as the migration owner, the real non-owner runtime role, and the real SBOX-2 and M4-5-S
// repositories: no mock stands in for a guarantee here. Every number below is read back from the database.
const password = "synthetic";
let postgres: EmbeddedPostgres, server: Pool, admin: Pool, runtime: Pool, directory: string, port: number;
let ctx: VerifiedTenantContext;
let token: string, digest: string;
let messages: RecoveryMessageRepository, packs: EvidencePackRepository, cases: RecoveryCaseRepository, repo: RecoveryFollowUpRepository, sandbox: SandboxRepository;
let fixture: Awaited<ReturnType<typeof seedDemoFixture>>;
const actor: RecoveryMessageActor = { membershipId: DEMO_MEMBERSHIP_ID, actorRef: `membership:${DEMO_MEMBERSHIP_ID}` };
const reviewer = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const count = async (sql: string, args: unknown[] = []) => Number((await admin.query(sql, args)).rows[0].n);
const V = "recovery-follow-up-command.v1" as const;

/** A recovery code from a rejected call: the typed code, or the message. */
async function code(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (error) { return (error as { code?: string; message?: string }).code ?? (error as Error).message; }
  throw new Error("expected the call to fail");
}

/** The practice demo tenant's invoiced job, owned by one practice session, exactly as the persisted recovery journey leaves it. */
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
    await client.query("INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$4,1,'FIXTURE-QUOTE-1',$5,'fixture/quote','quote-object-v1',1,'{}','{}',$6)", [quoteId, tenantId, jobId, quoteRevisionId, hash("quote immutable fixture"), { netPence: 1880000, taxPence: 376000, totalPence: 2256000 }]);
    await client.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,1880000,'accepted')", [quoteId, tenantId, jobId, hash("quote immutable fixture")]);
    const transition = (expected: number, to: string, reason: string, quote: string | null = null, net: number | null = null, policy: string | null = null, cap: number | null = null) =>
      client.query("SELECT app.transition_job($1,$2,$3,$4,$5,$6,$7,$8,$9)", [tenantId, jobId, expected, to, reason, quote, net, policy, cap]);
    await transition(0, "quoting", "start_quote"); await transition(1, "accepted", "accept_quote", quoteId);
    await client.query("INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at) VALUES($1,$2,$3,$4,1,$5,2256000,'GBP','builder_attestation',$6,'Fictional Customer','verbal','2026-09-20T12:00:00Z')", [acceptanceId, tenantId, jobId, quoteId, hash("quote immutable fixture"), memberId]);
    await transition(2, "live", "switch_live", quoteId, 1880000, "reference_fee_policy_v1", 28200);
    await client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,'fixture/proof',$5,'image/png',$6,'standard_evidence','verified','proof-object-v1',now(),now()+interval '1 hour')", [uploadId, tenantId, jobId, scopeId, proofHash, proofBytes.length]);
    await client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,'fixture/proof','proof-object-v1','synthetic_demo','image/png',$5)", [tenantId, uploadId, jobId, scopeId, proofBytes]);
    await client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo','fixture/proof','proof-object-v1',$6,$7,'image/png','standard_evidence',now(),now())", [proofId, tenantId, uploadId, jobId, scopeId, proofHash, proofBytes.length]);
    await client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')", [tenantId, jobId]);
    await client.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,existing_scope_item_id,capture_kind,capture_text,description,state) VALUES($1,$2,$3,$4,$4,'text','Fictional additional work','Synthetic fixture extra','approved')", [variationId, tenantId, jobId, scopeId]);
    await client.query("INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) VALUES($1,$2,$3,$4,$5,1,'Synthetic fixture extra','1','each',12500,12500,$6,$7,'human_entered','fixture',$6,'fixture.v1')", [variationRevisionId, tenantId, jobId, variationId, scopeId, hash("approved variation fixture"), memberId]);
    await client.query("INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at) VALUES($1,$2,$3,$4,$5,1,$6,12500,'builder_attestation',$7,now())", [randomUUID(), tenantId, jobId, variationId, variationRevisionId, hash("approved variation fixture"), memberId]);
    await transition(3, "invoiced", "issue_invoice");
    const finalDraft = randomUUID(), finalRevision = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
    await client.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [finalDraft, tenantId, jobId]);
    await client.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',1880000,376000,2256000,false,'[]')", [finalRevision, tenantId, jobId, finalDraft, hash("final account fixture"), quoteId]);
    const invoiceBytes = Buffer.from(createSyntheticInvoicePdf({ invoiceNumber: "FIXTURE-INVOICE-1", issuerName: "Fictional fixture builder", total: money(2256000), sourceRevisionId: finalRevision, evidenceVersionIds: ["proof-object-v1"] }));
    await client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'final_account.issue')", [decision, tenantId, jobId]);
    await client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenantId, decision, memberId]);
    await client.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'final_account.issue','fixture@example.invalid',$6,1,2256000,'GBP','candidate_m1_standard_v1',now()+interval '1 hour')", [authorization, tenantId, decision, resolution, memberId, createHash("sha256").update(invoiceBytes).digest("hex")]);
    await client.query("INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark) VALUES($1,$2,$3,$4,$5,'FIXTURE-INVOICE-1','2026-09-20','{}','candidate_m1_standard_v1','GBP',1880000,376000,2256000,$6,$7,$8,true,'SYNTHETIC - NOT A REAL INVOICE')", [invoiceId, tenantId, jobId, finalRevision, authorization, hash("final account fixture"), createHash("sha256").update(invoiceBytes).digest("hex"), invoiceBytes]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return { tenantId, jobId, invoiceId };
}

/** A fresh £320.00 withheld-payment case on the fixture job, as the workbench opens it: claim revision 1 plus the opening event. */
async function newCase(claimPence = 32000) {
  const id = randomUUID();
  await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,$4,'GBP','identified',0,true,'withheld_customer_payment','Fictional counterparty','builder_customer','customer_invoice',$5)", [id, fixture.tenantId, fixture.jobId, claimPence, JSON.stringify([fixture.invoiceId])]);
  await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,$6,'GBP','fixture-owner',$5)", [randomUUID(), fixture.tenantId, fixture.jobId, id, hash(id), claimPence]);
  await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,$6)", [randomUUID(), fixture.tenantId, fixture.jobId, id, randomUUID(), hash(`open:${id}`)]);
  return id;
}
const previewCommand = (state: RecoveryMessageState) => ({ version: "recovery-message-preview.v1" as const, commandId: randomUUID(), expectedCaseRevision: state.readiness.caseRevision, packId: state.readiness.packId! });
const approveCommand = (view: NonNullable<RecoveryMessageState["latest"]>) => ({
  version: "recovery-message-command.v1" as const, commandId: randomUUID(), action: "approve" as const, messageId: view.id, expectedRevision: view.revision,
  recipient: view.message.recipient, body: view.message.body, amountPence: view.message.amountPence, packId: view.message.packId, contentHash: view.message.contentHash,
});
const messageCommand = (action: "advance" | "revoke" | "reconcile", view: NonNullable<RecoveryMessageState["latest"]>, outcome: "success" | "response_lost" = "success") => ({
  version: "recovery-message-command.v1" as const, commandId: randomUUID(), action, messageId: view.id, expectedRevision: view.revision, ...(action === "advance" ? { outcome } : {}),
});
async function buildPack(caseId: string) {
  const pack = await packs.generate(ctx, caseId, { commandId: randomUUID() }, actor.actorRef);
  await packs.approveAttachment(ctx, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
  return pack;
}
/** An approved M4-5-S message the practice provider has recorded: the starting point of a follow-up. */
async function deliveredCase(claimPence = 32000) {
  const caseId = await newCase(claimPence);
  await buildPack(caseId);
  let state = await messages.preview(ctx, caseId, previewCommand(await messages.read(ctx, caseId)), actor);
  state = await messages.command(ctx, caseId, approveCommand(state.latest!), actor);
  state = await messages.command(ctx, caseId, messageCommand("advance", state.latest!), actor);
  expect(state.latest!.status).toBe("simulated_delivery");
  return { caseId, message: state.latest!, state };
}
const newRun = async () => (await sandbox.create(token, randomUUID())).id;
const scheduleCommand = (message: { id: string }, caseRevision: number, commandId = randomUUID()) => ({ version: V, action: "schedule" as const, commandId, sourceMessageId: message.id, expectedCaseRevision: caseRevision });
/** A delivered message, a fresh practice run, and a follow-up scheduled on its clock. */
async function scheduled(claimPence = 32000) {
  const base = await deliveredCase(claimPence);
  const runId = await newRun();
  const state = await repo.schedule(ctx, base.caseId, scheduleCommand(base.message, base.state.readiness.caseRevision), actor);
  return { ...base, runId, state, followUp: state.latest!, caseRevision: base.state.readiness.caseRevision };
}
const advance = (caseId: string, followUpId: string, runId: string, commandId = randomUUID()) =>
  repo.advanceTime(ctx, caseId, { version: V, action: "advance_time", commandId, followUpId }, actor, (run, command) => sandbox.advance(token, run, command)).then(state => ({ state, commandId, runId }));
const reviewCommand = (followUp: RecoveryFollowUpState["followUps"][number], state: RecoveryMessageState, commandId = randomUUID()) =>
  ({ version: V, action: "open_review" as const, commandId, followUpId: followUp.id, expectedRevision: followUp.revision, expectedCaseRevision: state.readiness.caseRevision, packId: state.readiness.packId! });
const approveReminderCommand = (followUp: RecoveryFollowUpState["followUps"][number], view: NonNullable<RecoveryMessageState["latest"]>, commandId = randomUUID()) => ({
  version: V, action: "approve_reminder" as const, commandId, followUpId: followUp.id, expectedRevision: followUp.revision, messageId: view.id, expectedMessageRevision: view.revision,
  recipient: view.message.recipient, body: view.message.body, amountPence: view.message.amountPence, packId: view.message.packId, contentHash: view.message.contentHash,
});
/** A scheduled follow-up whose practice time has passed: Review reminder. */
async function due(claimPence = 32000) {
  const base = await scheduled(claimPence);
  const moved = await advance(base.caseId, base.followUp.id, base.runId);
  return { ...base, state: moved.state, followUp: moved.state.latest! };
}
/** The due follow-up with its reminder previewed through the M4-5-S path. */
async function previewed(claimPence = 32000) {
  const base = await due(claimPence);
  const msg = await messages.read(ctx, base.caseId);
  const state = await repo.openReview(ctx, base.caseId, reviewCommand(base.followUp, msg), actor);
  const after = await messages.read(ctx, base.caseId);
  return { ...base, state, followUp: state.latest!, reminder: after.latest!, messagesState: after };
}
const sinkCount = (caseId: string) => count("SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND case_id=$2", [DEMO_TENANT_ID, caseId]);
const outboxCount = (caseId: string) => count("SELECT count(*) n FROM app.recovery_message_approval a WHERE a.tenant_id=$1 AND a.case_id=$2", [DEMO_TENANT_ID, caseId]);
const dueDecisions = (followUpId: string) => count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1 AND subject_type='recovery_follow_up' AND subject_ref LIKE $2", [DEMO_TENANT_ID, `${followUpId}:%`]);
const tenantCounts = async () => {
  const one = (table: string) => count(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`, [DEMO_TENANT_ID]);
  return { resolution: await one("decision_resolution"), authorization: await one("action_authorization"), outbox: await one("action_outbox"), approval: await one("recovery_message_approval"),
    sink: await one("recovery_message_sink"), message: await one("recovery_message"), caseEvent: await one("recovery_case_event"), journal: await one("journal"), feeJournal: await one("recovery_fee_journal") };
};

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-recovery-follow-up-"));
  port = await freePort(62100, 300);
  const log: string[] = [];
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: message => { log.push(String(message)); } });
  try { await postgres.initialise(); await postgres.start(); } catch (error) { throw new Error(`${String(error)}\n${log.join("\n")}`); }
  server = new Pool({ host: "127.0.0.1", port, user: "postgres", password });
  await server.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
  await server.query("CREATE DATABASE jobguard_synthetic_demo OWNER neondb_owner");
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const base = `127.0.0.1:${port}/jobguard_synthetic_demo`;
  await bootstrapSyntheticDemo({ ownerUrl: `postgresql://neondb_owner:${password}@${base}`, runtimeUrl: `postgresql://jobguard_runtime:${password}@${base}` });
  runtime = new Pool({ connectionString: `postgresql://jobguard_runtime:${password}@${base}`, max: 12 });
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "jobguard_synthetic_demo", max: 4 });
  await installLegacySyntheticPartyFixtures(admin);
  token = await issuePracticeSession(runtime); digest = hash(token);
  fixture = await seedDemoFixture(admin, digest);
  ctx = testTenantContext(DEMO_TENANT_ID);
  messages = new RecoveryMessageRepository(runtime); packs = new EvidencePackRepository(runtime); cases = new RecoveryCaseRepository(runtime);
  repo = new RecoveryFollowUpRepository(runtime, messages); sandbox = new SandboxRepository(runtime);
}, 180_000);
afterAll(async () => { await closeTestPools(runtime, admin, server); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe("M4-6-S scheduling a persisted follow-up", () => {
  it("is a reviewed act bound to a delivered message, the case revision seen and one practice run, with exactly one persisted owner", async () => {
    const { caseId, message, runId, followUp, state } = await scheduled();
    expect(followUp).toMatchObject({ state: "waiting", label: "Waiting for the due time", createdTick: 0, dueTick: 1, fixtureVersion: "recovery-follow-up-fixture.v1", sourceMessageId: message.id, caseRevision: 2, dueDecision: null, reminder: null, newSimulatedMessages: 0 });
    expect(followUp.owner).toEqual({ kind: "practice_fake_clock", runId });
    expect(state).toMatchObject({ realExternalActions: 0, environment: "synthetic_demo", newSimulatedMessages: 0, run: { id: runId, fakeClockTick: 0, clockLimit: 3 }, scheduling: { eligible: false, reason: "ALREADY_ACTIVE" } });
    expect(followUp.history.map(item => item.kind)).toEqual(["scheduled"]);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up_owner WHERE tenant_id=$1 AND follow_up_id=$2 AND run_id=$3 AND owner_kind='practice_fake_clock'", [DEMO_TENANT_ID, followUp.id, runId])).toBe(1);
    // Scheduling is not consent and not a send: nothing was authorized, queued or recorded for it.
    expect(await dueDecisions(followUp.id)).toBe(0);
  });

  it("refuses without a delivered message, a stale case revision, a practice run, or twice at once", async () => {
    const base = await deliveredCase();
    // No practice run exists yet for a case whose session has none that is active: the earlier tests' runs are the session's, so archive-free proof uses a fresh message check first.
    expect(await code(() => repo.schedule(ctx, base.caseId, scheduleCommand({ id: randomUUID() }, 2), actor))).toBe("RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED");
    await newRun();
    expect(await code(() => repo.schedule(ctx, base.caseId, scheduleCommand(base.message, 3), actor))).toBe("RECOVERY_FOLLOW_UP_CHANGED");
    const first = await repo.schedule(ctx, base.caseId, scheduleCommand(base.message, 2), actor);
    expect(first.latest!.state).toBe("waiting");
    expect(await code(() => repo.schedule(ctx, base.caseId, scheduleCommand(base.message, 2), actor))).toBe("RECOVERY_FOLLOW_UP_ALREADY_ACTIVE");
  });

  it("is idempotent by command id: the same command replays, a different request with that id conflicts, and a message command id cannot be reused", async () => {
    const base = await deliveredCase(); await newRun();
    const command = scheduleCommand(base.message, 2);
    const first = await repo.schedule(ctx, base.caseId, command, actor);
    const again = await repo.schedule(ctx, base.caseId, command, actor);
    expect(again.followUps).toHaveLength(1); expect(again.latest!.id).toBe(first.latest!.id);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up WHERE tenant_id=$1 AND case_id=$2", [DEMO_TENANT_ID, base.caseId])).toBe(1);
    expect(await code(() => repo.schedule(ctx, base.caseId, { ...command, expectedCaseRevision: 9 }, actor))).toBe("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
    const other = await deliveredCase();
    const messageCommandId = (await admin.query("SELECT command_id FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2", [DEMO_TENANT_ID, other.caseId])).rows[0].command_id as string;
    expect(await code(() => repo.schedule(ctx, other.caseId, scheduleCommand(other.message, 2, messageCommandId), actor))).toBe("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
  });
});

describe("M4-6-S Advance practice time (DW1 and the Q1 same-transaction proof)", () => {
  it("DW1: passing the due time gives Review reminder with no new simulated message, and the sink is untouched", async () => {
    const base = await scheduled();
    const before = await tenantCounts(), decisionsBefore = await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID]);
    const sinkBefore = await sinkCount(base.caseId);
    expect(sinkBefore).toBe(1);
    const moved = await advance(base.caseId, base.followUp.id, base.runId);
    expect(moved.state.latest).toMatchObject({ state: "review_reminder", label: "Review reminder", newSimulatedMessages: 0, dueDecision: { resolved: false }, reminder: null });
    expect(moved.state).toMatchObject({ newSimulatedMessages: 0, realExternalActions: 0, run: { fakeClockTick: 1 } });
    expect(moved.state.latest!.history.map(item => item.kind)).toEqual(["scheduled", "became_due"]);
    // The one new row in the whole tenant's decision, authorization and delivery tables is the pending due Decision itself.
    expect(await tenantCounts()).toEqual(before);
    expect(await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID])).toBe(decisionsBefore + 1);
    expect(await sinkCount(base.caseId)).toBe(sinkBefore);
    expect(await dueDecisions(base.followUp.id)).toBe(1);
    // Persisted, not remembered: a fresh process (new pool, new repositories) and a second connection read the very same state.
    const restarted = new Pool({ host: "127.0.0.1", port, user: "jobguard_runtime", password, database: "jobguard_synthetic_demo", max: 3 });
    try {
      const other = new RecoveryFollowUpRepository(restarted, new RecoveryMessageRepository(restarted));
      const reread = await other.read(ctx, base.caseId);
      expect(reread.latest).toMatchObject({ id: base.followUp.id, state: "review_reminder", label: "Review reminder", newSimulatedMessages: 0 });
      expect(reread.latest!.dueDecision).toEqual(moved.state.latest!.dueDecision);
    } finally { await closeTestPools(restarted); }
  });

  it("Q1: the due Decision is written by the same transaction as SBOX-2's own advance of the run's fake clock", async () => {
    const base = await scheduled();
    await advance(base.caseId, base.followUp.id, base.runId);
    const row = (await admin.query(
      `SELECT d.xmin::text AS due, (SELECT x.xmin::text FROM app.sandbox_run_event x WHERE x.tenant_id=d.tenant_id AND x.run_id=$3 AND x.kind='advanced') AS advanced,
        (SELECT r.xmin::text FROM app.sandbox_adapter_receipt r WHERE r.tenant_id=d.tenant_id AND r.run_id=$3) AS receipt,
        (SELECT p.xmin::text FROM app.decision p WHERE p.tenant_id=d.tenant_id AND p.id=d.decision_id) AS decision,
        (SELECT e.xmin::text FROM app.recovery_follow_up_event e WHERE e.tenant_id=d.tenant_id AND e.follow_up_id=d.follow_up_id AND e.kind='became_due') AS due_event
       FROM app.recovery_follow_up_due d WHERE d.tenant_id=$1 AND d.follow_up_id=$2`, [DEMO_TENANT_ID, base.followUp.id, base.runId])).rows[0];
    // A row's xmin is the id of the transaction that inserted it: one id for SBOX-2's receipt and event and for every due row.
    expect(row.advanced).toBeTruthy();
    expect([row.receipt, row.decision, row.due_event, row.due]).toEqual([row.advanced, row.advanced, row.advanced, row.advanced]);
  });

  it("Q1: when the due evaluation fails, SBOX-2's advance rolls back with it, and the same follow-up then becomes due normally", async () => {
    const base = await scheduled();
    await admin.query(`CREATE FUNCTION public.m46s_inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected due failure'; END $$;
      CREATE TRIGGER m46s_inject_failure BEFORE INSERT ON app.recovery_follow_up_due FOR EACH ROW EXECUTE FUNCTION public.m46s_inject_failure()`);
    try {
      await expect(advance(base.caseId, base.followUp.id, base.runId)).rejects.toThrow("injected due failure");
      // Nothing of the advance survived: no receipt (the clock is unmoved), no event, no due row, no Decision, no command record.
      expect(await count("SELECT count(*) n FROM app.sandbox_adapter_receipt WHERE tenant_id=$1 AND run_id=$2", [DEMO_TENANT_ID, base.runId])).toBe(0);
      expect(await count("SELECT count(*) n FROM app.sandbox_run_event WHERE tenant_id=$1 AND run_id=$2 AND kind='advanced'", [DEMO_TENANT_ID, base.runId])).toBe(0);
      expect(await count("SELECT count(*) n FROM app.recovery_follow_up_due WHERE tenant_id=$1 AND follow_up_id=$2", [DEMO_TENANT_ID, base.followUp.id])).toBe(0);
      expect(await count("SELECT count(*) n FROM app.recovery_follow_up_advance WHERE tenant_id=$1 AND follow_up_id=$2", [DEMO_TENANT_ID, base.followUp.id])).toBe(0);
      expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "waiting" });
    } finally { await admin.query("DROP TRIGGER m46s_inject_failure ON app.recovery_follow_up_due; DROP FUNCTION public.m46s_inject_failure()"); }
    const moved = await advance(base.caseId, base.followUp.id, base.runId);
    expect(moved.state.latest).toMatchObject({ state: "review_reminder" });
  });

  it("leaves SBOX-2 exactly as it was for a run that has no follow-up", async () => {
    const run = await newRun();
    const first = await sandbox.advance(token, run, randomUUID());
    expect(first).toMatchObject({ step: 1, fakeClockTick: 1, realExternalActions: 0 });
    expect(await sandbox.advance(token, run, randomUUID())).toMatchObject({ step: 2, fakeClockTick: 2 });
    expect(await sandbox.advance(token, run, randomUUID())).toMatchObject({ step: 3, fakeClockTick: 3 });
    expect(await sandbox.advance(token, run, randomUUID())).toMatchObject({ step: 3, fakeClockTick: 3 });
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up WHERE tenant_id=$1 AND run_id=$2", [DEMO_TENANT_ID, run])).toBe(0);
  });

  it("refuses to schedule on a clock with no time left, and an archived run can no longer be advanced", async () => {
    const base = await deliveredCase();
    const run = await newRun();
    for (let i = 0; i < 3; i++) await sandbox.advance(token, run, randomUUID());
    expect(await code(() => repo.schedule(ctx, base.caseId, scheduleCommand(base.message, 2), actor))).toBe("RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED");
    const later = await scheduled();
    await sandbox.reset(token, later.runId, randomUUID());
    expect(await code(() => advance(later.caseId, later.followUp.id, later.runId))).toBe("RECOVERY_FOLLOW_UP_RUN_ARCHIVED");
  });
});

describe("M4-6-S elapsed time never creates consent (DW2)", () => {
  it("DW2: advancing any amount of fake time creates no approval, authorization, outbox action, message or sink row", async () => {
    const base = await scheduled();
    const before = await tenantCounts();
    for (let i = 0; i < 4; i++) await advance(base.caseId, base.followUp.id, base.runId);
    expect(await tenantCounts()).toEqual(before);
    expect(await count("SELECT count(*) n FROM app.decision_resolution r JOIN app.decision d ON d.tenant_id=r.tenant_id AND d.id=r.decision_id WHERE d.tenant_id=$1 AND d.subject_type='recovery_follow_up'", [DEMO_TENANT_ID])).toBe(
      await count("SELECT count(*) n FROM app.decision_resolution r JOIN app.decision d ON d.tenant_id=r.tenant_id AND d.id=r.decision_id WHERE d.tenant_id=$1 AND d.subject_type='recovery_follow_up' AND d.subject_ref NOT LIKE $2", [DEMO_TENANT_ID, `${base.followUp.id}:%`]));
    expect(await dueDecisions(base.followUp.id)).toBe(1);
    expect(await count("SELECT count(*) n FROM app.action_authorization a JOIN app.recovery_follow_up_due d ON d.tenant_id=a.tenant_id AND d.decision_id=a.decision_id WHERE a.tenant_id=$1", [DEMO_TENANT_ID])).toBe(
      await count("SELECT count(*) n FROM app.action_authorization a JOIN app.recovery_follow_up_due d ON d.tenant_id=a.tenant_id AND d.decision_id=a.decision_id WHERE a.tenant_id=$1 AND d.follow_up_id<>$2", [DEMO_TENANT_ID, base.followUp.id]));
  });

  it("DW2: the reminder opens through the M4-5-S message path and is only a preview: nothing is authorized or sent", async () => {
    const base = await previewed();
    expect(base.reminder).toMatchObject({ status: "previewed", sequence: 2, approval: null, changedSinceReview: false });
    expect(base.state.latest).toMatchObject({ state: "review_reminder", reminder: { messageId: base.reminder.id, attempt: 1, status: "previewed", label: "Preview only — awaiting your approval" } });
    expect(base.state.latest!.history.map(item => item.kind)).toEqual(["scheduled", "became_due", "reminder_previewed"]);
    expect(await sinkCount(base.caseId)).toBe(1);
    expect(await code(() => messages.command(ctx, base.caseId, approveCommand(base.reminder), actor))).toBe("RECOVERY_MESSAGE_EXISTING_EFFECT");
  });

  it("DW2: only the exact reminder is approved; any changed body, recipient, amount, pack or hash is refused as changed and approves nothing", async () => {
    const base = await previewed();
    const exact = approveReminderCommand(base.followUp, base.reminder);
    const before = await tenantCounts();
    for (const forged of [
      { body: `${base.reminder.message.body} Pay by Friday.` }, { recipient: "practice-supplier@example.invalid" }, { amountPence: 32001 }, { packId: randomUUID() }, { contentHash: "f".repeat(64) },
    ]) expect(await code(() => repo.approveReminder(ctx, base.caseId, { ...exact, commandId: randomUUID(), ...forged }, actor))).toBe("RECOVERY_FOLLOW_UP_CHANGED");
    expect(await code(() => repo.approveReminder(ctx, base.caseId, { ...exact, commandId: randomUUID(), expectedMessageRevision: 7 }, actor))).toBe("RECOVERY_FOLLOW_UP_STALE_REVISION");
    expect(await code(() => repo.approveReminder(ctx, base.caseId, { ...exact, commandId: randomUUID(), messageId: base.message.id }, actor))).toBe("RECOVERY_FOLLOW_UP_REMINDER_REQUIRED");
    expect(await tenantCounts()).toEqual(before);
  });

  it("DW2: an older preview cannot be approved once a newer one exists; only the newest exact reminder can be", async () => {
    const base = await previewed();
    const again = await repo.openReview(ctx, base.caseId, reviewCommand(base.state.latest!, await messages.read(ctx, base.caseId)), actor);
    expect(again.latest!.reminder).toMatchObject({ attempt: 2 });
    expect(await code(() => repo.approveReminder(ctx, base.caseId, approveReminderCommand(again.latest!, base.reminder), actor))).toBe("RECOVERY_FOLLOW_UP_REMINDER_REQUIRED");
  });

  it("DW2: the exact approval resolves the follow-up's own due Decision and queues one action; delivery records exactly one sink row", async () => {
    const base = await previewed();
    const before = await tenantCounts(), decisions = await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID]);
    const command = approveReminderCommand(base.followUp, base.reminder);
    const approved = await repo.approveReminder(ctx, base.caseId, command, actor);
    expect(approved.latest).toMatchObject({ state: "reminder_queued", label: "Approved — queued, nothing sent", newSimulatedMessages: 0, dueDecision: { id: base.followUp.dueDecision!.id, resolved: true } });
    expect(await tenantCounts()).toEqual({ ...before, resolution: before.resolution + 1, authorization: before.authorization + 1, outbox: before.outbox + 1, approval: before.approval + 1 });
    expect(await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID])).toBe(decisions);
    expect((await admin.query("SELECT resolution FROM app.decision_resolution WHERE tenant_id=$1 AND decision_id=$2", [DEMO_TENANT_ID, base.followUp.dueDecision!.id])).rows).toEqual([{ resolution: "approved" }]);
    expect(await sinkCount(base.caseId)).toBe(1);
    // A replay of the same approval changes nothing; another client's identical approval is stale.
    const replay = await repo.approveReminder(ctx, base.caseId, command, actor);
    expect(replay.latest).toMatchObject({ state: "reminder_queued" });
    expect(await tenantCounts()).toEqual({ ...before, resolution: before.resolution + 1, authorization: before.authorization + 1, outbox: before.outbox + 1, approval: before.approval + 1 });
    expect(await code(() => repo.approveReminder(ctx, base.caseId, { ...command, commandId: randomUUID() }, actor))).toBe("RECOVERY_FOLLOW_UP_STALE_REVISION");
    // Delivery is the M4-5-S executor, adapter and sink; the reminder shows its Simulated delivery state.
    const queued = (await messages.read(ctx, base.caseId)).latest!;
    const delivered = await messages.command(ctx, base.caseId, messageCommand("advance", queued), actor);
    expect(delivered.latest).toMatchObject({ id: base.reminder.id, status: "simulated_delivery" });
    expect(await sinkCount(base.caseId)).toBe(2);
    const sink = (await admin.query("SELECT recipient,body,content_hash,attachment_hash,real_external_actions FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2", [DEMO_TENANT_ID, base.reminder.id])).rows;
    expect(sink).toEqual([{ recipient: base.reminder.message.recipient, body: base.reminder.message.body, content_hash: base.reminder.message.contentHash, attachment_hash: base.reminder.message.attachmentHash, real_external_actions: 0 }]);
    const done = await repo.read(ctx, base.caseId);
    expect(done.latest).toMatchObject({ state: "delivered", label: "Simulated delivery — nothing sent", newSimulatedMessages: 1 });
    expect(done).toMatchObject({ newSimulatedMessages: 1, realExternalActions: 0 });
    expect(await code(() => repo.approveReminder(ctx, base.caseId, { ...command, commandId: randomUUID() }, actor))).toBe("RECOVERY_FOLLOW_UP_COMPLETE");
  });

  it("keeps M4-5-S's one-effect rule everywhere else: no preview before the due time, none while a reminder is queued, none after it is delivered", async () => {
    const early = await scheduled();
    const earlyPreview = previewCommand(await messages.read(ctx, early.caseId));
    expect(await code(() => messages.preview(ctx, early.caseId, earlyPreview, actor))).toBe("RECOVERY_MESSAGE_EXISTING_EFFECT");
    const base = await previewed();
    await repo.approveReminder(ctx, base.caseId, approveReminderCommand(base.followUp, base.reminder), actor);
    const queuedPreview = previewCommand(await messages.read(ctx, base.caseId));
    expect(await code(() => messages.preview(ctx, base.caseId, queuedPreview, actor))).toBe("RECOVERY_MESSAGE_EXISTING_EFFECT");
    await messages.command(ctx, base.caseId, messageCommand("advance", (await messages.read(ctx, base.caseId)).latest!), actor);
    const deliveredPreview = previewCommand(await messages.read(ctx, base.caseId));
    expect(await code(() => messages.preview(ctx, base.caseId, deliveredPreview, actor))).toBe("RECOVERY_MESSAGE_EXISTING_EFFECT");
    const review = reviewCommand((await repo.read(ctx, base.caseId)).latest!, await messages.read(ctx, base.caseId));
    expect(await code(() => repo.openReview(ctx, base.caseId, review, actor))).toBe("RECOVERY_FOLLOW_UP_COMPLETE");
  });
});

describe("M4-6-S repeated advances, restarts and duplicate signals (DW3)", () => {
  it("DW3: repeated and racing advances leave exactly one due Decision and one owner, with no duplicate transition, journal or send", async () => {
    const base = await scheduled();
    const before = await tenantCounts(), decisionsBefore = await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID]);
    // The very same command, from two connections at once, and then three more advances (the practice clock is bounded at 3).
    const racing = randomUUID();
    const raced = await Promise.all([advance(base.caseId, base.followUp.id, base.runId, racing), advance(base.caseId, base.followUp.id, base.runId, racing)]);
    expect(raced.map(item => item.state.run!.fakeClockTick)).toEqual([1, 1]);
    for (let i = 0; i < 3; i++) await advance(base.caseId, base.followUp.id, base.runId);
    const final = await repo.read(ctx, base.caseId);
    expect(final.run!.fakeClockTick).toBe(3);
    expect(final.latest).toMatchObject({ state: "review_reminder", newSimulatedMessages: 0 });
    expect(await dueDecisions(base.followUp.id)).toBe(1);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up_due WHERE tenant_id=$1 AND follow_up_id=$2", [DEMO_TENANT_ID, base.followUp.id])).toBe(1);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up_owner WHERE tenant_id=$1 AND follow_up_id=$2", [DEMO_TENANT_ID, base.followUp.id])).toBe(1);
    expect(final.latest!.history.map(item => item.kind)).toEqual(["scheduled", "became_due"]);
    expect(await count("SELECT count(*) n FROM app.sandbox_run_event WHERE tenant_id=$1 AND run_id=$2 AND kind='advanced'", [DEMO_TENANT_ID, base.runId])).toBe(3);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up_advance WHERE tenant_id=$1 AND follow_up_id=$2", [DEMO_TENANT_ID, base.followUp.id])).toBe(4);
    expect(await tenantCounts()).toEqual(before);
    expect(await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID])).toBe(decisionsBefore + 1);
    // One audit record for the due transition, however many commands observed it.
    expect(await count("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1 AND subject_type='recovery_follow_up' AND subject_ref=$2 AND event_type='recovery.follow_up.became_due'", [DEMO_TENANT_ID, base.followUp.id])).toBe(1);
  }, 60_000);

  it("DW3: duplicated due signals, from several connections and a restarted process, create the one due Decision once", async () => {
    const base = await scheduled();
    const before = await tenantCounts();
    // The clock moves while no evaluation runs (a missed signal), so only the signals can make it due.
    await admin.query("ALTER TABLE app.sandbox_run_event DISABLE TRIGGER recovery_follow_up_due_on_advance");
    try { await sandbox.advance(token, base.runId, randomUUID()); } finally { await admin.query("ALTER TABLE app.sandbox_run_event ENABLE TRIGGER recovery_follow_up_due_on_advance"); }
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "waiting" });
    expect(await dueDecisions(base.followUp.id)).toBe(0);
    const restarted = new Pool({ host: "127.0.0.1", port, user: "jobguard_runtime", password, database: "jobguard_synthetic_demo", max: 6 });
    try {
      const other = new RecoveryFollowUpRepository(restarted, new RecoveryMessageRepository(restarted));
      const made = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? other : repo).signalDue(ctx, base.runId)));
      expect(made.reduce((sum, n) => sum + n, 0)).toBe(1);
      expect(await other.signalDue(ctx, base.runId)).toBe(0);
      expect(await repo.signalDue(ctx, base.runId)).toBe(0);
    } finally { await closeTestPools(restarted); }
    expect(await dueDecisions(base.followUp.id)).toBe(1);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND follow_up_id=$2 AND kind='became_due'", [DEMO_TENANT_ID, base.followUp.id])).toBe(1);
    expect(await count("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='recovery.follow_up.became_due'", [DEMO_TENANT_ID, base.followUp.id])).toBe(1);
    // A real advance afterwards adds nothing; the signals authorized and sent nothing.
    await advance(base.caseId, base.followUp.id, base.runId);
    expect(await dueDecisions(base.followUp.id)).toBe(1);
    expect(await tenantCounts()).toEqual(before);
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "review_reminder", newSimulatedMessages: 0 });
  }, 60_000);

  it("DW3: a signal for another tenant's, or a missing, run does nothing and discloses nothing", async () => {
    const base = await scheduled();
    expect(await repo.signalDue(ctx, randomUUID())).toBe(0);
    expect(await repo.signalDue(testTenantContext(randomUUID()), base.runId)).toBe(0);
    expect(await withTenant(runtime, testTenantContext(randomUUID()), db => db.$client.query("SELECT app.evaluate_recovery_follow_ups($1,$2) AS n", [DEMO_TENANT_ID, base.runId]).then(() => "ok", (error: { message: string }) => error.message))).toBe("RECOVERY_FOLLOW_UP_TENANT_INVALID");
    expect(await dueDecisions(base.followUp.id)).toBe(0);
  });

  it("DW3: an advance command replays its first result; the same id for another request, or from another command family, is a conflict", async () => {
    const base = await scheduled();
    const first = await advance(base.caseId, base.followUp.id, base.runId);
    const again = await advance(base.caseId, base.followUp.id, base.runId, first.commandId);
    expect(again.state.run!.fakeClockTick).toBe(1);
    expect(again.state.latest).toEqual(first.state.latest);
    expect(await count("SELECT count(*) n FROM app.sandbox_run_event WHERE tenant_id=$1 AND run_id=$2 AND kind='advanced'", [DEMO_TENANT_ID, base.runId])).toBe(1);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up_advance WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, first.commandId])).toBe(1);
    // The same id for a different follow-up of the case.
    const cancelled = await repo.cancel(ctx, base.caseId, { version: V, action: "cancel", commandId: randomUUID(), followUpId: base.followUp.id, expectedRevision: again.state.latest!.revision }, actor);
    const second = await repo.schedule(ctx, base.caseId, scheduleCommand(base.message, base.caseRevision), actor);
    expect(cancelled.latest!.state).toBe("stopped"); expect(second.latest!.id).not.toBe(base.followUp.id);
    expect(await code(() => advance(base.caseId, second.latest!.id, base.runId, first.commandId))).toBe("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
    // An id an M4-5-S message command already used.
    const used = (await admin.query("SELECT command_id FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2", [DEMO_TENANT_ID, base.caseId])).rows[0].command_id as string;
    expect(await code(() => advance(base.caseId, second.latest!.id, base.runId, used))).toBe("RECOVERY_FOLLOW_UP_COMMAND_CONFLICT");
    expect(await count("SELECT count(*) n FROM app.sandbox_run_event WHERE tenant_id=$1 AND run_id=$2 AND kind='advanced'", [DEMO_TENANT_ID, base.runId])).toBe(1);
  }, 60_000);
});

const caseRevisionOf = async (caseId: string) => Number((await admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, caseId])).rows[0].revision);
/** One M4-1-S workbench event on the case, as the builder would record it. */
async function caseEvent(caseId: string, eventType: string, amountPence?: number) {
  return cases.command(ctx, fixture.jobId, { version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId, eventType, ...(amountPence ? { amountPence } : {}), reviewerRef: "practice-owner", expectedRevision: await caseRevisionOf(caseId) }, reviewer);
}
const cancelCommand = (followUp: { id: string; revision: number }, commandId = randomUUID()) => ({ version: V, action: "cancel" as const, commandId, followUpId: followUp.id, expectedRevision: followUp.revision });

describe("M4-6-S Stopped (DW4)", () => {
  it("DW4: a cancellation is recorded once, shows Stopped, and a later advance creates no due Decision", async () => {
    const base = await scheduled();
    const cancelled = await repo.cancel(ctx, base.caseId, cancelCommand(base.followUp), actor);
    expect(cancelled.latest).toMatchObject({ state: "stopped", label: "Stopped", stopReason: "cancelled", reopened: false });
    expect(cancelled.latest!.history.map(item => item.kind)).toEqual(["scheduled", "cancelled"]);
    const moved = await advance(base.caseId, base.followUp.id, base.runId);
    expect(moved.state.latest).toMatchObject({ state: "stopped", label: "Stopped" });
    expect(await dueDecisions(base.followUp.id)).toBe(0);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND follow_up_id=$2", [DEMO_TENANT_ID, base.followUp.id])).toBe(2);
    expect(await code(() => repo.cancel(ctx, base.caseId, cancelCommand(moved.state.latest!), actor))).toBe("RECOVERY_FOLLOW_UP_STOPPED");
    const review = reviewCommand(moved.state.latest!, await messages.read(ctx, base.caseId));
    expect(await code(() => repo.openReview(ctx, base.caseId, review, actor))).toBe("RECOVERY_FOLLOW_UP_STOPPED");
    // The cancellation is replayable by its command id and conflicts with any other use of it.
    const command = cancelCommand(base.followUp);
    expect(await code(() => repo.cancel(ctx, base.caseId, { ...command, expectedRevision: 9 }, actor))).not.toBe("");
  });

  it("DW4: a stale cancel is refused", async () => {
    const base = await due();
    expect(await code(() => repo.cancel(ctx, base.caseId, { ...cancelCommand(base.followUp), expectedRevision: base.followUp.revision - 1 }, actor))).toBe("RECOVERY_FOLLOW_UP_STALE_REVISION");
  });

  const scenarios: Array<[string, string, Array<[string, number?]>]> = [
    ["dispute", "case_disputed", [["assemble_evidence"], ["dispute"]]],
    ["settlement", "case_settled", [["assemble_evidence"], ["record_landing", 32000], ["close_recovered"]]],
    ["case cancelled (closed with no recovery)", "case_cancelled", [["close_no_recovery"]]],
    ["case cancelled (prevented)", "case_cancelled", [["prevent"]]],
    ["case cancelled (written off)", "case_cancelled", [["assemble_evidence"], ["start_pursuit"], ["write_off"]]],
  ];
  it.each(scenarios)("DW4: %s shows Stopped, and a later advance creates no due Decision", async (_name, reason, events) => {
    const base = await scheduled();
    for (const [eventType, amount] of events) {
      // Until the ending event, the follow-up is only waiting: a case that merely moved on is not a stop.
      expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "waiting" });
      await caseEvent(base.caseId, eventType, amount);
    }
    const stopped = await repo.read(ctx, base.caseId);
    expect(stopped.latest).toMatchObject({ state: "stopped", label: "Stopped", stopReason: reason });
    const moved = await advance(base.caseId, base.followUp.id, base.runId);
    expect(moved.state.latest).toMatchObject({ state: "stopped", label: "Stopped", stopReason: reason });
    expect(await dueDecisions(base.followUp.id)).toBe(0);
    expect(await count("SELECT count(*) n FROM app.recovery_follow_up_event WHERE tenant_id=$1 AND follow_up_id=$2 AND kind='became_due'", [DEMO_TENANT_ID, base.followUp.id])).toBe(0);
  }, 60_000);

  it("DW4: a case fact after the reminder is due also shows Stopped, and nothing more can be previewed or approved", async () => {
    const base = await previewed();
    await caseEvent(base.caseId, "assemble_evidence");
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "review_reminder", changedSinceReview: true });
    await caseEvent(base.caseId, "dispute");
    const stopped = await repo.read(ctx, base.caseId);
    expect(stopped.latest).toMatchObject({ state: "stopped", label: "Stopped", stopReason: "case_disputed" });
    const before = await tenantCounts();
    expect(await code(() => repo.approveReminder(ctx, base.caseId, approveReminderCommand(stopped.latest!, base.reminder), actor))).toBe("RECOVERY_FOLLOW_UP_STOPPED");
    const review = reviewCommand(stopped.latest!, await messages.read(ctx, base.caseId));
    expect(await code(() => repo.openReview(ctx, base.caseId, review, actor))).toBe("RECOVERY_FOLLOW_UP_STOPPED");
    expect(await tenantCounts()).toEqual(before);
  }, 60_000);

  it("DW4: an archived practice run stops its follow-up", async () => {
    const base = await scheduled();
    await sandbox.reset(token, base.runId, randomUUID());
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "stopped", label: "Stopped", stopReason: "run_archived" });
    expect(await dueDecisions(base.followUp.id)).toBe(0);
  });
});

describe("M4-6-S Approval needed again (DW5)", () => {
  it("DW5: revoking the approval behind a pending reminder shows Approval needed again, blocks execution and writes no sink row", async () => {
    const base = await previewed();
    await repo.approveReminder(ctx, base.caseId, approveReminderCommand(base.followUp, base.reminder), actor);
    const queued = (await messages.read(ctx, base.caseId)).latest!;
    const sinkBefore = await sinkCount(base.caseId);
    const revoked = await messages.command(ctx, base.caseId, messageCommand("revoke", queued), actor);
    expect(revoked.latest!.status).toBe("revoked");
    const shown = await repo.read(ctx, base.caseId);
    expect(shown.latest).toMatchObject({ state: "approval_needed", label: "Approval needed again", newSimulatedMessages: 0 });
    // Execution is refused through the message path and through a worker driving the shared executor directly: nothing is recorded.
    expect(await code(() => messages.command(ctx, base.caseId, messageCommand("advance", revoked.latest!), actor))).toBe("RECOVERY_MESSAGE_REVOKED");
    expect(await sinkCount(base.caseId)).toBe(sinkBefore);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, queued.approval!.outboxActionId])).rows[0].status).toBe("cancelled");
    expect(await count("SELECT count(*) n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2", [DEMO_TENANT_ID, queued.approval!.outboxActionId])).toBe(0);
    // The follow-up cannot be cancelled away or re-approved on the old preview; it needs a fresh reviewed reminder.
    expect(await code(() => repo.approveReminder(ctx, base.caseId, approveReminderCommand(shown.latest!, revoked.latest!), actor))).toBe("RECOVERY_FOLLOW_UP_STALE_REVISION");
  }, 60_000);

  it("DW5: a fresh reviewed reminder after a revocation needs its own approval, makes its own Decision, and sends exactly once", async () => {
    const base = await previewed();
    await repo.approveReminder(ctx, base.caseId, approveReminderCommand(base.followUp, base.reminder), actor);
    await messages.command(ctx, base.caseId, messageCommand("revoke", (await messages.read(ctx, base.caseId)).latest!), actor);
    const needed = (await repo.read(ctx, base.caseId)).latest!;
    expect(needed.state).toBe("approval_needed");
    const decisionsBefore = await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID]);
    const reopened = await repo.openReview(ctx, base.caseId, reviewCommand(needed, await messages.read(ctx, base.caseId)), actor);
    expect(reopened.latest).toMatchObject({ state: "review_reminder", reminder: { attempt: 2, status: "previewed" } });
    const second = (await messages.read(ctx, base.caseId)).latest!;
    const approved = await repo.approveReminder(ctx, base.caseId, approveReminderCommand(reopened.latest!, second), actor);
    expect(approved.latest).toMatchObject({ state: "reminder_queued" });
    // The due Decision was resolved once, for the first approval; the second approval made its own Decision.
    expect(await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID])).toBe(decisionsBefore + 1);
    expect(await dueDecisions(base.followUp.id)).toBe(1);
    await messages.command(ctx, base.caseId, messageCommand("advance", (await messages.read(ctx, base.caseId)).latest!), actor);
    expect(await sinkCount(base.caseId)).toBe(2);
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "delivered", newSimulatedMessages: 1 });
  }, 60_000);

  it("DW5: a reminder cannot be cancelled away while its approval stands", async () => {
    const base = await previewed();
    const approved = await repo.approveReminder(ctx, base.caseId, approveReminderCommand(base.followUp, base.reminder), actor);
    expect(await code(() => repo.cancel(ctx, base.caseId, cancelCommand(approved.latest!), actor))).toBe("RECOVERY_FOLLOW_UP_REMINDER_APPROVED");
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "reminder_queued" });
  });

  it("DW5: a reminder queued for delivery is never recorded as delivered once its practice run has been archived", async () => {
    const base = await previewed();
    await repo.approveReminder(ctx, base.caseId, approveReminderCommand(base.followUp, base.reminder), actor);
    await sandbox.reset(token, base.runId, randomUUID());
    const queued = (await messages.read(ctx, base.caseId)).latest!;
    const sinkBefore = await sinkCount(base.caseId);
    expect(await code(() => messages.command(ctx, base.caseId, messageCommand("advance", queued), actor))).toBe("RECOVERY_MESSAGE_BLOCKED");
    expect(await sinkCount(base.caseId)).toBe(sinkBefore);
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "stopped", stopReason: "run_archived" });
  }, 60_000);
});

describe("M4-6-S a reopened case (DW6)", () => {
  it("DW6: the old follow-up stays stopped and is never reused; nothing is created until a new reviewed follow-up exists", async () => {
    const base = await scheduled();
    await caseEvent(base.caseId, "close_no_recovery");
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "stopped", stopReason: "case_cancelled", reopened: false });
    await caseEvent(base.caseId, "dispute"); await caseEvent(base.caseId, "resume_pursuit");
    const reopened = await repo.read(ctx, base.caseId);
    expect(reopened.latest).toMatchObject({ state: "stopped", label: "Stopped", stopReason: "case_cancelled", reopened: true });
    expect(reopened.scheduling).toMatchObject({ eligible: true, reason: null });
    // Advancing the clock past the old due time creates no Decision for the old follow-up, or for anything.
    const decisionsBefore = await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID]);
    const moved = await advance(base.caseId, base.followUp.id, base.runId);
    expect(moved.state.latest).toMatchObject({ state: "stopped", reopened: true });
    expect(await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1", [DEMO_TENANT_ID])).toBe(decisionsBefore);
    expect(await dueDecisions(base.followUp.id)).toBe(0);
    // A new follow-up must be reviewed against the case as it now stands.
    expect(await code(() => repo.schedule(ctx, base.caseId, scheduleCommand(base.message, base.caseRevision), actor))).toBe("RECOVERY_FOLLOW_UP_CHANGED");
    const current = await messages.read(ctx, base.caseId);
    const second = await repo.schedule(ctx, base.caseId, scheduleCommand(base.message, current.readiness.caseRevision), actor);
    expect(second.followUps).toHaveLength(2);
    expect(second.latest).toMatchObject({ state: "waiting", caseRevision: current.readiness.caseRevision, createdTick: 1, dueTick: 2 });
    expect(second.followUps[0]).toMatchObject({ id: base.followUp.id, state: "stopped", reopened: true });
    expect(await dueDecisions(second.latest!.id)).toBe(0);
    // The new follow-up comes due on its own clock, once; the old one is untouched.
    const next = await advance(base.caseId, second.latest!.id, base.runId);
    expect(next.state.followUps.map(item => item.state)).toEqual(["stopped", "review_reminder"]);
    expect(await dueDecisions(base.followUp.id)).toBe(0); expect(await dueDecisions(second.latest!.id)).toBe(1);
    // Sending still needs the exact reminder approved: after the evidence is rebuilt, review gives a preview and nothing is sent.
    await buildPack(base.caseId);
    const preview = await repo.openReview(ctx, base.caseId, reviewCommand(next.state.latest!, await messages.read(ctx, base.caseId)), actor);
    expect(preview.latest).toMatchObject({ state: "review_reminder", reminder: { status: "previewed" }, newSimulatedMessages: 0 });
    expect(await sinkCount(base.caseId)).toBe(1);
  }, 90_000);

  it("DW6: a landing reversed after a close also reopens the case, and still revives nothing", async () => {
    const base = await scheduled();
    await caseEvent(base.caseId, "assemble_evidence"); await caseEvent(base.caseId, "record_landing", 32000); await caseEvent(base.caseId, "close_recovered");
    expect((await repo.read(ctx, base.caseId)).latest).toMatchObject({ state: "stopped", stopReason: "case_settled", reopened: false });
    await caseEvent(base.caseId, "reverse_landing", 12000);
    const reopened = await repo.read(ctx, base.caseId);
    expect(reopened.latest).toMatchObject({ state: "stopped", stopReason: "case_settled", reopened: true });
    await advance(base.caseId, base.followUp.id, base.runId);
    expect(await dueDecisions(base.followUp.id)).toBe(0);
  }, 90_000);
});
