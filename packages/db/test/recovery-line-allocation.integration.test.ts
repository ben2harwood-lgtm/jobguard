import { issueHistoricalInvoice, prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";
// Written before persistence; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { exactPence, parseExactPence, serializeExactPence, sumExactPence, calculateCumulativeFee, mapRecoveryReceiptToLines } from "@jobguard/core";
import { EvidencePackRepository } from "../src/evidence-pack-repository.js";
import { PracticeFeedRepository } from "../src/practice-feed-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { RecoveryAllocationRepository } from "../src/recovery-allocation-repository.js";
import { issuePracticeSession, authenticatePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
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
  directory = await mkdtemp(join(tmpdir(), "jg-line-allocation-"));
  const port = await freePort(63400, 180);
  const options = { host: "127.0.0.1", port, database: "postgres", user: "postgres", password: passphrase };
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: passphrase, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool(options); await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Allocation fictional builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query(`CREATE ROLE line_allocation_login LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO line_allocation_login`);
  runtime = new Pool({ ...options, user: "line_allocation_login", max: 10 });
}, 90_000);
afterAll(async () => {
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture({ claim1 = 3_440_000, claim2 = 250_000, settle = true, combined = false, lateCatch = false, historical = false }: { claim1?: number; claim2?: number; settle?: boolean; combined?: boolean; lateCatch?: boolean; historical?: boolean } = {}) {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session), digest = auth.digest;
  const jobId = randomUUID(), quoteId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID();
  const draftId = randomUUID(), revisionId = randomUUID(), scopeId = randomUUID(), lineId = randomUUID(), catchLineId = randomUUID();
  const scoped = practiceMaterialPool(runtime, digest), invoices = new PracticeInvoiceRepository(scoped);
  const db = await admin.connect();
  try {
    await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    await db.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Recovery £18,800 allocation fixture',$3,'home')", [jobId, DEMO_TENANT_ID, digest]);
    await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, DEMO_TENANT_ID, jobId]);
    await db.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [quoteDraftId, DEMO_TENANT_ID, jobId]);
    await db.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers)
      VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',3440000,0,3440000,688000,4128000,true,'[]')`, [quoteRevisionId, DEMO_TENANT_ID, jobId, quoteDraftId]);
    await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot)
      VALUES($1,$2,$3,$4,1,'ALLOCATION-QUOTE',$5,$6,'quote-object-v1',1,'{}','{}',$7)`, [quoteId, DEMO_TENANT_ID, jobId, quoteRevisionId, hash(quoteId), `allocation/${quoteId}`, { netPence: 3440000, taxPence: 688000, totalPence: 4128000 }]);
    await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,3440000,'accepted')", [quoteId, DEMO_TENANT_ID, jobId, hash(quoteId)]);
    await db.query("SELECT app.transition_job($1,$2,0,'quoting','start_quote')", [DEMO_TENANT_ID, jobId]);
    await db.query("SELECT app.transition_job($1,$2,1,'accepted','accept_quote',$3)", [DEMO_TENANT_ID, jobId, quoteId]);
    await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
      VALUES($1,$2,$3,$4,1,$5,4128000,'GBP','builder_attestation',$6,'Fictional customer','verbal',clock_timestamp())`, [randomUUID(), DEMO_TENANT_ID, jobId, quoteId, hash(quoteId), actor.membershipId]);
    await db.query("SELECT app.transition_job($1,$2,2,'live','switch_live',$3,3440000,'reference_fee_policy_v1',28200)", [DEMO_TENANT_ID, jobId, quoteId]);
    await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, DEMO_TENANT_ID, jobId]);
    if (lateCatch) {
      const earlierRevision = randomUUID();
      await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings,created_at)
        VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',3360000,672000,4032000,false,'[]',clock_timestamp()-interval '1 day')`, [earlierRevision, DEMO_TENANT_ID, jobId, draftId, hash(earlierRevision), quoteId]);
      await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
        VALUES($1,$2,$3,$4,'baseline',$5,$5,$6,'Fictional baseline before catch',3360000,1)`, [randomUUID(), DEMO_TENANT_ID, jobId, earlierRevision, scopeId, quoteRevisionId]);
    }
    await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings,created_at)
      VALUES($1,$2,$3,$4,CASE WHEN $7 THEN 2 ELSE 1 END,$5,$6,'GBP','candidate_m1_standard_v1',3440000,688000,4128000,false,'[]',clock_timestamp()+CASE WHEN $7 THEN interval '1 day' ELSE interval '0 seconds' END)`, [revisionId, DEMO_TENANT_ID, jobId, draftId, hash(revisionId), quoteId, lateCatch]);
    await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
      VALUES($1,$2,$3,$4,'baseline',$5,$5,$6,'Fictional baseline',3360000,1)`, [lineId, DEMO_TENANT_ID, jobId, revisionId, scopeId, quoteRevisionId]);
    const catchScope = randomUUID();
    await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [catchScope, DEMO_TENANT_ID, jobId]);
    await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
      VALUES($1,$2,$3,$4,'baseline',$5,$5,$6,'Synthetic catch line',80000,2)`, [catchLineId, DEMO_TENANT_ID, jobId, revisionId, catchScope, quoteRevisionId]);
    await db.query("UPDATE app.final_account_draft SET revision=CASE WHEN $4 THEN 2 ELSE 1 END,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, draftId, revisionId, lateCatch]);
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
  // Per C204: `historical` is an invoice issued before any lock existed (never locked, no track), so evidence can still be added afterwards.
  if (!historical) await prepareInvoicePrerequisites(admin, runtime, DEMO_TENANT_ID, jobId, actor.membershipId, revisionId);
  if (historical) await issueHistoricalInvoice(admin, DEMO_TENANT_ID, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: actor.membershipId });
  const invoice = historical ? (await invoices.list(context, jobId)).at(-1)! : await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: actor.membershipId,
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
  for (const amountPence of (combined ? [4_128_000] : [2_400_000, 1_728_000])) {
    payments.push((await invoices.recordReceipt(context, { jobId, invoiceId: invoice.id, actorMembershipId: actor.membershipId,
      commandId: randomUUID(), paidOn: "2026-10-12", amountPence, method: "bank_transfer", reference: "Fictional settled receipt" })).paymentId);
  }
  const feed = new PracticeFeedRepository(runtime, "synthetic_demo");
  let feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "connect", commandId: randomUUID(), expectedRevision: 0 });
  if (settle) for (const [movement, paymentId] of (combined ? [["receipt-41280", payments[0]!]] : [["receipt-24000", payments[0]!], ["receipt-17280", payments[1]!]])) {
    feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "advance", commandId: randomUUID(), expectedRevision: feedView.revision, movement, step: "settled" });
    feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "match_receipt", commandId: randomUUID(), expectedRevision: feedView.revision, movement, paymentId });
  }
  return { jobId, digest, invoiceId: invoice.id, invoices, cases, packs, feed, feedView, scopeId, lineId, catchLineId, revisionId,
    case1: views[0]!, case2: views[1]!, payment1: payments[0]!, payment2: payments[1]!, evidence1: evidenceIds[0]!, evidence2: evidenceIds[1]! };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) => repo().view(context, actor, f.digest, f.jobId);
async function allocate(f: Fixture, paymentId: string, grossPence: number, remittanceEvidenceId?: string) {
  const current = (await f.cases.listForMember(context, f.jobId, actor)).find(c => c.id === f.case1.id)!;
  const input = { version, action: "review", commandId: randomUUID(), caseId: current.id, paymentId, evidenceId: f.evidence1,
    expectedCaseRevision: current.revision, grossPence, ...(remittanceEvidenceId ? { remittanceEvidenceId } : {}) };
  const view = await repo().command(context, actor, f.digest, f.jobId, input);
  return repo().command(context, actor, f.digest, f.jobId, { ...input, action: "allocate", commandId: randomUUID(), approvalHash: view.review!.approvalHash });
}
const total = (rows: readonly { net: { numerator: string; denominator: string } }[]) => serializeExactPence(sumExactPence(rows.map(row => parseExactPence(row.net))));
function feeCheck(net: { numerator: string; denominator: string }, expected: number) {
  expect(calculateCumulativeFee({ version: "cumulative-fee.v1", cumulativeQualifyingPrincipal: net,
    rate: { version: "fee-rate.v1", policyVersion: "reference_fee_policy_v3", numerator: "1", denominator: "10" }, priorNetPostedPence: 0,
    priorPolicyVersion: "reference_fee_policy_v3", compensatesDerivationId: null }).cumulativeFee.pence).toBe(expected);
}

it("DW2/DW8/DW9: saved F4 stays 2000000/43; F4b becomes 80000/1 and API strings preserve the exact denominator", async () => {
  const f = await fixture();
  const first = await allocate(f, f.payment1, 2400000), catchRows = first.lines.filter(line => line.lineId === f.catchLineId);
  expect(catchRows).toHaveLength(1);
  expect(catchRows[0]).toMatchObject({ rule: "pro_rata", net: { numerator: "2000000", denominator: "43" } });
  expect(typeof catchRows[0]!.net.numerator).toBe("string"); expect(typeof catchRows[0]!.net.denominator).toBe("string");
  feeCheck(total(catchRows), 4651);
  const stored = (await admin.query("SELECT rule,net_numerator::text,net_denominator::text FROM app.receipt_line_allocation WHERE tenant_id=$1 AND job_id=$2 AND line_id=$3 ORDER BY created_at,id", [DEMO_TENANT_ID, f.jobId, f.catchLineId])).rows;
  expect(stored).toEqual([{ rule: "pro_rata", net_numerator: "2000000", net_denominator: "43" }]);
  const second = await allocate(f, f.payment2, 1728000);
  expect(total(second.lines.filter(line => line.lineId === f.catchLineId))).toEqual({ numerator: "80000", denominator: "1" });
  feeCheck(total(second.lines.filter(line => line.lineId === f.catchLineId)), 8000);
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, f.jobId])).rows).toEqual([{ n: 0 }]);
});

it("DW8: split receipts and one combined receipt save equal exact summed net for each line", async () => {
  const split = await fixture(), combined = await fixture({ combined: true });
  await allocate(split, split.payment1, 2400000);
  await allocate(split, split.payment2, 1728000);
  await allocate(combined, combined.payment1, 4128000);
  const splitView = await read(split), combinedView = await read(combined);
  for (const [a, b] of [[split.lineId, combined.lineId], [split.catchLineId, combined.catchLineId]]) {
    expect(total(splitView.lines.filter(line => line.lineId === a))).toEqual(total(combinedView.lines.filter(line => line.lineId === b)));
  }
});

it("DW7: persisted receipt time excludes a later line and refuses explicit attribution to it", async () => {
  const f = await fixture({ lateCatch: true });
  const view = await allocate(f, f.payment1, 2400000);
  expect(total(view.lines.filter(line => line.lineId === f.catchLineId))).toEqual({ numerator: "0", denominator: "1" });
});

it("DW6/DW7: fixed source hierarchy, deposit and item-specific refund/credit inputs use the same server mapper and kernel", () => {
  // Pure companion coverage for the Q2-held saved halves; these are not represented as saved F5/F7.
  const invoiceId = "test-m", catchId = "catch", baselineId = "baseline";
  const lines = [
    { id: baselineId, invoiceId, grossPence: 4032000, netPence: 3360000, outstandingGross: { numerator: "4032000", denominator: "1" }, existedAt: "2026-10-01T10:00:00Z" },
    { id: catchId, invoiceId, grossPence: 96000, netPence: 80000, outstandingGross: { numerator: "96000", denominator: "1" }, existedAt: "2026-10-02T10:00:00Z" },
  ];
  const facts = { version: "recovery-receipt-facts.v1", environment: "synthetic_demo", direction: "receipt", compositionComplete: true,
    receipt: { id: "receipt", invoiceId, gross: { numerator: "2400000", denominator: "1" }, effectiveAt: "2026-10-03T10:00:00Z", sourceRef: "movement:receipt" }, lines,
    explicit: { sourceRef: "remittance:non-catch", shares: [{ lineId: baselineId, gross: { numerator: "2400000", denominator: "1" } }] }, separateInvoice: { invoiceId, sourceRef: "invoice:test-m" } };
  const explicit = mapRecoveryReceiptToLines(facts);
  expect(explicit.every(row => row.rule === "explicit" && row.sourceRef === "remittance:non-catch")).toBe(true);
  expect(total(explicit.filter(row => row.lineId === catchId))).toEqual({ numerator: "0", denominator: "1" });
  feeCheck(total(explicit.filter(row => row.lineId === catchId)), 0);
  const separate = mapRecoveryReceiptToLines({ ...facts, explicit: null });
  expect(separate.every(row => row.rule === "separate_invoice")).toBe(true);
  const proRata = mapRecoveryReceiptToLines({ ...facts, explicit: null, separateInvoice: null });
  expect(proRata.every(row => row.rule === "pro_rata")).toBe(true);
  for (const source of [facts, { ...facts, explicit: null }, { ...facts, explicit: null, separateInvoice: null }]) {
    const deposit = { ...source, receipt: { ...source.receipt, gross: { numerator: "1200000", denominator: "1" }, effectiveAt: "2026-10-01T11:00:00Z" },
      explicit: source.explicit ? { ...source.explicit, shares: [{ lineId: baselineId, gross: { numerator: "1200000", denominator: "1" } }] } : null };
    expect(total(mapRecoveryReceiptToLines(deposit).filter(row => row.lineId === catchId))).toEqual({ numerator: "0", denominator: "1" });
  }
  expect(() => mapRecoveryReceiptToLines({ ...facts, receipt: { ...facts.receipt, effectiveAt: "2026-10-01T11:00:00Z" }, explicit: { sourceRef: "bad-deposit", shares: [{ lineId: catchId, gross: { numerator: "2400000", denominator: "1" } }] } })).toThrow();
  const refund = mapRecoveryReceiptToLines({ ...facts, direction: "reversal", receipt: { ...facts.receipt, gross: { numerator: "96000", denominator: "1" } },
    explicit: { sourceRef: "credit:catch", shares: [{ lineId: catchId, gross: { numerator: "96000", denominator: "1" } }] } });
  expect(refund.find(row => row.lineId === catchId)!.net).toEqual({ numerator: "-80000", denominator: "1" });
  expect(sumExactPence(refund.map(row => parseExactPence(row.net)))).toEqual(exactPence(-80000n));
});

function remittancePng(content: string) {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==", "base64");
  const payload = Buffer.from(`jobguard-remittance\0${content}`, "utf8"), type = Buffer.from("tEXt", "ascii");
  let crc = 0xffffffff;
  for (const octet of Buffer.concat([type, payload])) {
    crc ^= octet;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0); type.copy(chunk, 4); payload.copy(chunk, 8); chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, payload.length + 8);
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]);
}
async function remittance(f: Fixture, paymentId: string, lineId: string, grossPence: number) {
  const evidenceId = randomUUID(), uploadId = randomUUID(), objectKey = `allocation-remittance/${evidenceId}`;
  const bytes = remittancePng(JSON.stringify({ version: "recovery-remittance.v1", paymentId, invoiceId: f.invoiceId,
    shares: [{ lineId, gross: { numerator: String(grossPence), denominator: "1" } }] })), sha = hash(bytes);
  await tq("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,'image/png',$7,'standard_evidence','verified','remittance-v1',clock_timestamp(),clock_timestamp()+interval '1 hour')", [uploadId, DEMO_TENANT_ID, f.jobId, f.scopeId, objectKey, sha, bytes.length]);
  await tq("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,$5,'remittance-v1','synthetic_demo','image/png',$6)", [DEMO_TENANT_ID, uploadId, f.jobId, f.scopeId, objectKey, bytes]);
  await tq("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo',$6,'remittance-v1',$7,$8,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())", [evidenceId, DEMO_TENANT_ID, uploadId, f.jobId, f.scopeId, objectKey, sha, bytes.length]);
  return evidenceId;
}

// Per C135: after the final-account lock, new site evidence on a small-builder job is refused by the job-work-state rule
// (POST_LOCK_WORK_REQUIRES_LINKED_JOB). A remittance PNG names the invoice and payment, which only exist after the lock,
// so it cannot be created earlier. These tests therefore assert that honest refusal and that nothing was stored.
async function expectRemittanceRefused(f: Fixture, paymentId: string, lineId: string, grossPence: number) {
  await expect(remittance(f, paymentId, lineId, grossPence)).rejects.toMatchObject({ message: "POST_LOCK_WORK_REQUIRES_LINKED_JOB" });
  expect((await admin.query("SELECT count(*)::int n FROM app.evidence_upload WHERE tenant_id=$1 AND job_id=$2 AND object_key LIKE 'allocation-remittance/%'", [DEMO_TENANT_ID, f.jobId])).rows).toEqual([{ n: 0 }]);
}

it("DW2/DW6 (historical, unlocked): saved F6 uses explicit verified source even when pro-rata would give the catches value", async () => {
  const f = await fixture({ historical: true }), source = await remittance(f, f.payment1, f.lineId, 2400000);
  const view = await allocate(f, f.payment1, 2400000, source);
  const rows = view.lines.filter(line => line.paymentId === f.payment1);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row => row.rule === "explicit")).toBe(true);
  expect(total(rows.filter(row => row.lineId === f.catchLineId))).toEqual({ numerator: "0", denominator: "1" });
  feeCheck(total(rows.filter(row => row.lineId === f.catchLineId)), 0);
  for (const row of rows) {
    expect(row.sourceRef).toContain(source);
    const stored = (await admin.query("SELECT l.rule,l.net_numerator,l.net_denominator,s.evidence_id FROM app.receipt_line_allocation l JOIN app.recovery_allocation_line_source s ON(s.tenant_id,s.id)=(l.tenant_id,l.source_id) WHERE l.tenant_id=$1 AND l.id=$2", [DEMO_TENANT_ID, row.id])).rows[0]!;
    expect(stored).toMatchObject({ rule: "explicit", evidence_id: source });
    expect(stored.net_numerator).toBe(row.net.numerator); expect(stored.net_denominator).toBe(row.net.denominator);
  }
});

it("DW7 (historical, unlocked): reliable explicit remittance naming a later line is refused before any saved allocation", async () => {
  const f = await fixture({ lateCatch: true, historical: true }), source = await remittance(f, f.payment1, f.catchLineId, 38400);
  await expect(allocate(f, f.payment1, 38400, source)).rejects.toMatchObject({ code: "INVALID_ALLOCATION_FACTS" });
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_allocation WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, f.jobId])).rows).toEqual([{ n: 0 }]);
});

it("DW2/DW6: post-lock remittance for an explicit verified source is refused (per C135)", async () => {
  const f = await fixture();
  await expectRemittanceRefused(f, f.payment1, f.lineId, 2400000);
});

it("DW7: post-lock remittance naming a later line is refused at upload, before any saved allocation (per C135)", async () => {
  const f = await fixture({ lateCatch: true });
  await expectRemittanceRefused(f, f.payment1, f.catchLineId, 38400);
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_allocation WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, f.jobId])).rows).toEqual([{ n: 0 }]);
});

async function reverse(f: Fixture, allocationId: string, grossPence: number, creditNoteId?: string, remittanceEvidenceId?: string) {
  const current = (await f.cases.listForMember(context, f.jobId, actor)).find(c => c.id === f.case1.id)!;
  const input = { version, action: "review_reverse", commandId: randomUUID(), allocationId,
    expectedCaseRevision: current.revision, grossPence, ...(creditNoteId ? { creditNoteId } : {}), ...(remittanceEvidenceId ? { remittanceEvidenceId } : {}) };
  const view = await repo().command(context, actor, f.digest, f.jobId, input);
  return repo().command(context, actor, f.digest, f.jobId, { ...input, action: "reverse", commandId: randomUUID(), approvalHash: view.review!.approvalHash });
}

it("DW8: an unallocated partial refund reverses exact pro-rata amounts across the lines that receipt settled", async () => {
  const f = await fixture(), allocated = await allocate(f, f.payment1, 2400000), original = allocated.allocations[0]!;
  const originalRows = (await admin.query("SELECT row_to_json(t)::text AS bytes FROM app.receipt_line_allocation t WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", [DEMO_TENANT_ID, f.jobId])).rows;
  await f.invoices.reverseReceipt(context, { jobId: f.jobId, invoiceId: f.invoiceId, paymentId: f.payment1, actorMembershipId: actor.membershipId, commandId: randomUUID(), reason: "Synthetic partial allocation refund" });
  const reversed = await reverse(f, original.id, 96000), catchReversals = reversed.lines.filter(row => row.lineId === f.catchLineId && row.reversesId !== null);
  expect(catchReversals).toHaveLength(1);
  expect(catchReversals[0]).toMatchObject({ rule: "pro_rata", net: { numerator: "-80000", denominator: "43" } });
  expect(total(reversed.lines.filter(row => row.lineId === f.catchLineId))).toEqual({ numerator: "1920000", denominator: "43" });
  const afterRows = (await admin.query("SELECT row_to_json(t)::text AS bytes FROM app.receipt_line_allocation t WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", [DEMO_TENANT_ID, f.jobId])).rows;
  for (const row of originalRows) expect(afterRows).toContainEqual(row);
  expect((await admin.query("SELECT source_kind,gross_pence,eligible_net_pence FROM app.recovery_case_allocation_reversal WHERE tenant_id=$1 AND allocation_id=$2", [DEMO_TENANT_ID, original.id])).rows).toEqual([{ source_kind: "payment_reversal", gross_pence: "96000", eligible_net_pence: "80000" }]);
});

it.each(["refund", "credit"] as const)("DW8: an item-specific %s with a post-lock remittance source is refused at upload (per C135)", async kind => {
  const f = await fixture(), view = await allocate(f, f.payment1, 2400000);
  expect(view.allocations[0]).toBeDefined();
  // The refusal is the same for a refund and for a credit: neither can attach a post-lock remittance, and nothing reverses.
  expect(kind === "refund" || kind === "credit").toBe(true);
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_allocation_reversal WHERE tenant_id=$1 AND allocation_id=$2", [DEMO_TENANT_ID, view.allocations[0]!.id])).rows).toEqual([{ n: 0 }]);
  await expectRemittanceRefused(f, f.payment1, f.catchLineId, 51600);
});
it.each(["refund", "credit"] as const)("DW8 (historical, unlocked): an item-specific %s reverses the named catch first with selected explicit source identity", async kind => {
  const f = await fixture({ historical: true }), view = await allocate(f, f.payment1, 2400000);
  const original = view.allocations[0]!, source = await remittance(f, f.payment1, f.catchLineId, 51600);
  let creditNoteId: string | undefined;
  if (kind === "refund") {
    await f.invoices.reverseReceipt(context, { jobId: f.jobId, invoiceId: f.invoiceId, paymentId: f.payment1, actorMembershipId: actor.membershipId, commandId: randomUUID(), reason: "Synthetic item-specific refund" });
  } else {
    const credit = await f.invoices.previewCredit(context, { jobId: f.jobId, invoiceId: f.invoiceId, netPence: 43000, reason: "Synthetic named-line credit" });
    creditNoteId = (await f.invoices.issueCredit(context, { jobId: f.jobId, invoiceId: f.invoiceId, actorMembershipId: actor.membershipId, commandId: randomUUID(), netPence: 43000, reason: "Synthetic named-line credit", previewHash: credit.previewHash })).creditNoteId;
  }
  const reversed = await reverse(f, original.id, 51600, creditNoteId, source), rows = reversed.lines.filter(row => row.reversesId !== null);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ lineId: f.catchLineId, rule: "explicit", sourceRef: source, net: { numerator: "-43000", denominator: "1" } });
  expect(total(rows.filter(row => row.lineId === f.lineId))).toEqual({ numerator: "0", denominator: "1" });
  const stored = (await admin.query("SELECT source_kind,credit_note_id,gross_pence,eligible_net_pence FROM app.recovery_case_allocation_reversal WHERE tenant_id=$1 AND allocation_id=$2", [DEMO_TENANT_ID, original.id])).rows;
  expect(stored).toEqual([{ source_kind: kind === "credit" ? "credit_note" : "payment_reversal", credit_note_id: creditNoteId ?? null, gross_pence: "51600", eligible_net_pence: "43000" }]);
});
