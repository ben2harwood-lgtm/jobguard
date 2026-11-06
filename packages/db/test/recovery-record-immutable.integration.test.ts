import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSyntheticInvoicePdf, money, recoveryCaseTermsHash } from "@jobguard/core";
import {
  DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, EvidencePackRepository,
  RecoveryCaseTermsRepository, RecoveryFollowUpRepository, RecoveryMessageRepository, SandboxRepository,
  bootstrapSyntheticDemo, issuePracticeSession,
  type RecoveryFollowUpState, type RecoveryMessageActor, type RecoveryMessageState, type VerifiedTenantContext,
} from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { permitPracticeHomeJob } from "./lp-practice-home-job-fixture.js";

// Current-schema synthetic recipe from recovery-follow-up.integration.test.ts.
// Keep the existing message/follow-up suites unchanged; use their real repositories here.
const password = "synthetic";
let postgres: EmbeddedPostgres, server: Pool, admin: Pool, runtime: Pool, directory: string, port: number;
let ctx: VerifiedTenantContext;
let token: string, digest: string;
let messages: RecoveryMessageRepository, packs: EvidencePackRepository, repo: RecoveryFollowUpRepository, sandbox: SandboxRepository;
let fixture: Awaited<ReturnType<typeof seedDemoFixture>>;
const actor: RecoveryMessageActor = { membershipId: DEMO_MEMBERSHIP_ID, actorRef: `membership:${DEMO_MEMBERSHIP_ID}` };
const reviewer = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const V = "recovery-follow-up-command.v1" as const;

/** Fixture-only exact activation inputs; the existing v3 routine checks the
 * owner, accepted document, authorization and lifecycle before binding v3. */
async function activatePursuitFixture(client: import("pg").PoolClient, tenant: string, job: string, expected: number) {
  const row = (await client.query("SELECT d.id,d.document_version,d.content_hash,m.id actor FROM app.quote_document_version d JOIN app.membership m ON m.tenant_id=d.tenant_id AND m.role='owner' AND m.revoked_at IS NULL WHERE d.tenant_id=$1 AND d.job_id=$2", [tenant, job])).rows[0];
  const command = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
  await client.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'job.switch_live',$3,$4,'processing',$5)", [command, tenant, `pursuit-fixture:${job}`, row.content_hash, row.actor]);
  await client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'job.switch_live')", [decision, tenant, job]);
  await client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenant, decision, row.actor]);
  await client.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'job.switch_live',$6,$7,'synthetic_demo_activation.v3',clock_timestamp()+interval '1 hour')", [authorization, tenant, decision, resolution, row.actor, row.content_hash, row.document_version]);
  const result = await client.query("SELECT app.switch_job_live_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [tenant, randomUUID(), randomUUID(), job, row.id, row.document_version, row.content_hash, expected, row.actor, command, authorization]);
  await client.query("UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2", [tenant, command]);
  return result;
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
    await permitPracticeHomeJob(client, { tenantId, jobId, title: "Recovery follow-up fixture job", practiceSessionDigest: sessionDigest, actorMembershipId: memberId });
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
    await activatePursuitFixture(client, tenantId, jobId, 2);
    await client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,'fixture/proof',$5,'image/png',$6,'standard_evidence','verified','proof-object-v1',now(),now()+interval '1 hour')", [uploadId, tenantId, jobId, scopeId, proofHash, proofBytes.length]);
    await client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,'fixture/proof','proof-object-v1','synthetic_demo','image/png',$5)", [tenantId, uploadId, jobId, scopeId, proofBytes]);
    await client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo','fixture/proof','proof-object-v1',$6,$7,'image/png','standard_evidence',now(),now())", [proofId, tenantId, uploadId, jobId, scopeId, proofHash, proofBytes.length]);
    await client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING", [tenantId, jobId]);
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
  await new RecoveryCaseTermsRepository(runtime).approve(ctx, fixture.jobId, {
    version: "recovery-case-terms-command.v1", action: "approve", commandId: randomUUID(), caseId: id,
    termsVersion: "synthetic_recovery_fee_terms.v1", feePolicyVersion: "reference_fee_policy_v3",
    eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", termsHash: recoveryCaseTermsHash(id),
  }, reviewer);
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
const scheduleCommand = (message: { id: string }, caseRevision: number, commandId: string = randomUUID()) => ({ version: V, action: "schedule" as const, commandId, sourceMessageId: message.id, expectedCaseRevision: caseRevision });
/** A delivered message, a fresh practice run, and a follow-up scheduled on its clock. */
async function scheduled(claimPence = 32000) {
  const base = await deliveredCase(claimPence);
  const runId = await newRun();
  const state = await repo.schedule(ctx, base.caseId, scheduleCommand(base.message, base.state.readiness.caseRevision), actor);
  return { ...base, runId, state, followUp: state.latest!, caseRevision: base.state.readiness.caseRevision };
}
const advance = (caseId: string, followUpId: string, runId: string, commandId: string = randomUUID()) =>
  repo.advanceTime(ctx, caseId, { version: V, action: "advance_time", commandId, followUpId }, actor, (run, command) => sandbox.advance(token, run, command)).then(state => ({ state, commandId, runId }));
const reviewCommand = (followUp: RecoveryFollowUpState["followUps"][number], state: RecoveryMessageState, commandId = randomUUID()) =>
  ({ version: V, action: "open_review" as const, commandId, followUpId: followUp.id, expectedRevision: followUp.revision, expectedCaseRevision: state.readiness.caseRevision, packId: state.readiness.packId! });
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
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-recovery-record-immutable-"));
  port = await freePort(62400, 200);
  const log: string[] = [];
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: message => { log.push(String(message)); } });
  try { await postgres.initialise(); await postgres.start(); } catch (error) { throw new Error(`${String(error)}\n${log.join("\n")}`); }
  server = new Pool({ host: "127.0.0.1", port, user: "postgres", password });
  await server.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
  await server.query("CREATE DATABASE jobguard_synthetic_demo OWNER neondb_owner");
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const base = `127.0.0.1:${port}/jobguard_synthetic_demo`;
  await bootstrapSyntheticDemo({ ownerUrl: `postgresql://neondb_owner:${password}@${base}`, runtimeUrl: `postgresql://jobguard_runtime:${password}@${base}` });
  runtime = new Pool({ connectionString: `postgresql://jobguard_runtime:${password}@${base}`, max: 2 });
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "jobguard_synthetic_demo", max: 2 });
  await installLegacySyntheticPartyFixtures(admin);
  token = await issuePracticeSession(runtime); digest = hash(token);
  fixture = await seedDemoFixture(admin, digest);
  ctx = testTenantContext(DEMO_TENANT_ID);
  messages = new RecoveryMessageRepository(runtime); packs = new EvidencePackRepository(runtime);
  repo = new RecoveryFollowUpRepository(runtime, messages); sandbox = new SandboxRepository(runtime);
}, 180_000);
afterAll(async () => { await closeTestPools(runtime, admin, server); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });


const coveredTables = [
  "recovery_message", "recovery_message_approval", "recovery_message_event", "recovery_message_sink",
  "recovery_follow_up", "recovery_follow_up_owner", "recovery_follow_up_event", "recovery_follow_up_due",
  "recovery_follow_up_reminder", "recovery_follow_up_advance",
] as const;
type CoveredTable = typeof coveredTables[number];
type Operation = "UPDATE" | "DELETE";

/** Run against one existing row as the owner, avoiding grant-based refusals and
 * FK-based false positives. Roll back each attempt even in the mutation case. */
async function assertRefused(client: PoolClient, table: CoveredTable, operation: Operation) {
  const before = await client.query(`SELECT ctid::text AS tid, to_jsonb(r) AS data FROM app.${table} r ORDER BY ctid LIMIT 1`);
  expect(before.rows, `${table} must contain a normally inserted row`).toHaveLength(1);
  await client.query("SAVEPOINT write_attempt");
  let error: unknown;
  try {
    if (operation === "UPDATE") {
      await client.query(`UPDATE app.${table} SET created_at=created_at+interval '1 second' WHERE ctid=$1::tid`, [before.rows[0].tid]);
    } else {
      await client.query(`DELETE FROM app.${table} WHERE ctid=$1::tid`, [before.rows[0].tid]);
    }
  } catch (caught) { error = caught; }
  finally {
    await client.query("ROLLBACK TO SAVEPOINT write_attempt");
    await client.query("RELEASE SAVEPOINT write_attempt");
  }
  expect(error, `${operation} on ${table} must hit the immutable guard`).toMatchObject({
    code: "55000", message: "decision and authorization records are immutable",
  });
  expect((await client.query(`SELECT to_jsonb(r) AS data FROM app.${table} r WHERE ctid=$1::tid`, [before.rows[0].tid])).rows)
    .toEqual([{ data: before.rows[0].data }]);
}

async function asOwner(run: (client: PoolClient) => Promise<void>) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE jobguard_migration");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    expect((await client.query("SELECT current_user AS role")).rows).toEqual([{ role: "jobguard_migration" }]);
    await run(client);
  } finally { await client.query("ROLLBACK"); client.release(); }
}

describe("LATER-SAFETY-104 owner-proof append-only recovery records", () => {
  beforeAll(async () => {
    // Fresh bootstrap applies every migration. These normal repository calls
    // insert into all ten tables, including the due, reminder and advance paths.
    const journey = await previewed();
    expect(journey.reminder.status).toBe("previewed");
    expect(journey.followUp.state).toBe("review_reminder");
    expect((await admin.query("SELECT count(*)::int n FROM app.recovery_message_sink WHERE case_id=$1", [journey.caseId])).rows)
      .toEqual([{ n: 1 }]);
  });

  it.each(coveredTables)("refuses owner UPDATE and DELETE of %s without changing its row", async table => {
    await asOwner(async client => {
      expect((await client.query("SELECT tableowner FROM pg_tables WHERE schemaname='app' AND tablename=$1", [table])).rows)
        .toEqual([{ tableowner: "jobguard_migration" }]);
      await assertRefused(client, table, "UPDATE");
      await assertRefused(client, table, "DELETE");
    });
  });

  it.each(coveredTables)("detects a scratch removal of the guard on %s and restores it", async table => {
    await asOwner(async client => {
      await client.query(`DROP TRIGGER recovery_record_immutable ON app.${table}`);
      // The very same assertions must fail with the new trigger removed. A FK
      // rejection of DELETE is insufficient: only this guard's 55000 is accepted.
      await expect(assertRefused(client, table, "UPDATE")).rejects.toThrow();
      await expect(assertRefused(client, table, "DELETE")).rejects.toThrow();
    }); // Transaction rollback restores the trigger and every scratch write.
    await asOwner(async client => {
      await assertRefused(client, table, "UPDATE");
      await assertRefused(client, table, "DELETE");
    });
  });
});
