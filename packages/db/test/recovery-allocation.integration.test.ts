import { prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";
// Written before persistence; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MAX_EXACT_PENCE_DIGITS } from "@jobguard/core";
import { EvidencePackRepository } from "../src/evidence-pack-repository.js";
import { PracticeFeedRepository } from "../src/practice-feed-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { RecoveryAllocationRepository } from "../src/recovery-allocation-repository.js";
import { RecoveryAllocationController } from "../../../apps/api/src/recovery-allocation.controller.js";
import { issuePracticeSession, authenticatePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { permitPracticeHomeJob } from "./lp-practice-home-job-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const context = testTenantContext(DEMO_TENANT_ID);
const actor = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
const priorEnvironment = process.env.JOBGUARD_ENV;
const passphrase = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const repo = (environment = "synthetic_demo", pool = runtime) => new RecoveryAllocationRepository(pool, environment);
const version = "recovery-allocation-command.v1";

// Evidence set-up inserts run on a live job, where app.guard_watchdog_input needs the tenant setting.
// Each one therefore runs in its own transaction after set_config('app.tenant_id', <tenant>, true).
const tq = async (sql: string, params: unknown[] = []) => {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  directory = await mkdtemp(join(tmpdir(), "jg-integration-"));
  const port = await freePort(63000, 180);
  const options = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "postgres", password: passphrase };
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: passphrase, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  admin = new Pool(options); await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Allocation fictional builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query(`CREATE ROLE allocation_integration_login LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO allocation_integration_login`);
  runtime = new Pool({ ...options, user: "allocation_integration_login", max: 10 });
}, 90_000);
afterAll(async () => {
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture({ claim1 = 32_000, claim2 = 250_000, settle = true }: { claim1?: number; claim2?: number; settle?: boolean } = {}) {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session), digest = auth.digest;
  const jobId = randomUUID(), quoteId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID();
  const draftId = randomUUID(), revisionId = randomUUID(), scopeId = randomUUID(), lineId = randomUUID();
  const scoped = practiceMaterialPool(runtime, digest), invoices = new PracticeInvoiceRepository(scoped);
  const db = await admin.connect();
  try {
    await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    await permitPracticeHomeJob(db, { tenantId: DEMO_TENANT_ID, jobId, title: "Recovery £18,800 allocation fixture", practiceSessionDigest: digest, actorMembershipId: DEMO_MEMBERSHIP_ID });
    await db.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Recovery £18,800 allocation fixture',$3,'home')", [jobId, DEMO_TENANT_ID, digest]);
    await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, DEMO_TENANT_ID, jobId]);
    await db.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [quoteDraftId, DEMO_TENANT_ID, jobId]);
    await db.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers)
      VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',1880000,0,1880000,376000,2256000,true,'[]')`, [quoteRevisionId, DEMO_TENANT_ID, jobId, quoteDraftId]);
    await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot)
      VALUES($1,$2,$3,$4,1,'ALLOCATION-QUOTE',$5,$6,'quote-object-v1',1,'{}','{}',$7)`, [quoteId, DEMO_TENANT_ID, jobId, quoteRevisionId, hash(quoteId), `allocation/${quoteId}`, { netPence: 1880000, taxPence: 376000, totalPence: 2256000 }]);
    await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,1880000,'accepted')", [quoteId, DEMO_TENANT_ID, jobId, hash(quoteId)]);
    await db.query("SELECT app.transition_job($1,$2,0,'quoting','start_quote')", [DEMO_TENANT_ID, jobId]);
    await db.query("SELECT app.transition_job($1,$2,1,'accepted','accept_quote',$3)", [DEMO_TENANT_ID, jobId, quoteId]);
    await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
      VALUES($1,$2,$3,$4,1,$5,2256000,'GBP','builder_attestation',$6,'Fictional customer','verbal',clock_timestamp())`, [randomUUID(), DEMO_TENANT_ID, jobId, quoteId, hash(quoteId), actor.membershipId]);
    await db.query("SELECT app.switch_job_live($1,$2,$3,$4,$5,$6,1,$7,2,1880000,28200,'synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',$8,clock_timestamp())", [DEMO_TENANT_ID, randomUUID(), randomUUID(), randomUUID(), jobId, quoteId, hash(quoteId), actor.membershipId]);
    await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, DEMO_TENANT_ID, jobId]);
    await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
      VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',1880000,376000,2256000,false,'[]')`, [revisionId, DEMO_TENANT_ID, jobId, draftId, hash(revisionId), quoteId]);
    await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
      VALUES($1,$2,$3,$4,'baseline',$5,$5,$6,'Fictional baseline',1880000,1)`, [lineId, DEMO_TENANT_ID, jobId, revisionId, scopeId, quoteRevisionId]);
    await db.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, draftId, revisionId]);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  const evidenceIds: string[] = [];
  for (let index = 0; index < 2; index++) {
    const evidenceId = randomUUID(), uploadId = randomUUID(), proofScopeId = randomUUID(), bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==", "base64");
    const objectKey = `allocation/${evidenceId}`, objectVersion = `proof-${index + 1}-v1`, proofHash = hash(bytes);
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [proofScopeId, DEMO_TENANT_ID, jobId]);
    await tq(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'image/png',$7,'standard_evidence','verified',$8,clock_timestamp(),clock_timestamp()+interval '1 hour')`, [uploadId, DEMO_TENANT_ID, jobId, proofScopeId, objectKey, proofHash, bytes.length, objectVersion]);
    await tq(`INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
      VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7)`, [DEMO_TENANT_ID, uploadId, jobId, proofScopeId, objectKey, objectVersion, bytes]);
    await tq(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
      VALUES($1,$2,$3,$4,$5,'original','site_photo',$6,$7,$8,$9,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())`, [evidenceId, DEMO_TENANT_ID, uploadId, jobId, proofScopeId, objectKey, objectVersion, proofHash, bytes.length]);
    evidenceIds.push(evidenceId);
  }
  await prepareInvoicePrerequisites(admin, runtime, DEMO_TENANT_ID, jobId, actor.membershipId, revisionId);
  const invoice = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: actor.membershipId,
    commandId: randomUUID(), recipient: "allocation@example.invalid", issuedOn: "2026-10-12" });
  const cases = new RecoveryCaseRepository(scoped), packs = new EvidencePackRepository(scoped), views = [];
  for (const claim of [claim1, claim2]) {
    let view = await cases.command(context, jobId, { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), expectedRevision: 0,
      caseType: "withheld_customer_payment", claimedNetPence: claim, counterparty: "Fictional customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: [invoice.id] }, actor);
    view = await cases.command(context, jobId, { version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(),
      caseId: view.id, expectedRevision: view.revision, eventType: "assemble_evidence" }, actor);
    view = await cases.eligibilityCommand(context, jobId, { version: "recovery-eligibility-command.v1", action: "review", commandId: randomUUID(), caseId: view.id,
      expectedCaseRevision: view.revision, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1, scenario: "evidence_backed_withheld_payment" }, actor);
    view = await cases.eligibilityCommand(context, jobId, { version: "recovery-eligibility-command.v1", action: "approve", commandId: randomUUID(), caseId: view.id,
      expectedCaseRevision: view.revision, expectedEvidenceRevision: 1, expectedPolicyRevision: 1, expectedReviewRevision: view.eligibility!.revision }, actor);
    const pack = await packs.generate(context, view.id, { commandId: randomUUID() }, `membership:${actor.membershipId}`);
    const approved = await packs.approveAttachment(context, view.id, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash,
      expectedContentHash: pack.contentHash }, `membership:${actor.membershipId}`);
    expect(approved.attachmentApprovalValid).toBe(true);
    views.push(view);
  }
  const payments: string[] = [];
  for (const amountPence of [38_400, 300_000]) {
    payments.push((await invoices.recordReceipt(context, { jobId, invoiceId: invoice.id, actorMembershipId: actor.membershipId,
      commandId: randomUUID(), paidOn: "2026-10-12", amountPence, method: "bank_transfer", reference: "Fictional settled receipt" })).paymentId);
  }
  const feed = new PracticeFeedRepository(runtime, "synthetic_demo");
  let feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "connect", commandId: randomUUID(), expectedRevision: 0 });
  if (settle) for (const [movement, paymentId] of [["receipt-384", payments[0]!], ["receipt-3000", payments[1]!]]) {
    feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "advance", commandId: randomUUID(), expectedRevision: feedView.revision, movement, step: "settled" });
    feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "match_receipt", commandId: randomUUID(), expectedRevision: feedView.revision, movement, paymentId });
  }
  return { session, jobId, digest, invoiceId: invoice.id, invoices, cases, packs, feed, feedView, scopeId, lineId, revisionId,
    case1: views[0]!, case2: views[1]!, payment1: payments[0]!, payment2: payments[1]!, evidence1: evidenceIds[0]!, evidence2: evidenceIds[1]! };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const allocationInput = (f: Fixture, which = 1, grossPence = which === 1 ? 38_400 : 300_000) => ({ version, action: "review", commandId: randomUUID(),
  caseId: which === 1 ? f.case1.id : f.case2.id, paymentId: which === 1 ? f.payment1 : f.payment2,
  evidenceId: which === 1 ? f.evidence1 : f.evidence2, expectedCaseRevision: which === 1 ? f.case1.revision : f.case2.revision, grossPence });
async function reviewed(f: Fixture, input = allocationInput(f)) {
  const view = await repo().command(context, actor, f.digest, f.jobId, input);
  expect(view.review).not.toBeNull();
  return { ...input, action: "allocate", commandId: randomUUID(), approvalHash: view.review!.approvalHash };
}
const read = (f: Fixture) => repo().view(context, actor, f.digest, f.jobId);
const run = (f: Fixture, raw: unknown) => repo().command(context, actor, f.digest, f.jobId, raw);
async function countRows(f: Fixture) {
  return (await admin.query(`SELECT
    (SELECT count(*)::int FROM app.recovery_case_allocation WHERE tenant_id=$1 AND job_id=$2) allocations,
    (SELECT count(*)::int FROM app.recovery_case_allocation_reversal WHERE tenant_id=$1 AND job_id=$2) reversals,
    (SELECT count(*)::int FROM app.receipt_line_allocation WHERE tenant_id=$1 AND job_id=$2) lines,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1 AND (payload->'references'->>'jobId'=$2::text OR (subject_type='job' AND subject_ref=$2::text))) audits`, [DEMO_TENANT_ID, f.jobId])).rows[0]!;
}
async function originals(f: Fixture) {
  const tables = ["customer_invoice", "customer_payment", "practice_feed_event", "practice_feed_receipt_match", "recovery_case_allocation", "receipt_line_allocation"];
  return Object.fromEntries(await Promise.all(tables.map(async table => [table,
    (await admin.query(`SELECT row_to_json(t)::text AS bytes FROM app.${table} t WHERE tenant_id=$1 AND job_id=$2 ORDER BY id`, [DEMO_TENANT_ID, f.jobId])).rows.map(row => row.bytes)])));
}

it("M4-8: matching suggestions read settled facts and approved cases without creating authority", async () => {
  const f = await fixture(), before = await countRows(f), view = await read(f);
  expect(view.suggestions).toHaveLength(4);
  expect(view.suggestions).toContainEqual({ caseId: f.case1.id, paymentId: f.payment1, expectedCaseRevision: f.case1.revision,
    grossPence: 38400, eligibleNetPence: 32000, taxPence: 6400, ambiguous: true, requiresHumanReview: true });
  expect(view.suggestions).toContainEqual({ caseId: f.case2.id, paymentId: f.payment2, expectedCaseRevision: f.case2.revision,
    grossPence: 300000, eligibleNetPence: 250000, taxPence: 50000, ambiguous: true, requiresHumanReview: true });
  expect(await countRows(f)).toEqual(before);
  expect((await read(await fixture({ settle: false }))).suggestions).toEqual([]);
  const other = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, other);
  await expect(repo().view(context, actor, auth.digest, f.jobId)).rejects.toMatchObject({ code: "ALLOCATION_NOT_FOUND" });
  await run(f, await reviewed(f));
  expect((await read(f)).suggestions?.every(row => row.caseId !== f.case1.id && row.paymentId !== f.payment1)).toBe(true);
});

it("M4-8: partial refund replays append once, retain the locked bill and reopen only the returned principal", async () => {
  const f = await fixture(); await run(f, await reviewed(f));
  const before = await originals(f), allocation = (await read(f)).allocations[0]!;
  const creditInput = { jobId: f.jobId, invoiceId: f.invoiceId, netPence: 5000, reason: "Fictional partial refund" };
  const preview = await f.invoices.previewCredit(context, creditInput);
  const credit = await f.invoices.issueCredit(context, { ...creditInput, actorMembershipId: actor.membershipId,
    commandId: randomUUID(), previewHash: preview.previewHash });
  expect((await read(f)).paused).toBe(true);
  const current = (await f.cases.listForMember(context, f.jobId, actor)).find(row => row.id === f.case1.id)!;
  const input = { version, action: "review_reverse", commandId: randomUUID(), allocationId: allocation.id,
    creditNoteId: credit.creditNoteId, expectedCaseRevision: current.revision, grossPence: 6000 };
  const review = await run(f, input);
  const confirm = { ...input, action: "reverse", commandId: randomUUID(), approvalHash: review.review!.approvalHash };
  await run(f, confirm); const counts = await countRows(f); await run(f, confirm);
  expect(await countRows(f)).toEqual(counts);
  const view = await read(f);
  expect(view).toMatchObject({ eligibleNetPence: 27000, allocatedTaxPence: 5400, paused: true });
  expect(view.cases.find(row => row.caseId === f.case1.id)).toMatchObject({ outstandingNetPence: 5000 });
  const after = await originals(f);
  for (const table of ["customer_invoice", "customer_payment", "practice_feed_event", "practice_feed_receipt_match", "recovery_case_allocation"]) expect(after[table]).toEqual(before[table]);
  await expect(run(f, { ...input, commandId: randomUUID(), expectedCaseRevision: current.revision + 1 })).rejects.toBeTruthy();
  expect(await countRows(f)).toEqual(counts);
});

it("paid-invoice credit remains readable and reversible", async () => {
  const f = await fixture();
  await run(f, await reviewed(f));
  const allocation = (await read(f)).allocations.find(row => row.paymentId === f.payment1)!;
  await f.invoices.recordReceipt(context, { jobId: f.jobId, invoiceId: f.invoiceId, actorMembershipId: actor.membershipId,
    commandId: randomUUID(), paidOn: "2026-10-12", amountPence: 2256000 - 38400 - 300000,
    method: "bank_transfer", reference: "Fictional remaining invoice payment" });
  const creditInput = { jobId: f.jobId, invoiceId: f.invoiceId, netPence: 32000, reason: "Fictional post-payment credit" };
  const preview = await f.invoices.previewCredit(context, creditInput);
  const credit = await f.invoices.issueCredit(context, { ...creditInput, actorMembershipId: actor.membershipId,
    commandId: randomUUID(), previewHash: preview.previewHash });
  // Credit document totals are signed corrections; allocation sources use the
  // separately stored positive amount, as established by UIWIRE-11.
  expect(credit.totalPence).toBe(-38400);
  const storedCredit = (await admin.query("SELECT amount_pence,total_pence FROM app.customer_credit_note WHERE tenant_id=$1 AND job_id=$2 AND id=$3",
    [DEMO_TENANT_ID, f.jobId, credit.creditNoteId])).rows[0]!;
  expect(storedCredit).toMatchObject({ amount_pence: "38400", total_pence: "-38400" });

  // No application, authentication or repository doubles: the issued session,
  // PostgreSQL routines and controller response parser drive this journey.
  const controller = new RecoveryAllocationController(runtime);
  const request = { headers: { cookie: `jg_session=${f.session}` } };
  await expect(controller.get(request, f.jobId, {})).resolves.toMatchObject({
    invoiceBalancePence: -38400,
    reversalSources: [{ allocationId: allocation.id, sourceId: credit.creditNoteId, kind: "credit_note", availableGrossPence: 38400 }],
  });
  const current = (await f.cases.listForMember(context, f.jobId, actor)).find(row => row.id === f.case1.id)!;
  const input = { version, action: "review_reverse", commandId: randomUUID(), allocationId: allocation.id,
    creditNoteId: credit.creditNoteId, expectedCaseRevision: current.revision, grossPence: 38400 };
  const review = await controller.reverse(request, f.jobId, input);
  expect(review).toMatchObject({ invoiceBalancePence: -38400,
    review: { action: "reverse", allocationId: allocation.id, grossPence: 38400, eligibleNetPence: 32000, taxPence: 6400 } });
  const approved = { ...input, action: "reverse", commandId: randomUUID(), approvalHash: review.review!.approvalHash };
  const reversed = await controller.reverse(request, f.jobId, approved);
  expect(reversed).toMatchObject({ invoiceBalancePence: -38400, eligibleNetPence: 0, allocatedTaxPence: 0, paused: true,
    reversalSources: [], allocations: [{ id: allocation.id, grossPence: 38400, reversedPence: 38400 }] });
  const beforeReplay = await countRows(f);
  await expect(controller.reverse(request, f.jobId, approved)).resolves.toEqual(reversed);
  expect(await countRows(f)).toEqual(beforeReplay);
});

it("DW1: approved £384 and £3,000 persist integer splits, provenance, Decisions and ordered audit", async () => {
  const f = await fixture();
  for (const which of [1, 2]) await run(f, await reviewed(f, allocationInput(f, which)));
  const view = await read(f);
  expect(view).toMatchObject({ grossMovementsPence: 338400, eligibleNetPence: 282000, allocatedTaxPence: 56400, invoiceBalancePence: 1917600 });
  expect(view.allocations).toHaveLength(2);
  for (const [index, expected] of [[0, [38400, 32000, 6400]], [1, [300000, 250000, 50000]]] as const) {
    const item = view.allocations.find(a => a.paymentId === (index === 0 ? f.payment1 : f.payment2))!;
    expect(item).toMatchObject({ caseId: index === 0 ? f.case1.id : f.case2.id, grossPence: expected[0], eligibleNetPence: expected[1], taxPence: expected[2],
      evidenceId: index === 0 ? f.evidence1 : f.evidence2, invoiceId: f.invoiceId, reviewerRef: `membership:${actor.membershipId}`, held: false });
    expect(item.authorizationId).toMatch(/^[a-f0-9-]{36}$/u);
    const stored = (await admin.query("SELECT * FROM app.recovery_case_allocation WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, item.id])).rows[0]!;
    expect(stored).toMatchObject({ tenant_id: DEMO_TENANT_ID, job_id: f.jobId, case_id: item.caseId, payment_id: item.paymentId,
      invoice_id: item.invoiceId, evidence_id: item.evidenceId, gross_pence: String(item.grossPence), eligible_net_pence: String(item.eligibleNetPence), tax_pence: String(item.taxPence),
      authorization_id: item.authorizationId, movement_id: item.movementId, reviewer_ref: item.reviewerRef });
    expect(String(stored.movement_hash).trim()).toBe(item.movementHash);
    expect(String(stored.evidence_hash).trim()).toBe(item.evidenceHash);
    expect(String(stored.policy_version)).toBe(item.policyVersion);
    const approval = (await admin.query(`SELECT r.resolution,a.amount_pence,a.content_hash,a.actor_membership_id FROM app.action_authorization a
      JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id) WHERE a.tenant_id=$1 AND a.id=$2`, [DEMO_TENANT_ID, item.authorizationId])).rows[0]!;
    expect(approval).toMatchObject({ resolution: "approved", amount_pence: String(item.grossPence), actor_membership_id: actor.membershipId });
  }
  expect(await read(f)).toEqual(view);
  expect(await new RecoveryAllocationRepository(runtime, "synthetic_demo").view(context, actor, f.digest, f.jobId)).toEqual(view);
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, f.jobId])).rows).toEqual([{ n: 0 }]);
});

it("DW3: excess settled cash, claim limits, reuse and stale approvals fail without persisted effects", async () => {
  const f = await fixture();
  for (const input of [allocationInput(f, 1, 38401), allocationInput(f, 1, 300000)]) {
    const before = await countRows(f);
    await expect(run(f, input)).rejects.toBeTruthy();
    expect(await countRows(f)).toEqual(before);
  }
  const command = await reviewed(f);
  const before = await countRows(f);
  await expect(run(f, { ...command, approvalHash: "0".repeat(64) })).rejects.toMatchObject({ code: "ALLOCATION_APPROVAL_CHANGED" });
  expect(await countRows(f)).toEqual(before);
  await run(f, command);
  const now = await countRows(f);
  await expect(run(f, { ...command, commandId: randomUUID() })).rejects.toBeTruthy();
  expect(await countRows(f)).toEqual(now);
  const latest = (await f.cases.listForMember(context, f.jobId, actor)).find(c => c.id === f.case1.id)!;
  await expect(run(f, { ...allocationInput(f), expectedCaseRevision: latest.revision })).rejects.toBeTruthy();
  expect(await countRows(f)).toEqual(now);
});

it("DW3/SB-26: case, payment and finalized evidence from another job are refused", async () => {
  const f = await fixture(), other = await fixture();
  for (const extra of [{ caseId: other.case1.id }, { paymentId: other.payment1 }, { evidenceId: other.evidence1 }]) {
    const before = await countRows(f);
    await expect(run(f, { ...allocationInput(f), ...extra })).rejects.toBeTruthy();
    expect(await countRows(f)).toEqual(before);
  }
});

it("DW4: approved merged receipt reversal appends linked reversals, reopens case and keeps originals byte-identical", async () => {
  const f = await fixture();
  for (const which of [1, 2]) await run(f, await reviewed(f, allocationInput(f, which)));
  const before = await originals(f), allocation = (await read(f)).allocations.find(a => a.paymentId === f.payment2)!;
  await f.invoices.reverseReceipt(context, { jobId: f.jobId, invoiceId: f.invoiceId, paymentId: f.payment2, actorMembershipId: actor.membershipId, commandId: randomUUID(), reason: "Synthetic £3,000 reversed" });
  expect((await read(f)).paused).toBe(true);
  const current = (await f.cases.listForMember(context, f.jobId, actor)).find(c => c.id === f.case2.id)!;
  const reviewInput = { version, action: "review_reverse", commandId: randomUUID(), allocationId: allocation.id, expectedCaseRevision: current.revision, grossPence: 300000 };
  const review = await run(f, reviewInput);
  await run(f, { ...reviewInput, action: "reverse", commandId: randomUUID(), approvalHash: review.review!.approvalHash });
  const view = await read(f);
  expect(view).toMatchObject({ eligibleNetPence: 32000, allocatedTaxPence: 6400, invoiceBalancePence: 2217600, paused: true });
  expect(view.cases.find(c => c.caseId === f.case2.id)).toMatchObject({ outstandingNetPence: 250000 });
  const after = await originals(f);
  for (const table of ["customer_invoice", "customer_payment", "practice_feed_event", "practice_feed_receipt_match", "recovery_case_allocation"]) expect(after[table]).toEqual(before[table]);
  for (const row of before.receipt_line_allocation!) expect(after.receipt_line_allocation).toContain(row);
  expect((await admin.query("SELECT allocation_id,gross_pence,eligible_net_pence,tax_pence FROM app.recovery_case_allocation_reversal WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, f.jobId])).rows)
    .toEqual([{ allocation_id: allocation.id, gross_pence: "300000", eligible_net_pence: "250000", tax_pence: "50000" }]);
  const reversedLines = view.lines.filter(l => l.reversesId !== null);
  expect(reversedLines.length).toBeGreaterThan(0);
  for (const line of reversedLines) expect(view.lines.some(original => original.id === line.reversesId && original.paymentId === line.paymentId && original.lineId === line.lineId)).toBe(true);
});

it("DW5: invalidating only allocation 2 evidence holds that allocation and leaves receipt/balance facts unchanged", async () => {
  const f = await fixture();
  for (const which of [1, 2]) await run(f, await reviewed(f, allocationInput(f, which)));
  const before = await originals(f);
  await withTenant(runtime, context, db => db.$client.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), DEMO_TENANT_ID, f.evidence2, actor.membershipId]));
  const view = await read(f);
  expect(view).toMatchObject({ grossMovementsPence: 338400, invoiceBalancePence: 1917600, paused: true });
  expect(view.allocations.find(a => a.caseId === f.case1.id)!.held).toBe(false);
  expect(view.allocations.find(a => a.caseId === f.case2.id)!.held).toBe(true);
  expect(await originals(f)).toEqual(before);
  // Q3 leaves the two display figures unspecified while held.
});

it("boundaries: strict clients cannot assert split, rule, fraction, settlement or reviewer authority", async () => {
  const f = await fixture();
  for (const extra of [{ eligibleNetPence: 32000 }, { taxPence: 6400 }, { rule: "explicit" }, { net: { numerator: "32000", denominator: "1" } }, { settlementState: "settled" }, { reviewerRef: "membership:forged" }]) {
    const before = await countRows(f);
    await expect(run(f, { ...allocationInput(f), ...extra })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(await countRows(f)).toEqual(before);
  }
  await expect(repo("production").command(context, actor, f.digest, f.jobId, allocationInput(f))).rejects.toMatchObject({ code: "ALLOCATION_SYNTHETIC_ONLY" });
  await expect(repo("pilot_no_charge").command(context, actor, f.digest, f.jobId, allocationInput(f))).rejects.toMatchObject({ code: "ALLOCATION_SYNTHETIC_ONLY" });
  await expect(repo().command(testTenantContext(randomUUID()), actor, f.digest, f.jobId, allocationInput(f))).rejects.toBeTruthy();
  const nonOwner = { membershipId: randomUUID(), identityUserId: randomUUID() };
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [nonOwner.identityUserId]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'member')", [nonOwner.membershipId, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, nonOwner.identityUserId]);
  await expect(repo().command(context, nonOwner, f.digest, f.jobId, allocationInput(f))).rejects.toMatchObject({ code: "ALLOCATION_FORBIDDEN" });
});

it("pending and unresolved possible-duplicate movement cannot be allocated", async () => {
  const f = await fixture({ settle: false });
  let feed = await f.feed.command(context, actor, f.digest, f.jobId, { version: "practice-feed-command.v1", action: "advance", commandId: randomUUID(), expectedRevision: f.feedView.revision, movement: "receipt-384", step: "pending" });
  await expect(run(f, allocationInput(f))).rejects.toBeTruthy();
  feed = await f.feed.command(context, actor, f.digest, f.jobId, { version: "practice-feed-command.v1", action: "advance", commandId: randomUUID(), expectedRevision: feed.revision, movement: "receipt-384", step: "settled" });
  await f.feed.command(context, actor, f.digest, f.jobId, { version: "practice-feed-command.v1", action: "advance", commandId: randomUUID(), expectedRevision: feed.revision, movement: "receipt-384", step: "unknown_duplicate" });
  await expect(run(f, allocationInput(f))).rejects.toBeTruthy();
  expect((await countRows(f)).allocations).toBe(0);
});

it("atomicity: failure of caller audit rolls back allocation, Decision, source binding and joined event", async () => {
  const f = await fixture(), command = await reviewed(f), before = await countRows(f);
  const counts = () => admin.query("SELECT (SELECT count(*) FROM app.decision WHERE tenant_id=$1)::int decisions,(SELECT count(*) FROM app.action_authorization WHERE tenant_id=$1)::int authorizations,(SELECT count(*) FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2)::int events", [DEMO_TENANT_ID, command.commandId]);
  const authorityBefore = (await counts()).rows;
  await admin.query(`CREATE FUNCTION public.fail_m4_8_s_caller_audit() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN
    IF NEW.event_type LIKE 'recovery.allocation.%' THEN RAISE EXCEPTION 'deliberate caller audit failure'; END IF; RETURN NEW; END $body$`);
  await admin.query("CREATE TRIGGER fail_m4_8_s_caller_audit BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION public.fail_m4_8_s_caller_audit()");
  try { await expect(run(f, command)).rejects.toThrow("deliberate caller audit failure"); }
  finally { await admin.query("DROP TRIGGER fail_m4_8_s_caller_audit ON app.audit_event"); await admin.query("DROP FUNCTION public.fail_m4_8_s_caller_audit()"); }
  expect(await countRows(f)).toEqual(before);
  expect((await counts()).rows).toEqual(authorityBefore);
});

it("C4/new build standard: every new table is tenant safe, FORCE RLS, migration owned and runtime SELECT only; real direct writes are denied", async () => {
  const names = ["recovery_allocation_command", "recovery_allocation_review", "recovery_allocation_line_source", "recovery_case_allocation", "recovery_case_allocation_reversal", "receipt_line_allocation"];
  const catalogue = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,
    has_table_privilege('jobguard_runtime',c.oid,'SELECT') can_select,
    has_table_privilege('jobguard_runtime',c.oid,'INSERT') can_insert,
    has_table_privilege('jobguard_runtime',c.oid,'UPDATE') can_update,
    has_table_privilege('jobguard_runtime',c.oid,'DELETE') can_delete,
    has_table_privilege('jobguard_runtime',c.oid,'TRUNCATE') can_truncate
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [names])).rows;
  expect(catalogue).toHaveLength(names.length);
  for (const row of catalogue) expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration", can_select: true,
    can_insert: false, can_update: false, can_delete: false, can_truncate: false });
  const f = await fixture(); await run(f, await reviewed(f));
  for (const name of names) {
    expect((await admin.query("SELECT attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attname='tenant_id'", [`app.${name}`])).rows).toEqual([{ attnotnull: true }]);
    const keys = (await admin.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND contype IN('p','u','f') ORDER BY oid", [`app.${name}`])).rows.map(row => row.definition as string);
    expect(keys.some(key => key.startsWith("PRIMARY KEY (tenant_id,")), `${name}: tenant-qualified primary key`).toBe(true);
    expect(keys.some(key => key.includes("FOREIGN KEY (tenant_id, job_id) REFERENCES app.job(tenant_id, id)")), `${name}: qualified job link`).toBe(true);
    for (const statement of [`INSERT INTO app.${name} DEFAULT VALUES`, `UPDATE app.${name} SET tenant_id=tenant_id`, `DELETE FROM app.${name}`, `TRUNCATE app.${name}`]) {
      await expect(withTenant(runtime, context, db => db.$client.query(statement))).rejects.toMatchObject({ code: "42501" });
    }
    expect((await withTenant(runtime, testTenantContext(randomUUID()), db => db.$client.query(`SELECT * FROM app.${name}`))).rows).toEqual([]);
    expect((await admin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal AND (tgtype&8)>0 AND (tgtype&16)>0", [`app.${name}`])).rows[0]!.n).toBeGreaterThan(0);
  }
  const fk = (await admin.query(`SELECT c.conrelid::regclass::text AS table_name,c.confrelid::regclass::text AS target,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c WHERE c.contype='f' AND c.conrelid=ANY($1::regclass[])`, [names.map(name => `app.${name}`)])).rows;
  for (const target of ["app.recovery_case", "app.customer_payment", "app.customer_invoice", "app.evidence_object", "app.final_account_line"]) {
    const matching = fk.filter(row => row.target === target);
    expect(matching.length, `${target}: allocator owns a direct qualified source link`).toBeGreaterThan(0);
    expect(matching.some(row => row.definition.includes("(tenant_id, job_id,")), `${target}: tenant and job must participate in the direct qualified identity`).toBe(true);
  }
  // The feed event has a tenant/account/event key. Combine it with the allocator's tenant/job/account FK,
  // rather than adding a new uniqueness constraint to the merged feed table.
  expect(fk.some(row => row.table_name === "app.recovery_case_allocation" && row.target === "app.practice_feed_event"
    && row.definition.includes("FOREIGN KEY (tenant_id, account_id, settled_event_id)"))).toBe(true);
  expect(fk.some(row => row.table_name === "app.recovery_case_allocation" && row.target === "app.practice_feed_account"
    && row.definition.includes("FOREIGN KEY (tenant_id, job_id, account_id)"))).toBe(true);
  const execute = (await admin.query(`SELECT p.prosecdef,pg_get_userbyid(p.proowner) AS owner,p.proconfig,
    ARRAY(SELECT CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END::text FROM aclexplode(p.proacl) x WHERE x.privilege_type='EXECUTE' ORDER BY 1) AS grantees
    FROM pg_proc p WHERE p.oid='app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb)'::regprocedure`)).rows[0]!;
  expect(execute).toMatchObject({ prosecdef: true, owner: "jobguard_migration", grantees: ["jobguard_migration", "jobguard_runtime"] });
  expect(execute.proconfig.join(" ")).toContain("search_path=pg_catalog, app");
});

it("DW3: direct checked SQL runtime calls refuse overcash, exhausted claim/evidence and cross-job invoice/line artifacts", async () => {
  const f = await fixture(), other = await fixture();
  const input = allocationInput(f), view = await run(f, input);
  const saved = (await admin.query("SELECT artifact FROM app.recovery_allocation_review WHERE tenant_id=$1 AND job_id=$2 AND approval_hash=$3", [DEMO_TENANT_ID, f.jobId, view.review!.approvalHash])).rows[0]!.artifact;
  const direct = (command: Record<string, unknown>, artifact: unknown) => withTenant(practiceMaterialPool(runtime, f.digest), context, async db => {
    await db.$client.query("SELECT set_config('app.recovery_allocation_environment','synthetic_demo',true)");
    return db.$client.query("SELECT app.write_recovery_allocation($1,$2,$3,$4::jsonb,$5::jsonb)", [DEMO_TENANT_ID, f.jobId, f.digest, command, artifact]);
  });
  const before = await countRows(f);
  await expect(direct({ ...input, commandId: randomUUID(), grossPence: 38406 }, { ...saved, grossPence: 38406, eligibleNetPence: 32005, taxPence: 6401 }))
    .rejects.toThrow("ALLOCATION_EXCEEDS_AVAILABLE");
  for (const artifact of [
    { ...saved, invoiceId: other.invoiceId },
    { ...saved, movementId: (await read(other)).receipts.find(receipt => receipt.paymentId === other.payment1)!.movementId },
    { ...saved, bindings: saved.bindings.map((binding: Record<string, unknown>) => ({ ...binding, lineId: other.lineId })) },
    { ...saved, lines: saved.lines.map((line: Record<string, unknown>) => ({ ...line, lineId: other.lineId })) },
  ]) await expect(direct({ ...input, commandId: randomUUID() }, artifact)).rejects.toBeTruthy();
  expect(await countRows(f)).toEqual(before);
  await run(f, { ...input, action: "allocate", commandId: randomUUID(), approvalHash: view.review!.approvalHash });
  const exhausted = await countRows(f);
  await expect(direct({ ...input, commandId: randomUUID(), expectedCaseRevision: input.expectedCaseRevision + 1 }, { ...saved, expectedCaseRevision: input.expectedCaseRevision + 1 }))
    .rejects.toThrow("ALLOCATION_EXCEEDS_AVAILABLE");
  expect(await countRows(f)).toEqual(exhausted);
});

it("DW3: evidenced amount below the claim prevents both repository and direct PostgreSQL approval", async () => {
  const f = await fixture(), input = allocationInput(f), view = await run(f, input);
  const saved = (await admin.query("SELECT artifact FROM app.recovery_allocation_review WHERE tenant_id=$1 AND job_id=$2 AND approval_hash=$3", [DEMO_TENANT_ID, f.jobId, view.review!.approvalHash])).rows[0]!.artifact;
  await admin.query(`INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash,previous_hash)
    SELECT $3,tenant_id,job_id,case_id,revision+1,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,31000,currency,reason,citations,status,reviewer_ref,$4,$5,subject_hash
    FROM app.recovery_eligibility_revision WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision DESC LIMIT 1`, [DEMO_TENANT_ID, f.case1.id, randomUUID(), randomUUID(), hash(randomUUID())]);
  const before = await countRows(f);
  const eligibilityId = (await admin.query("SELECT id FROM app.recovery_eligibility_revision WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision DESC LIMIT 1", [DEMO_TENANT_ID, f.case1.id])).rows[0]!.id;
  await expect(run(f, { ...input, commandId: randomUUID() })).rejects.toMatchObject({ code: "ALLOCATION_EXCEEDS_EVIDENCE" });
  await expect(withTenant(practiceMaterialPool(runtime, f.digest), context, async db => {
    await db.$client.query("SELECT set_config('app.recovery_allocation_environment','synthetic_demo',true)");
    return db.$client.query("SELECT app.write_recovery_allocation($1,$2,$3,$4::jsonb,$5::jsonb)", [DEMO_TENANT_ID, f.jobId, f.digest, { ...input, commandId: randomUUID() }, { ...saved, eligibilityId }]);
  })).rejects.toThrow("ALLOCATION_EXCEEDS_EVIDENCE");
  expect(await countRows(f)).toEqual(before);
});

it("persisted owner authorization is checked again before every approval and replay", async () => {
  const f = await fixture(), command = await reviewed(f), before = await countRows(f);
  await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, actor.membershipId]);
  try { await expect(run(f, command)).rejects.toMatchObject({ code: "ALLOCATION_FORBIDDEN" }); }
  finally { await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, actor.membershipId]); }
  expect(await countRows(f)).toEqual(before);
  await run(f, command); const saved = await countRows(f);
  await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, actor.membershipId]);
  try { await expect(run(f, command)).rejects.toMatchObject({ code: "ALLOCATION_FORBIDDEN" }); }
  finally { await admin.query("UPDATE app.membership SET expires_at=NULL WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, actor.membershipId]); }
  expect(await countRows(f)).toEqual(saved);
});

it.each(["dismissed", "rejected"] as const)("C5: a %s review Decision never authorizes an allocation", async resolution => {
  const f = await fixture(), input = allocationInput(f), view = await run(f, input), before = await countRows(f);
  const review = (await admin.query("SELECT decision_id FROM app.recovery_allocation_review WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, input.commandId])).rows[0]!;
  await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,$4,$5)", [randomUUID(), DEMO_TENANT_ID, review.decision_id, resolution, actor.membershipId]);
  await expect(run(f, { ...input, action: "allocate", commandId: randomUUID(), approvalHash: view.review!.approvalHash })).rejects.toMatchObject({ code: "ALLOCATION_APPROVAL_CHANGED" });
  expect(await countRows(f)).toEqual(before);
});

it("C5: an expired matching review cannot authorize an allocation", async () => {
  const f = await fixture(), input = allocationInput(f), view = await run(f, input), before = await countRows(f);
  // A labelled expired fixture appends to this leaf's new table; it never edits original source or approval rows.
  await admin.query(`INSERT INTO app.recovery_allocation_review(id,tenant_id,job_id,case_id,payment_id,allocation_id,command_id,action,expected_case_revision,artifact,approval_hash,decision_id,reviewer_ref,created_at,expires_at)
    SELECT $3,tenant_id,job_id,case_id,payment_id,allocation_id,$4,action,expected_case_revision,artifact,approval_hash,decision_id,reviewer_ref,clock_timestamp(),clock_timestamp()-interval '1 second'
    FROM app.recovery_allocation_review WHERE tenant_id=$1 AND command_id=$2`, [DEMO_TENANT_ID, input.commandId, randomUUID(), randomUUID()]);
  await expect(run(f, { ...input, action: "allocate", commandId: randomUUID(), approvalHash: view.review!.approvalHash })).rejects.toMatchObject({ code: "ALLOCATION_APPROVAL_CHANGED" });
  expect(await countRows(f)).toEqual(before);
});

// R2-3 (repair round 2, item 3): the four exact-fraction text columns of receipt_line_allocation keep EXACTLY the intended
// digit bound. The intended bound is MAX_EXACT_PENCE_DIGITS (260213, packages/core/src/cumulative-fee.ts): a numerator is an
// optional minus sign plus 1..260213 digits, a denominator is 1..260213 digits whose first digit is not zero. PostgreSQL
// regex repeat counts stop at 255, so the table checks are a shape test plus a length test; the original repeat-count
// patterns are kept below only as an oracle, because JavaScript has no such limit. Rows are inserted straight into the table
// as its owner (jobguard_migration, tenant set, foreign-key triggers skipped for the probe only, so every CHECK still fires)
// and every probe is rolled back. A refusal counts only when it is the column's own CHECK (23514), never the old
// "invalid regular expression" error, which also made every real row fail.
const fractionColumns = ["gross_numerator", "gross_denominator", "net_numerator", "net_denominator"] as const;
type FractionColumn = (typeof fractionColumns)[number];
async function probeFractionRow(column: FractionColumn, value: string) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query("SET LOCAL ROLE jobguard_migration");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    const values: Record<FractionColumn, string> = { gross_numerator: "1", gross_denominator: "1", net_numerator: "1", net_denominator: "1" };
    values[column] = value;
    try {
      await client.query(`INSERT INTO app.receipt_line_allocation(id,tenant_id,job_id,payment_id,invoice_id,line_id,allocation_id,source_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pro_rata','digit-bound-probe',$9,$10,$11,$12)`,
      [randomUUID(), DEMO_TENANT_ID, randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(),
        values.gross_numerator, values.gross_denominator, values.net_numerator, values.net_denominator]);
      return { accepted: true as const };
    } catch (error) {
      const failure = error as { code?: string; constraint?: string; message?: string };
      return { accepted: false as const, code: failure.code, constraint: failure.constraint, message: String(failure.message).slice(0, 160) };
    }
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

it("R2-3: receipt_line_allocation fraction columns accept and refuse exactly the intended 260213-digit bound, as the table owner", async () => {
  const MAX = MAX_EXACT_PENCE_DIGITS;
  expect(MAX).toBe(260213);
  const digitsOf = (count: number, digit = "1") => digit.repeat(count);
  const originalNumerator = new RegExp(`^-?[0-9]{1,${MAX}}$`), originalDenominator = new RegExp(`^[1-9][0-9]{0,${MAX - 1}}$`);
  const numerators: Array<[string, boolean]> = [
    ["0", true], ["-0", true], ["7", true], ["-7", true], ["007", true],
    [digitsOf(MAX - 1), true], [digitsOf(MAX), true], ["-" + digitsOf(MAX - 1), true], ["-" + digitsOf(MAX), true],
    [digitsOf(MAX + 1), false], [digitsOf(MAX + 2), false], ["-" + digitsOf(MAX + 1), false],
    ["", false], ["-", false], ["--1", false], ["+1", false], ["1-", false], ["1-1", false], ["1.5", false], ["1e3", false],
    [" 1", false], ["1 ", false], ["1\n", false], ["\n1", false], ["abc", false], ["١٢٣", false], ["−1", false],
  ];
  const denominators: Array<[string, boolean]> = [
    ["1", true], ["9", true], ["10", true], [digitsOf(MAX - 1), true], [digitsOf(MAX), true], ["9" + "0".repeat(MAX - 1), true],
    [digitsOf(MAX + 1), false], ["9" + "0".repeat(MAX), false],
    ["0", false], ["00", false], ["01", false], ["-1", false], ["", false], ["1.0", false], ["1 ", false], [" 1", false], ["1\n", false], ["1e3", false],
  ];
  const label = (value: string) => (value.length > 30 ? `${JSON.stringify(value.slice(0, 6))}... (${value.length} characters)` : JSON.stringify(value));
  for (const column of fractionColumns) {
    const numerator = column.endsWith("numerator");
    for (const [value, expected] of numerator ? numerators : denominators) {
      // The oracle is the intended original pattern; pin it to the literal expectation so the oracle itself cannot drift.
      expect((numerator ? originalNumerator : originalDenominator).test(value), `oracle ${column} ${label(value)}`).toBe(expected);
      const result = await probeFractionRow(column, value);
      if (expected) expect(result, `${column} ${label(value)} must be accepted`).toEqual({ accepted: true });
      else expect(result, `${column} ${label(value)} must be refused by its own CHECK`).toMatchObject({ accepted: false, code: "23514", constraint: `receipt_line_allocation_${column}_check` });
    }
  }
  // Short random strings over a hostile alphabet (signs, spaces, newlines, a non-ASCII digit): the table's verdict must equal the
  // original pattern's verdict for every one. Fixed seed, so the run is repeatable.
  let seed = 20261013;
  const next = () => { seed = (seed * 48271) % 2147483647; return seed; };
  const alphabet = ["0", "1", "7", "9", "-", "+", ".", "e", " ", "\n", "\u0663"];
  for (let attempt = 0; attempt < 150; attempt += 1) {
    let value = "";
    for (let position = next() % 7; position > 0; position -= 1) value += alphabet[next() % alphabet.length]!;
    for (const column of fractionColumns) {
      const expected = (column.endsWith("numerator") ? originalNumerator : originalDenominator).test(value);
      const result = await probeFractionRow(column, value);
      if (expected) expect(result, `${column} ${label(value)} must be accepted`).toEqual({ accepted: true });
      else expect(result, `${column} ${label(value)} must be refused by its own CHECK`).toMatchObject({ accepted: false, code: "23514", constraint: `receipt_line_allocation_${column}_check` });
    }
  }
  expect((await admin.query("SELECT count(*)::int n FROM app.receipt_line_allocation WHERE source_ref='digit-bound-probe'")).rows).toEqual([{ n: 0 }]);
}, 300_000);
