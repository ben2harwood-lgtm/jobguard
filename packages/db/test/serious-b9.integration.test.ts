// SERIOUS-B9 PostgreSQL regressions: NOT RUN locally; dispatcher/CI must execute.
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
  directory = await mkdtemp(join(tmpdir(), "jg-serious-b9-"));
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

async function fixture({ claim1 = 3_440_000, claim2 = 250_000, settle = true, combined = false, lateCatch = false,
 baselineNet = 3360000, catchNet = 80000, accountNet = baselineNet + catchNet, paymentAmounts = combined ? [4128000] : [2400000,1728000],
 movementNames = combined ? ["receipt-41280"] : ["receipt-24000","receipt-17280"], bound = false, subset = false
}: { claim1?: number; claim2?: number; settle?: boolean; combined?: boolean; lateCatch?: boolean; baselineNet?: number; catchNet?: number; accountNet?: number;
 paymentAmounts?: number[]; movementNames?: string[]; bound?: boolean; subset?: boolean } = {}) {
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
      VALUES($1,$2,$3,$4,CASE WHEN $7 THEN 2 ELSE 1 END,$5,$6,'GBP','candidate_m1_standard_v1',$8,$9,$10,false,'[]',clock_timestamp()+CASE WHEN $7 THEN interval '1 day' ELSE interval '0 seconds' END)`, [revisionId, DEMO_TENANT_ID, jobId, draftId, hash(revisionId), quoteId, lateCatch, accountNet, Math.floor((accountNet+2)/5), accountNet+Math.floor((accountNet+2)/5)]);
    await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
      VALUES($1,$2,$3,$4,'baseline',$5,$5,$6,'Fictional baseline',$7,1)`, [lineId, DEMO_TENANT_ID, jobId, revisionId, scopeId, quoteRevisionId, baselineNet]);
    const catchScope = randomUUID();
    await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [catchScope, DEMO_TENANT_ID, jobId]);
    await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
      VALUES($1,$2,$3,$4,'baseline',$5,$5,$6,'Synthetic catch line',$7,2)`, [catchLineId, DEMO_TENANT_ID, jobId, revisionId, catchScope, quoteRevisionId, catchNet]);
    await db.query("UPDATE app.final_account_draft SET revision=CASE WHEN $4 THEN 2 ELSE 1 END,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, draftId, revisionId, lateCatch]);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  const invoice = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: actor.membershipId,
    commandId: randomUUID(), recipient: "allocation@example.invalid", issuedOn: "2026-10-12" });
  if (bound) {
    await tq("INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,revision_id) VALUES($1,$2,$3,'interim',$4)", [DEMO_TENANT_ID,jobId,invoice.id,revisionId]);
    // Same saved display-tax facts as the issued-invoice path; this fixture bypasses
    // the unrelated Final Check setup to isolate allocation guards.
    const selected = subset ? [{ id: catchLineId, net: catchNet }] : [{ id: lineId, net: baselineNet }, { id: catchLineId, net: catchNet }];
    const tax = invoice.taxPence, totalWeight = selected.reduce((n,l)=>n+l.net,0);
    const parts = selected.map(l=>({ ...l, tax: Number(BigInt(tax)*BigInt(l.net)/BigInt(totalWeight)), remainder: BigInt(tax)*BigInt(l.net)%BigInt(totalWeight) }));
    const left = tax-parts.reduce((n,l)=>n+l.tax,0);
    const rank = [...parts].sort((a,b)=>a.remainder===b.remainder ? a.id.localeCompare(b.id) : a.remainder>b.remainder ? -1 : 1);
    for (let n=0;n<left;n++) rank[n]!.tax++;
    for (const l of parts) await tq(`INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
      SELECT tenant_id,job_id,$3,id,final_account_revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,$5,net_pence+$5 FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND id=$4`, [DEMO_TENANT_ID,jobId,invoice.id,l.id,l.tax]);
  }
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
  for (const amountPence of paymentAmounts) {
    payments.push((await invoices.recordReceipt(context, { jobId, invoiceId: invoice.id, actorMembershipId: actor.membershipId,
      commandId: randomUUID(), paidOn: "2026-10-12", amountPence, method: "bank_transfer", reference: "Fictional settled receipt" })).paymentId);
  }
  const feed = new PracticeFeedRepository(runtime, "synthetic_demo");
  let feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "connect", commandId: randomUUID(), expectedRevision: 0 });
  if (settle) for (const [movement, paymentId] of payments.map((paymentId,index)=>[movementNames[index]!,paymentId])) {
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

async function reverse(f: Fixture, allocationId: string, grossPence: number, creditNoteId?: string, remittanceEvidenceId?: string) {
  const current = (await f.cases.listForMember(context, f.jobId, actor)).find(c => c.id === f.case1.id)!;
  const input = { version, action: "review_reverse", commandId: randomUUID(), allocationId,
    expectedCaseRevision: current.revision, grossPence, ...(creditNoteId ? { creditNoteId } : {}), ...(remittanceEvidenceId ? { remittanceEvidenceId } : {}) };
  const view = await repo().command(context, actor, f.digest, f.jobId, input);
  return repo().command(context, actor, f.digest, f.jobId, { ...input, action: "reverse", commandId: randomUUID(), approvalHash: view.review!.approvalHash });
}


it.each([false,true])("S28: penny-valued lines conserve issued tax (saved binding %s)", async bound => {
 const f=await fixture({ baselineNet:16001, catchNet:15999, bound, paymentAmounts:[38400], movementNames:["receipt-384"] });
 const view=await allocate(f,f.payment1,38400);
 expect(total(view.lines)).toEqual({ numerator:"32000",denominator:"1" });
 expect(total(view.lines.filter(l=>l.lineId===f.lineId))).toEqual({ numerator:"16001",denominator:"1" });
 expect(total(view.lines.filter(l=>l.lineId===f.catchLineId))).toEqual({ numerator:"15999",denominator:"1" });
});
it("S29: supplementary composition excludes previously invoiced cumulative account lines", async () => {
 const f=await fixture({ accountNet:80000, bound:true, subset:true, paymentAmounts:[96000], movementNames:["receipt-960"] });
 const view=await allocate(f,f.payment1,96000);
 expect(view.lines).toHaveLength(1);
 expect(view.lines[0]).toMatchObject({ lineId:f.catchLineId,net:{numerator:"80000",denominator:"1"} });
});
it("S30: recorded remittance cannot be bypassed by omission or a direct artifact forgery", async () => {
 const f=await fixture(), source=await remittance(f,f.payment1,f.lineId,2400000);
 const current=(await f.cases.listForMember(context,f.jobId,actor)).find(c=>c.id===f.case1.id)!;
 const cmd={version,action:"review",commandId:randomUUID(),caseId:current.id,paymentId:f.payment1,evidenceId:f.evidence1,expectedCaseRevision:current.revision,grossPence:2400000,remittanceEvidenceId:source};
 await repo().command(context,actor,f.digest,f.jobId,cmd);
 const artifact=(await admin.query("SELECT artifact FROM app.recovery_allocation_review WHERE tenant_id=$1 AND command_id=$2",[DEMO_TENANT_ID,cmd.commandId])).rows[0].artifact;
 const forged={...artifact,remittanceEvidenceId:null,remittanceContent:null,remittanceBytes:null};
 await expect(withTenant(practiceMaterialPool(runtime,f.digest),context,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_allocation_environment','synthetic_demo',true)");
  return db.$client.query("SELECT app.write_recovery_allocation($1,$2,$3,$4::jsonb,$5::jsonb)",[DEMO_TENANT_ID,f.jobId,f.digest,{...cmd,commandId:randomUUID(),remittanceEvidenceId:undefined},forged]);
 })).rejects.toThrow("ALLOCATION_SOURCE_REQUIRED");
 const view=await allocate(f,f.payment1,2400000);
 expect(view.lines.every(l=>l.rule==="explicit"&&l.sourceRef===source)).toBe(true);
 expect(total(view.lines.filter(l=>l.lineId===f.catchLineId))).toEqual({numerator:"0",denominator:"1"});
});
it("S31: later item credit cannot alter an earlier settled receipt denominator",async()=>{
 const f=await fixture({baselineNet:141000,catchNet:141000,paymentAmounts:[38400,300000],movementNames:["receipt-384","receipt-3000"]});
 const first=await allocate(f,f.payment1,38400), original=first.allocations[0]!;
 const source=await remittance(f,f.payment1,f.catchLineId,19200);
 const credit=await f.invoices.previewCredit(context,{jobId:f.jobId,invoiceId:f.invoiceId,netPence:16000,reason:"Later item credit"});
 const issued=await f.invoices.issueCredit(context,{jobId:f.jobId,invoiceId:f.invoiceId,actorMembershipId:actor.membershipId,commandId:randomUUID(),netPence:16000,reason:"Later item credit",previewHash:credit.previewHash});
 await reverse(f,original.id,19200,issued.creditNoteId,source);
 const view=await allocate(f,f.payment2,300000);
 expect(total(view.lines.filter(l=>l.paymentId===f.payment2&&l.lineId===f.catchLineId))).toEqual({numerator:"125000",denominator:"1"});
 expect(view.lines.some(l=>l.reversesId!==null)).toBe(true);
});
it("S32: invalidated original remittance does not block cancellation of immutable allocations",async()=>{
 const f=await fixture(),source=await remittance(f,f.payment1,f.lineId,2400000);
 const view=await allocate(f,f.payment1,2400000,source), original=view.allocations[0]!;
 const before=(await admin.query("SELECT row_to_json(l)::text bytes FROM app.receipt_line_allocation l WHERE tenant_id=$1 AND allocation_id=$2",[DEMO_TENANT_ID,original.id])).rows;
 await tq("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,reason_code,actor_membership_id) VALUES($1,$2,$3,'verification_invalid',$4)",[randomUUID(),DEMO_TENANT_ID,source,actor.membershipId]);
 await f.invoices.reverseReceipt(context,{jobId:f.jobId,invoiceId:f.invoiceId,paymentId:f.payment1,actorMembershipId:actor.membershipId,commandId:randomUUID(),reason:"Verified reversal"});
 const reversed=await reverse(f,original.id,2400000);
 expect(total(reversed.lines)).toEqual({numerator:"0",denominator:"1"});
 const after=(await admin.query("SELECT row_to_json(l)::text bytes FROM app.receipt_line_allocation l WHERE tenant_id=$1 AND allocation_id=$2",[DEMO_TENANT_ID,original.id])).rows;
 for(const row of before) expect(after).toContainEqual(row);
});
it("S28/S29 composition helper preserves invoker RLS and narrow execution grants",async()=>{
 const f=await fixture();
 const row=(await admin.query(`SELECT p.prosecdef,pg_get_userbyid(p.proowner) owner,
  ARRAY(SELECT CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END::text FROM aclexplode(p.proacl) x WHERE x.privilege_type='EXECUTE' ORDER BY 1) grantees
  FROM pg_proc p WHERE p.oid='app.recovery_allocation_invoice_lines(uuid,uuid,uuid)'::regprocedure`)).rows[0];
 expect(row).toEqual({prosecdef:false,owner:"jobguard_migration",grantees:["jobguard_migration","jobguard_runtime"]});
 const hidden=await withTenant(runtime,testTenantContext(randomUUID()),db=>db.$client.query("SELECT * FROM app.recovery_allocation_invoice_lines($1,$2,$3)",[DEMO_TENANT_ID,f.jobId,f.invoiceId]));
 expect(hidden.rows).toEqual([]);
});
