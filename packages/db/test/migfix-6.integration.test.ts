// MIGFIX-6 failing-first regressions on real PostgreSQL 16 with runtime credentials.
// Three named parts, never combined: legacy derivation (0018/0097 routines), current allocator (0136 routine +
// repository) and component settlement (F18 interest). Every name matches the order in the work-order draft.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exactPence, parseExactPence, serializeExactPence, sumExactPence } from "@jobguard/core";
import { EvidencePackRepository } from "../src/evidence-pack-repository.js";
import { PracticeFeedRepository } from "../src/practice-feed-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { RecoveryAllocationRepository } from "../src/recovery-allocation-repository.js";
import { RecoveryEligibilityV3Repository } from "../src/recovery-eligibility-v3-repository.js";
import { appendAuditBatch } from "../src/audit.js";
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
const repo = () => new RecoveryAllocationRepository(runtime, "synthetic_demo");
const version = "recovery-allocation-command.v1";
const LEGACY_TENANT = randomUUID(), LEGACY_OWNER = { membershipId: randomUUID(), identityUserId: randomUUID() };
const LEGACY_CONTEXT = testTenantContext(LEGACY_TENANT);

const tq = async (sql: string, params: unknown[] = []) => {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
};

beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  directory = await mkdtemp(join(tmpdir(), "jg-migfix-6-"));
  const port = await freePort(63800, 150);
  const options = { host: "127.0.0.1", port, database: "postgres", user: "postgres", password: passphrase };
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: passphrase, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool(options); await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'MIGFIX-6 fictional builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query(`SET session_replication_role=replica;INSERT INTO control_plane.tenant(id)VALUES('${LEGACY_TENANT}');INSERT INTO identity.identity_user(id)VALUES('${LEGACY_OWNER.identityUserId}');INSERT INTO app.account(id,tenant_id,name)VALUES('${LEGACY_TENANT}','${LEGACY_TENANT}','Legacy account');INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES('${LEGACY_OWNER.membershipId}','${LEGACY_TENANT}','${LEGACY_TENANT}','${LEGACY_OWNER.identityUserId}','owner');SET session_replication_role=origin`);
  await admin.query(`CREATE ROLE migfix6_login LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO migfix6_login`);
  runtime = new Pool({ ...options, user: "migfix6_login", max: 10 });
}, 180_000);
afterAll(async () => {
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------------------------
// Part 1: legacy derivation (app.approve_synthetic_landing / app.reverse_synthetic_landing)
// ---------------------------------------------------------------------------------------------------------------
describe("MIGFIX-6 legacy derivation", () => {
  async function world(planCredit: boolean) {
    const job = randomUUID(), evidence = randomUUID(), upload = randomUUID(), activation = randomUUID(), obligation = randomUUID(), digest = planCredit ? "d" : "e";
    await admin.query(`SET session_replication_role=replica;INSERT INTO app.job(id,tenant_id,title,status,revision)VALUES('${job}','${LEGACY_TENANT}','Legacy recovery','live',1);INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)VALUES('${activation}','${LEGACY_TENANT}','${job}',gen_random_uuid(),1,'${"a".repeat(64)}','synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',gen_random_uuid(),now());INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)VALUES(gen_random_uuid(),'${LEGACY_TENANT}','${job}','${activation}',gen_random_uuid(),1880000,'GBP',28200,'reference_fee_policy_v1',true);${planCredit ? `INSERT INTO app.synthetic_obligation(id,tenant_id,job_id,activation_id,principal_pence,currency,state,label)VALUES('${obligation}','${LEGACY_TENANT}','${job}','${activation}',7900,'GBP','owed_unpaid','illustrative_only');INSERT INTO app.simulated_settlement_event(id,tenant_id,job_id,obligation_id,provider_event_id,amount_pence,currency,label,simulated_at)VALUES(gen_random_uuid(),'${LEGACY_TENANT}','${job}','${obligation}','credit-settlement-${randomUUID()}',7900,'GBP','simulated_not_collected',now());` : ""}INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES('${upload}','${LEGACY_TENANT}','${job}','synthetic/upload-${job}','${digest.repeat(64)}','application/pdf',1,'standard_evidence','verified','v1',now(),now()+interval '1 hour');INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES('${evidence}','${LEGACY_TENANT}','${upload}','${job}','original','synthetic_bank_receipt','synthetic/key-${job}','v1','${digest.repeat(64)}',1,'application/pdf','standard_evidence',now(),now());SET session_replication_role=origin`);
    const caseId = randomUUID(), eligibility = randomUUID(), landing = randomUUID();
    return { job, evidence, caseId, eligibility, landing, claim: 0 };
  }
  type World = Awaited<ReturnType<typeof world>>;
  async function openCase(w: World, claim: number) {
    await admin.query(`SET session_replication_role=replica;INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)VALUES('${w.caseId}','${LEGACY_TENANT}','${w.job}',${claim},'GBP','active',0,true);SET session_replication_role=origin`);
    for (const [id, kind] of [[w.eligibility, "eligibility"], [w.landing, "landing"]])
      await admin.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES($1,$2,$3,$4,$5,0,'approved','reference_fee_policy_v1',now()+interval '1 hour',$6)", [id, LEGACY_TENANT, w.job, w.caseId, kind, randomUUID()]);
  }
  async function receipt(w: World, gross: number) {
    const id = randomUUID();
    await admin.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES($1::uuid,$2::uuid,$3::uuid,$1::text,$1::text,'settled',$4,'GBP',true,now())", [id, LEGACY_TENANT, w.job, gross]);
    return id;
  }
  const payload = (w: World, receiptId: string, gross: number, eligible: number) => ({ version: "recovery.landing.approve.v1", allocationId: randomUUID(), derivationId: randomUUID(), journalId: randomUUID(),
    jobId: w.job, caseId: w.caseId, receiptId, evidenceId: w.evidence, eligibilityApprovalId: w.eligibility, landingApprovalId: w.landing, grossPence: gross, eligibleNetPence: eligible, currency: "GBP", policyVersion: "reference_fee_policy_v1", expectedCaseRevision: 0 });
  const land = (p: object) => withTenant(runtime, LEGACY_CONTEXT, db => db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb) id", [p]));
  const reverse = (allocationId: string, amount: number) => withTenant(runtime, LEGACY_CONTEXT, db => db.$client.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7) id", [LEGACY_TENANT, randomUUID(), randomUUID(), randomUUID(), allocationId, amount, "Practice receipt reversed"]));
  const derivations = async (job: string) => (await admin.query("SELECT cumulative_landed_pence::int landed,credit_used_pence::int credit,liability_pence::int liability,posting_delta_pence::int delta FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id", [LEGACY_TENANT, job])).rows;
  const journal = async (job: string) => (await admin.query("SELECT kind,amount_pence::int amount FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id", [LEGACY_TENANT, job])).rows;
  const net = (rows: Array<{ kind: string; amount: number }>) => rows.reduce((total, row) => total + (row.kind === "fee_obligation" ? row.amount : -row.amount), 0);
  const counts = async (job: string) => (await admin.query(`SELECT (SELECT count(*) FROM app.landing_allocation WHERE tenant_id=$1 AND job_id=$2)::int allocations,
    (SELECT count(*) FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2)::int derivations,(SELECT count(*) FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2)::int journals`, [LEGACY_TENANT, job])).rows[0]!;

  it("rejects eligible net above allocated gross", async () => {
    const w = await world(false); await openCase(w, 100_000);
    const r = await receipt(w, 1);
    await expect(land(payload(w, r, 1, 100_000))).rejects.toMatchObject({ code: "23514" });
    expect(await counts(w.job)).toEqual({ allocations: 0, derivations: 0, journals: 0 });
    // The bound is also a table fact, so no later writer can rely on the routine alone.
    await expect(admin.query("INSERT INTO app.landing_allocation(id,tenant_id,job_id,case_id,receipt_id,evidence_id,eligibility_approval_id,landing_approval_id,gross_pence,eligible_net_pence,currency,policy_version) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,1,100000,'GBP','reference_fee_policy_v1')",
      [LEGACY_TENANT, w.job, w.caseId, r, w.evidence, w.eligibility, w.landing])).rejects.toMatchObject({ code: "23514" });
  }, 120_000);

  it("two complete reversals remove all recovery liability", async () => {
    const w = await world(true); await openCase(w, 250_000);
    const first = payload(w, await receipt(w, 100_000), 100_000, 100_000), second = payload(w, await receipt(w, 100_000), 100_000, 100_000);
    await land(first); await land(second);
    expect((await derivations(w.job)).at(-1)).toMatchObject({ landed: 200_000, credit: 7900, liability: 12_100 });
    await reverse(first.allocationId, 100_000);
    expect((await derivations(w.job)).at(-1)).toMatchObject({ landed: 100_000, credit: 7900, liability: 2100 });
    await reverse(second.allocationId, 100_000);
    const rows = await derivations(w.job), last = rows.at(-1)!;
    expect(last).toMatchObject({ landed: 0, credit: 0, liability: 0 });
    const entries = await journal(w.job);
    expect(net(entries)).toBe(0);
    expect(entries.filter(row => row.kind === "compensation").map(row => row.amount)).toEqual([10_000, 2100]);
  }, 120_000);

  it("partial reversal preserves liability without settled plan credit", async () => {
    const a = await world(false); await openCase(a, 250_000);
    const landed = payload(a, await receipt(a, 100_000), 100_000, 100_000);
    await land(landed);
    expect((await derivations(a.job)).at(-1)).toMatchObject({ credit: 0, liability: 10_000 });
    await reverse(landed.allocationId, 40_000);
    expect((await derivations(a.job)).at(-1)).toMatchObject({ landed: 60_000, credit: 0, liability: 6000 });
    const entries = await journal(a.job);
    expect(entries.filter(row => row.kind === "compensation").map(row => row.amount)).toEqual([4000]);
    expect(net(entries)).toBe(6000);
    const b = await world(false); await openCase(b, 250_000);
    const bigger = payload(b, await receipt(b, 200_000), 200_000, 200_000);
    await land(bigger); await reverse(bigger.allocationId, 50_000);
    expect((await derivations(b.job)).at(-1)).toMatchObject({ landed: 150_000, credit: 0, liability: 15_000 });
    const rows = await journal(b.job);
    expect(rows.filter(row => row.kind === "compensation").map(row => row.amount)).toEqual([5000]);
    expect(net(rows)).toBe(15_000);
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------
// Part 2: current allocator (app.write_recovery_allocation + repository)
// ---------------------------------------------------------------------------------------------------------------
const MOVEMENT_AMOUNT: Record<string, number> = { "receipt-384": 38_400, "receipt-3000": 300_000, "receipt-24000": 2_400_000, "receipt-17280": 1_728_000, "receipt-960": 96_000 };
type Options = { lines?: number[]; claims?: [number, number]; payments?: string[]; supplementary?: boolean };

async function fixture({ lines = [3_360_000, 80_000], claims = [3_440_000, 250_000], payments = ["receipt-24000", "receipt-17280"], supplementary = false }: Options = {}) {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session), digest = auth.digest;
  const jobId = randomUUID(), quoteId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID();
  const draftId = randomUUID(), revisionId = randomUUID(), scopeIds = lines.map(() => randomUUID()), lineIds = lines.map(() => randomUUID());
  const netTotal = lines.reduce((a, b) => a + b, 0), tax = Math.floor((netTotal + 2) / 5), gross = netTotal + tax;
  const scoped = practiceMaterialPool(runtime, digest), invoices = new PracticeInvoiceRepository(scoped);
  const db = await admin.connect();
  try {
    await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    await db.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'MIGFIX-6 allocation fixture',$3,'home')", [jobId, DEMO_TENANT_ID, digest]);
    for (const scope of scopeIds) await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, DEMO_TENANT_ID, jobId]);
    await db.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [quoteDraftId, DEMO_TENANT_ID, jobId]);
    await db.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers)
      VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',$5,0,$5,$6,$7,true,'[]')`, [quoteRevisionId, DEMO_TENANT_ID, jobId, quoteDraftId, netTotal, tax, gross]);
    await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot)
      VALUES($1,$2,$3,$4,1,'MIGFIX6-QUOTE',$5,$6,'quote-object-v1',1,'{}','{}',$7)`, [quoteId, DEMO_TENANT_ID, jobId, quoteRevisionId, hash(quoteId), `migfix6/${quoteId}`, { netPence: netTotal, taxPence: tax, totalPence: gross }]);
    await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')", [quoteId, DEMO_TENANT_ID, jobId, hash(quoteId), netTotal]);
    await db.query("SELECT app.transition_job($1,$2,0,'quoting','start_quote')", [DEMO_TENANT_ID, jobId]);
    await db.query("SELECT app.transition_job($1,$2,1,'accepted','accept_quote',$3)", [DEMO_TENANT_ID, jobId, quoteId]);
    await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
      VALUES($1,$2,$3,$4,1,$5,$6,'GBP','builder_attestation',$7,'Fictional customer','verbal',clock_timestamp())`, [randomUUID(), DEMO_TENANT_ID, jobId, quoteId, hash(quoteId), gross, actor.membershipId]);
    await db.query("SELECT app.transition_job($1,$2,2,'live','switch_live',$3,$4,'reference_fee_policy_v1',28200)", [DEMO_TENANT_ID, jobId, quoteId, netTotal]);
    await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, DEMO_TENANT_ID, jobId]);
    await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
      VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',$7,$8,$9,false,'[]')`, [revisionId, DEMO_TENANT_ID, jobId, draftId, hash(revisionId), quoteId, netTotal, tax, gross]);
    for (const [index, net] of lines.entries())
      await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
        VALUES($1,$2,$3,$4,'baseline',$5,$5,$6,$7,$8,$9)`, [lineIds[index], DEMO_TENANT_ID, jobId, revisionId, scopeIds[index], quoteRevisionId, `MIGFIX-6 line ${index + 1}`, net, index + 1]);
    await db.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, draftId, revisionId]);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  const invoice = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: actor.membershipId,
    commandId: randomUUID(), recipient: "allocation@example.invalid", issuedOn: "2026-10-12" });
  let billed = invoice.id, supplementaryLineId: string | null = null, supplementaryInvoiceId: string | null = null;
  if (supplementary) {
    // A real second revision holding the baseline plus the new catch, issued as a supplementary invoice for ONLY the catch.
    // Issued-line facts are written with replication role replica because the lock machinery is not what is under test.
    const revision2 = randomUUID(), catchScope = randomUUID(), catchLine = randomUUID(), invoiceB = randomUUID(), bindingLock = randomUUID(), bindingCheck = randomUUID();
    const rev2Net = netTotal + 80_000, rev2Tax = Math.floor((rev2Net + 2) / 5);
    const client = await admin.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
      await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [catchScope, DEMO_TENANT_ID, jobId]);
      await client.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings,created_at)
        SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,$5,$6,$7,false,findings,clock_timestamp() FROM app.final_account_revision WHERE tenant_id=$3 AND id=$4`,
        [revision2, hash(revision2), DEMO_TENANT_ID, revisionId, rev2Net, rev2Tax, rev2Net + rev2Tax]);
      await client.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3", [revision2, DEMO_TENANT_ID, revisionId]);
      await client.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
        VALUES($1,$2,$3,$4,'variation',$5,$6,$7,$8,'Synthetic catch line',80000,$9)`, [catchLine, DEMO_TENANT_ID, jobId, revision2, randomUUID(), catchScope, quoteRevisionId, randomUUID(), lines.length + 1]);
      await client.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND id=$3", [revision2, DEMO_TENANT_ID, draftId]);
      // The lock/check rows are outside this order; the issued-line facts they would bind are written with FK triggers off.
      await client.query("SET LOCAL session_replication_role=replica");
      await client.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark,parties_snapshot)
        SELECT $1,tenant_id,job_id,$2,authorization_id,$5,issued_on,issuer_details,tax_policy_version,currency,80000,16000,96000,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark,parties_snapshot FROM app.customer_invoice WHERE tenant_id=$3 AND id=$4`,
        [invoiceB, revision2, DEMO_TENANT_ID, invoice.id, `DEMO-CUST-SUPP-${invoiceB.slice(0, 8)}`]);
      await client.query("INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES($1,$2,$3,'supplementary',$4,$5,$6)", [DEMO_TENANT_ID, jobId, invoiceB, bindingLock, revision2, bindingCheck]);
      await client.query(`INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
        SELECT tenant_id,job_id,$1,id,$2,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,16000,net_pence+16000 FROM app.final_account_line WHERE tenant_id=$3 AND id=$4`, [invoiceB, revision2, DEMO_TENANT_ID, catchLine]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    billed = invoiceB; supplementaryLineId = catchLine; supplementaryInvoiceId = invoiceB;
  }
  const evidenceIds: string[] = [];
  for (let index = 0; index < 2; index++) {
    const evidenceId = randomUUID(), uploadId = randomUUID(), proofScopeId = randomUUID(), bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==", "base64");
    const objectKey = `migfix6/${evidenceId}`, objectVersion = `proof-${index + 1}-v1`, proofHash = hash(bytes);
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
  for (const claim of supplementary ? [80_000, 80_000] : claims) {
    let view = await cases.command(context, jobId, { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), expectedRevision: 0,
      caseType: "withheld_customer_payment", claimedNetPence: claim, counterparty: "Fictional customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: [billed] }, actor);
    view = await cases.command(context, jobId, { version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId: view.id, expectedRevision: view.revision, eventType: "assemble_evidence" }, actor);
    view = await cases.eligibilityCommand(context, jobId, { version: "recovery-eligibility-command.v1", action: "review", commandId: randomUUID(), caseId: view.id,
      expectedCaseRevision: view.revision, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1, scenario: "evidence_backed_withheld_payment" }, actor);
    view = await cases.eligibilityCommand(context, jobId, { version: "recovery-eligibility-command.v1", action: "approve", commandId: randomUUID(), caseId: view.id,
      expectedCaseRevision: view.revision, expectedEvidenceRevision: 1, expectedPolicyRevision: 1, expectedReviewRevision: view.eligibility!.revision }, actor);
    const pack = await packs.generate(context, view.id, { commandId: randomUUID() }, `membership:${actor.membershipId}`);
    await packs.approveAttachment(context, view.id, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, `membership:${actor.membershipId}`);
    views.push(view);
  }
  const paymentIds: string[] = [];
  const movements = supplementary ? ["receipt-960"] : payments;
  for (const movement of movements) {
    paymentIds.push((await invoices.recordReceipt(context, { jobId, invoiceId: billed, actorMembershipId: actor.membershipId,
      commandId: randomUUID(), paidOn: "2026-10-12", amountPence: MOVEMENT_AMOUNT[movement]!, method: "bank_transfer", reference: "Fictional settled receipt" })).paymentId);
  }
  const feed = new PracticeFeedRepository(runtime, "synthetic_demo");
  let feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "connect", commandId: randomUUID(), expectedRevision: 0 });
  for (const [index, movement] of movements.entries()) {
    feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "advance", commandId: randomUUID(), expectedRevision: feedView.revision, movement, step: "settled" });
    feedView = await feed.command(context, actor, digest, jobId, { version: "practice-feed-command.v1", action: "match_receipt", commandId: randomUUID(), expectedRevision: feedView.revision, movement, paymentId: paymentIds[index]! });
  }
  return { session, jobId, digest, invoiceId: billed, mainInvoiceId: invoice.id, invoices, cases, packs, feed, scopeIds, lineIds, revisionId, supplementaryLineId, supplementaryInvoiceId,
    case1: views[0]!, case2: views[1]!, payments: paymentIds, evidence1: evidenceIds[0]!, evidence2: evidenceIds[1]! };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const run = (f: Fixture, raw: unknown) => repo().command(context, actor, f.digest, f.jobId, raw);
const read = (f: Fixture) => repo().view(context, actor, f.digest, f.jobId);
const caseOf = async (f: Fixture, which: 1 | 2) => (await f.cases.listForMember(context, f.jobId, actor)).find(c => c.id === (which === 1 ? f.case1.id : f.case2.id))!;
async function allocate(f: Fixture, which: 1 | 2, paymentId: string, grossPence: number, remittanceEvidenceId?: string) {
  const current = await caseOf(f, which);
  const input = { version, action: "review", commandId: randomUUID(), caseId: current.id, paymentId, evidenceId: which === 1 ? f.evidence1 : f.evidence2,
    expectedCaseRevision: current.revision, grossPence, ...(remittanceEvidenceId ? { remittanceEvidenceId } : {}) };
  const view = await run(f, input);
  return run(f, { ...input, action: "allocate", commandId: randomUUID(), approvalHash: view.review!.approvalHash });
}
async function reverse(f: Fixture, which: 1 | 2, allocationId: string, grossPence: number, creditNoteId?: string, remittanceEvidenceId?: string) {
  const current = await caseOf(f, which);
  const input = { version, action: "review_reverse", commandId: randomUUID(), allocationId, expectedCaseRevision: current.revision, grossPence,
    ...(creditNoteId ? { creditNoteId } : {}), ...(remittanceEvidenceId ? { remittanceEvidenceId } : {}) };
  const view = await run(f, input);
  return run(f, { ...input, action: "reverse", commandId: randomUUID(), approvalHash: view.review!.approvalHash });
}
const total = (rows: readonly { net: { numerator: string; denominator: string } }[]) => serializeExactPence(sumExactPence(rows.map(row => parseExactPence(row.net))));
const counts = async (f: Fixture) => (await admin.query(`SELECT
  (SELECT count(*)::int FROM app.recovery_case_allocation WHERE tenant_id=$1 AND job_id=$2) allocations,
  (SELECT count(*)::int FROM app.recovery_case_allocation_reversal WHERE tenant_id=$1 AND job_id=$2) reversals,
  (SELECT count(*)::int FROM app.receipt_line_allocation WHERE tenant_id=$1 AND job_id=$2) lines,
  (SELECT count(*)::int FROM app.recovery_allocation_review WHERE tenant_id=$1 AND job_id=$2) reviews,
  (SELECT count(*)::int FROM app.recovery_case_event WHERE tenant_id=$1 AND job_id=$2) events,
  (SELECT count(*)::int FROM app.action_authorization WHERE tenant_id=$1 AND action_type LIKE 'recovery_allocation.%') authorizations`, [DEMO_TENANT_ID, f.jobId])).rows[0]!;

function remittancePng(content: string) {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==", "base64");
  const payload = Buffer.from(`jobguard-remittance\0${content}`, "utf8"), type = Buffer.from("tEXt", "ascii");
  let crc = 0xffffffff;
  for (const octet of Buffer.concat([type, payload])) { crc ^= octet; for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0); type.copy(chunk, 4); payload.copy(chunk, 8); chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, payload.length + 8);
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]);
}
async function remittance(f: Fixture, paymentId: string, shares: Array<{ lineId: string; grossPence: number }>) {
  const evidenceId = randomUUID(), uploadId = randomUUID(), objectKey = `migfix6-remittance/${evidenceId}`, scopeId = f.scopeIds[0]!;
  const bytes = remittancePng(JSON.stringify({ version: "recovery-remittance.v1", paymentId, invoiceId: f.invoiceId,
    shares: shares.map(share => ({ lineId: share.lineId, gross: { numerator: String(share.grossPence), denominator: "1" } })) })), sha = hash(bytes);
  await tq("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,'image/png',$7,'standard_evidence','verified','remittance-v1',clock_timestamp(),clock_timestamp()+interval '1 hour')", [uploadId, DEMO_TENANT_ID, f.jobId, scopeId, objectKey, sha, bytes.length]);
  await tq("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,$5,'remittance-v1','synthetic_demo','image/png',$6)", [DEMO_TENANT_ID, uploadId, f.jobId, scopeId, objectKey, bytes]);
  await tq("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo',$6,'remittance-v1',$7,$8,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())", [evidenceId, DEMO_TENANT_ID, uploadId, f.jobId, scopeId, objectKey, sha, bytes.length]);
  return evidenceId;
}

describe("MIGFIX-6 current allocator", () => {
  it("claim amendment requires fresh eligibility before allocation", async () => {
    const f = await fixture({ lines: [1_880_000], claims: [32_000, 250_000], payments: ["receipt-384", "receipt-3000"] });
    let current = await caseOf(f, 1);
    // £320 claim, eligibility approved by the fixture. Amend to £160.
    await f.cases.command(context, f.jobId, { version: "recovery-case-command.v1", action: "amend_claim", commandId: randomUUID(), caseId: current.id, claimedNetPence: 16_000, expectedRevision: current.revision, reviewerRef: `membership:${actor.membershipId}` }, actor);
    current = await caseOf(f, 1);
    const before = await counts(f);
    const stale = { version, action: "review", commandId: randomUUID(), caseId: current.id, paymentId: f.payments[0]!, evidenceId: f.evidence1, expectedCaseRevision: current.revision, grossPence: 12_000 };
    await expect(run(f, stale)).rejects.toMatchObject({ code: "ALLOCATION_EVIDENCE_HELD" });
    expect(await counts(f)).toEqual(before);
    // Fresh eligibility for the amended claim permits the control.
    let view = await f.cases.eligibilityCommand(context, f.jobId, { version: "recovery-eligibility-command.v1", action: "review", commandId: randomUUID(), caseId: current.id,
      expectedCaseRevision: current.revision, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1, scenario: "evidence_backed_withheld_payment" }, actor);
    view = await f.cases.eligibilityCommand(context, f.jobId, { version: "recovery-eligibility-command.v1", action: "approve", commandId: randomUUID(), caseId: current.id,
      expectedCaseRevision: view.revision, expectedEvidenceRevision: 1, expectedPolicyRevision: 1, expectedReviewRevision: view.eligibility!.revision }, actor);
    const fresh = await allocate(f, 1, f.payments[0]!, 12_000);
    expect(fresh.allocations.find(row => row.paymentId === f.payments[0]!)).toMatchObject({ grossPence: 12_000, eligibleNetPence: 10_000 });
  }, 180_000);

  it("recorded remittance cannot be bypassed by omission", async () => {
    const f = await fixture();
    const source = await remittance(f, f.payments[0]!, [{ lineId: f.lineIds[0]!, grossPence: 2_400_000 }]);
    const current = await caseOf(f, 1);
    const explicit = { version, action: "review", commandId: randomUUID(), caseId: current.id, paymentId: f.payments[0]!, evidenceId: f.evidence1, expectedCaseRevision: current.revision, grossPence: 2_400_000, remittanceEvidenceId: source };
    const reviewed = await run(f, explicit);
    expect(reviewed.review).not.toBeNull();
    const before = await counts(f);
    const omitted = { ...explicit, commandId: randomUUID() } as Record<string, unknown>;
    delete omitted.remittanceEvidenceId;
    await expect(run(f, omitted)).rejects.toMatchObject({ code: "ALLOCATION_SOURCE_REQUIRED" });
    await expect(run(f, { ...omitted, action: "allocate", commandId: randomUUID(), approvalHash: reviewed.review!.approvalHash })).rejects.toBeTruthy();
    expect(await counts(f)).toEqual(before);
    // The recorded source still governs when it is named: explicit rule, catch 0/1.
    const saved = await allocate(f, 1, f.payments[0]!, 2_400_000, source);
    const rows = saved.lines.filter(line => line.paymentId === f.payments[0]!);
    expect(rows.every(row => row.rule === "explicit")).toBe(true);
    expect(total(rows.filter(row => row.lineId === f.lineIds[1]!))).toEqual({ numerator: "0", denominator: "1" });
  }, 180_000);

  it("later credit cannot change earlier receipt allocation", async () => {
    const f = await fixture({ lines: [141_000, 141_000], claims: [32_000, 250_000], payments: ["receipt-384", "receipt-3000"] });
    const first = await allocate(f, 1, f.payments[0]!, 38_400);
    const original = first.allocations.find(row => row.paymentId === f.payments[0]!)!;
    expect(total(first.lines.filter(line => line.paymentId === f.payments[0]! && line.lineId === f.lineIds[1]!))).toEqual({ numerator: "16000", denominator: "1" });
    // A £3,000 receipt has already settled. Only now is the later £192 item credit issued against the first receipt's second-line share.
    const preview = await f.invoices.previewCredit(context, { jobId: f.jobId, invoiceId: f.invoiceId, netPence: 16_000, reason: "Synthetic later item credit" });
    const credit = await f.invoices.issueCredit(context, { jobId: f.jobId, invoiceId: f.invoiceId, actorMembershipId: actor.membershipId, commandId: randomUUID(), netPence: 16_000, reason: "Synthetic later item credit", previewHash: preview.previewHash });
    const source = await remittance(f, f.payments[0]!, [{ lineId: f.lineIds[1]!, grossPence: 19_200 }]);
    const reversed = await reverse(f, 1, original.id, 19_200, credit.creditNoteId, source);
    expect(reversed.lines.filter(line => line.reversesId !== null)).toHaveLength(1);
    const second = await allocate(f, 2, f.payments[1]!, 300_000);
    const secondRows = second.lines.filter(line => line.paymentId === f.payments[1]!);
    expect(total(secondRows.filter(row => row.lineId === f.lineIds[1]!))).toEqual({ numerator: "125000", denominator: "1" });
    expect(total(secondRows.filter(row => row.lineId === f.lineIds[0]!))).toEqual({ numerator: "125000", denominator: "1" });
    // The later credit stays a separate reversal; nothing about the first receipt was rewritten.
    expect((await counts(f)).reversals).toBe(1);
  }, 240_000);

  it("whole receipt accepts penny-valued invoice lines", async () => {
    const f = await fixture({ lines: [16_001, 15_999], claims: [32_000, 250_000], payments: ["receipt-384", "receipt-3000"] });
    const saved = await allocate(f, 1, f.payments[0]!, 38_400);
    const rows = saved.lines.filter(line => line.paymentId === f.payments[0]!);
    expect(total(rows.filter(row => row.lineId === f.lineIds[0]!))).toEqual({ numerator: "16001", denominator: "1" });
    expect(total(rows.filter(row => row.lineId === f.lineIds[1]!))).toEqual({ numerator: "15999", denominator: "1" });
    const grossRows = (await admin.query("SELECT line_id,gross_numerator,gross_denominator FROM app.receipt_line_allocation WHERE tenant_id=$1 AND job_id=$2 ORDER BY line_id", [DEMO_TENANT_ID, f.jobId])).rows;
    const byLine = Object.fromEntries(grossRows.map(row => [row.line_id, `${row.gross_numerator}/${row.gross_denominator}`]));
    expect(byLine[f.lineIds[0]!]).toBe("19201/1");
    expect(byLine[f.lineIds[1]!]).toBe("19199/1");
  }, 180_000);

  it("F7 supplementary settlement uses invoiced lines", async () => {
    const f = await fixture({ lines: [3_360_000], supplementary: true });
    const saved = await allocate(f, 1, f.payments[0]!, 96_000);
    const rows = saved.lines.filter(line => line.paymentId === f.payments[0]!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lineId: f.supplementaryLineId, rule: "separate_invoice", net: { numerator: "80000", denominator: "1" } });
    expect(total(rows)).toEqual({ numerator: "80000", denominator: "1" });
    // One account line is never enough to infer a separate invoice: the main invoice keeps its pro-rata rule.
    expect(saved.lines.every(line => line.invoiceId === f.supplementaryInvoiceId)).toBe(true);
  }, 240_000);

  it("invalidated remittance does not prevent reversing saved allocations", async () => {
    const f = await fixture();
    const source = await remittance(f, f.payments[0]!, [{ lineId: f.lineIds[0]!, grossPence: 2_400_000 }]);
    const allocated = await allocate(f, 1, f.payments[0]!, 2_400_000, source);
    const original = allocated.allocations.find(row => row.paymentId === f.payments[0]!)!;
    const originals = async () => (await admin.query("SELECT row_to_json(t)::text bytes FROM app.receipt_line_allocation t WHERE tenant_id=$1 AND job_id=$2 AND reversal_id IS NULL ORDER BY id", [DEMO_TENANT_ID, f.jobId])).rows.map(row => row.bytes);
    const originalRows = await originals();
    await withTenant(runtime, context, db => db.$client.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), DEMO_TENANT_ID, source, actor.membershipId]));
    await f.invoices.reverseReceipt(context, { jobId: f.jobId, invoiceId: f.invoiceId, paymentId: f.payments[0]!, actorMembershipId: actor.membershipId, commandId: randomUUID(), reason: "Synthetic payment reversed" });
    const reversed = await reverse(f, 1, original.id, 2_400_000);
    const negatives = reversed.lines.filter(line => line.reversesId !== null);
    expect(negatives.length).toBeGreaterThan(0);
    for (const line of negatives) expect(reversed.lines.some(row => row.id === line.reversesId && row.lineId === line.lineId && row.paymentId === line.paymentId)).toBe(true);
    expect(total(reversed.lines.filter(line => line.paymentId === f.payments[0]!))).toEqual({ numerator: "0", denominator: "1" });
    expect(await originals()).toEqual(originalRows);
    expect(reversed.cases.find(row => row.caseId === f.case1.id)).toMatchObject({ outstandingNetPence: 3_440_000 });
    expect((await counts(f)).reversals).toBe(1);
    // A new positive allocation can never be built from the invalidated source.
    const current = await caseOf(f, 2);
    await expect(run(f, { version, action: "review", commandId: randomUUID(), caseId: current.id, paymentId: f.payments[1]!, evidenceId: f.evidence2, expectedCaseRevision: current.revision, grossPence: 1_728_000, remittanceEvidenceId: source })).rejects.toBeTruthy();
  }, 240_000);
});

// ---------------------------------------------------------------------------------------------------------------
// Part 3: component settlement (F18 statutory interest)
// ---------------------------------------------------------------------------------------------------------------
describe("MIGFIX-6 component settlement", () => {
  async function eligibilityFixture() {
    const sessionId = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, sessionId), jobId = randomUUID();
    await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'MIGFIX-6 F18 job',$3,'capture')", [jobId, DEMO_TENANT_ID, auth.digest]);
    const cases = new RecoveryCaseRepository(practiceMaterialPool(runtime, auth.digest)), feed = new PracticeFeedRepository(runtime, "synthetic_demo");
    let revision = 0;
    const advance = async (movement: string, step = "settled") => {
      const reply = await feed.command(context, actor, auth.digest, jobId, { version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision: revision, action: revision === 0 ? "connect" : "advance", ...(revision === 0 ? {} : { movement, step }) });
      revision = reply.revision;
    };
    await advance("receipt-384");
    const c = await cases.command(context, jobId, { version: "recovery-case-command.v1", commandId: randomUUID(), action: "open", caseType: "withheld_customer_payment", claimedNetPence: 300_000,
      counterparty: "Fictional debtor", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"], expectedRevision: 0 }, actor);
    return { auth, jobId, c, cases, advance, repo: new RecoveryEligibilityV3Repository(practiceMaterialPool(runtime, auth.digest), "synthetic_demo") };
  }
  const review = (c: { id: string; revision: number }, fixtureName: string, expectedReviewRevision = 0) => ({ version: "recovery-eligibility-command.v3", action: "review", commandId: randomUUID(), caseId: c.id, expectedCaseRevision: c.revision, expectedReviewRevision, fixture: fixtureName });
  const insertRaw = async (db: { $client: Pool | any }, f: Awaited<ReturnType<typeof eligibilityFixture>>, revision: number, sourceEventId: string | null, result: unknown) => {
    const id = randomUUID();
    await db.$client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,$5,$6,'F18',$7,$8,$9,$10,$11)",
      [id, DEMO_TENANT_ID, f.jobId, f.c.id, revision, f.c.revision, sourceEventId, DEMO_MEMBERSHIP_ID, randomUUID(), "a".repeat(64), JSON.stringify(result)]);
    return id;
  };
  const rollback = new Error("MIGFIX-6 intentional rollback");

  it("F18 excludes unsettled statutory interest", async () => {
    const f = await eligibilityFixture();
    await f.advance("receipt-3000");
    // Principal settled after opening; interest still has no settled receipt of its own.
    const first = await f.repo.review(context, f.jobId, review(f.c, "F18"), actor, f.auth.digest);
    expect(first.result.qualifyingPrincipal).toEqual({ pence: 250_000, currency: "GBP" });
    const interestFirst = first.result.lines.find(line => line.kind === "statutory_interest")!;
    expect(interestFirst).toMatchObject({ netPence: 12_000, qualifyingPrincipal: { pence: 0, currency: "GBP" } });
    expect(first.result.lines.find(line => line.kind === "principal")!.qualifyingPrincipal.pence).toBe(250_000);
    // Settle the exact £120 interest source and review again.
    await f.advance("receipt-interest-120");
    const second = await f.repo.review(context, f.jobId, review(f.c, "F18", first.revision), actor, f.auth.digest);
    expect(second.result.qualifyingPrincipal).toEqual({ pence: 262_000, currency: "GBP" });
    expect(second.result.lines.find(line => line.kind === "statutory_interest")).toMatchObject({ qualifyingPrincipal: { pence: 12_000, currency: "GBP" } });
    expect(second.result.reason).toBe("Fixed statutory compensation is not part of the fee base");
    const stored = (await admin.query("SELECT revision,result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision", [DEMO_TENANT_ID, f.c.id])).rows;
    expect(stored.map(row => row.result.qualifyingPrincipal.pence)).toEqual([250_000, 262_000]);
    expect(stored[0]!.result).toEqual(first.result);
    // Raw SQL guards: a runtime caller cannot assert interest Q that no interest receipt supports, nor drop settled interest.
    const g = await eligibilityFixture(); await g.advance("receipt-3000");
    const gFirst = await g.repo.review(context, g.jobId, review(g.c, "F18"), actor, g.auth.digest);
    await expect(withTenant(practiceMaterialPool(runtime, g.auth.digest), context, async db => {
      await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
      await expect(insertRaw(db, g, 2, gFirst.sourceEventId, { ...gFirst.result, qualifyingPrincipal: { pence: 262_000, currency: "GBP" } })).rejects.toMatchObject({ message: "ELIGIBILITY_FIXTURE_MISMATCH" });
      throw rollback;
    })).rejects.toBe(rollback);
    await g.advance("receipt-interest-120");
    await expect(withTenant(practiceMaterialPool(runtime, g.auth.digest), context, async db => {
      await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
      await expect(insertRaw(db, g, 2, gFirst.sourceEventId, gFirst.result)).rejects.toMatchObject({ message: "ELIGIBILITY_FIXTURE_MISMATCH" });
      throw rollback;
    })).rejects.toBe(rollback);
    // Deferred completeness: the whole review (lines, result, audit) must agree; an interest line that qualifies
    // without a settled interest receipt is refused at commit even when every row-level guard passed.
    const h = await eligibilityFixture(); await h.advance("receipt-3000");
    const hFirst = await h.repo.review(context, h.jobId, review(h.c, "F18"), actor, h.auth.digest);
    const wrong = { ...hFirst.result, lines: hFirst.result.lines.map(line => line.kind === "statutory_interest" ? { ...line, qualifyingPrincipal: { pence: 12_000, currency: "GBP" } } : line) };
    await expect(withTenant(practiceMaterialPool(runtime, h.auth.digest), context, async db => {
      await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
      const id = randomUUID(), commandId = randomUUID(), bytes = JSON.stringify(wrong);
      const payloadHash = hash("raw-" + commandId), resultHash = hash(bytes);
      await db.$client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,2,$5,'F18',$6,$7,$8,$9,$10)",
        [id, DEMO_TENANT_ID, h.jobId, h.c.id, h.c.revision, hFirst.sourceEventId, DEMO_MEMBERSHIP_ID, commandId, payloadHash, bytes]);
      for (const [kind, net] of [["principal", 250_000], ["statutory_interest", 12_000], ["fixed_compensation", 7000]] as const)
        await db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,$6,'business',$7)", [randomUUID(), DEMO_TENANT_ID, h.jobId, h.c.id, id, kind, net]);
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${DEMO_MEMBERSHIP_ID}`, eventType: "recovery.eligibility.v3_reviewed", subjectType: "recovery_case", subjectRef: h.c.id,
        payload: { references: { jobId: h.jobId, reviewId: id, commandId, sourceEventId: hFirst.sourceEventId }, hashes: { command: payloadHash, result: resultHash }, classifications: { recovery: "financial" } } }]);
    })).rejects.toMatchObject({ message: "ELIGIBILITY_LINES_REQUIRED" });
    expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2", [DEMO_TENANT_ID, h.c.id])).rows[0].n).toBe(1);
  }, 240_000);
});
// Unused-import guard for helpers kept for the upgrade test sibling.
void exactPence;
