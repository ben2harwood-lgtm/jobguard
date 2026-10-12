// Written before persistence; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EvidencePackRepository } from "../src/evidence-pack-repository.js";
import { PracticeFeedRepository } from "../src/practice-feed-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { RecoveryAllocationRepository } from "../src/recovery-allocation-repository.js";
import { issuePracticeSession, authenticatePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const context = testTenantContext(DEMO_TENANT_ID);
const actor = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
const priorEnvironment = process.env.JOBGUARD_ENV;
const passphrase = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, migrationLogin: Pool, directory: string;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const repo = (environment = "synthetic_demo", pool = runtime) => new RecoveryAllocationRepository(pool, environment);
const version = "recovery-allocation-command.v1";

beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  directory = await mkdtemp(join(tmpdir(), "jg-allocation-upgrade-"));
  const port = await freePort(63600, 180);
  const options = { host: "127.0.0.1", port, database: "postgres", user: "postgres", password: passphrase };
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: passphrase, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool(options);
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const at = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("0136_recovery_allocation.sql"));
  expect(at).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, at)) {
    const name = url.pathname.split("/").at(-1)!;
    const sql = await readFile(url, "utf8");
    await admin.query(name === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Allocation fictional builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query(`CREATE ROLE allocation_upgrade_login LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO allocation_upgrade_login`);
  runtime = new Pool({ ...options, user: "allocation_upgrade_login", max: 10 });
  await admin.query(`CREATE ROLE allocation_upgrade_migration_login LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_migration TO allocation_upgrade_migration_login`);
  migrationLogin = new Pool({ ...options, user: "allocation_upgrade_migration_login" });
}, 90_000);
afterAll(async () => {
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
  await closeTestPools(runtime, migrationLogin, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture({ claim1 = 32_000, claim2 = 250_000, settle = true }: { claim1?: number; claim2?: number; settle?: boolean } = {}) {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session), digest = auth.digest;
  const jobId = randomUUID(), quoteId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID();
  const draftId = randomUUID(), revisionId = randomUUID(), scopeId = randomUUID(), lineId = randomUUID();
  const scoped = practiceMaterialPool(runtime, digest), invoices = new PracticeInvoiceRepository(scoped);
  const db = await admin.connect();
  try {
    await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
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
  const invoice = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: actor.membershipId,
    commandId: randomUUID(), recipient: "allocation@example.invalid", issuedOn: "2026-10-12" });
  const evidenceIds: string[] = [];
  for (let index = 0; index < 2; index++) {
    const evidenceId = randomUUID(), uploadId = randomUUID(), proofScopeId = randomUUID(), bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==", "base64");
    const objectKey = `allocation/${evidenceId}`, objectVersion = `proof-${index + 1}-v1`, proofHash = hash(bytes);
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [proofScopeId, DEMO_TENANT_ID, jobId]);
    await admin.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'image/png',$7,'standard_evidence','verified',$8,clock_timestamp(),clock_timestamp()+interval '1 hour')`, [uploadId, DEMO_TENANT_ID, jobId, proofScopeId, objectKey, proofHash, bytes.length, objectVersion]);
    await admin.query(`INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
      VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7)`, [DEMO_TENANT_ID, uploadId, jobId, proofScopeId, objectKey, objectVersion, bytes]);
    await admin.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
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
  return { jobId, digest, invoiceId: invoice.id, invoices, cases, packs, feed, feedView, scopeId, lineId, revisionId,
    case1: views[0]!, case2: views[1]!, payment1: payments[0]!, payment2: payments[1]!, evidence1: evidenceIds[0]!, evidence2: evidenceIds[1]! };
}


type Fixture = Awaited<ReturnType<typeof fixture>>;
async function legacyLanding(f: Fixture) {
  const receiptId = randomUUID(), eligibilityId = randomUUID(), landingId = randomUUID(), evidenceId = randomUUID(), uploadId = randomUUID();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==", "base64"), sha = hash(bytes), objectKey = `allocation-legacy/${uploadId}`;
  await admin.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,$5,'image/png',$6,'standard_evidence','verified','v1',clock_timestamp(),clock_timestamp()+interval '1 hour')", [uploadId, DEMO_TENANT_ID, f.jobId, objectKey, sha, bytes.length]);
  await admin.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','synthetic_bank_receipt',$5,'v1',$6,$7,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())", [evidenceId, DEMO_TENANT_ID, uploadId, f.jobId, objectKey, sha, bytes.length]);
  await admin.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at) VALUES($1,$2,$3,$1::text,$1::text,'settled',120,'GBP',true,clock_timestamp())", [receiptId, DEMO_TENANT_ID, f.jobId]);
  for (const [id, kind] of [[eligibilityId, "eligibility"], [landingId, "landing"]]) await admin.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id) VALUES($1,$2,$3,$4,$5,$6,'approved','reference_fee_policy_v1',clock_timestamp()+interval '1 hour',$7)", [id, DEMO_TENANT_ID, f.jobId, f.case1.id, kind, f.case1.revision, randomUUID()]);
  return { version: "recovery.landing.approve.v1", allocationId: randomUUID(), derivationId: randomUUID(), journalId: randomUUID(), jobId: f.jobId,
    caseId: f.case1.id, receiptId, evidenceId, eligibilityApprovalId: eligibilityId, landingApprovalId: landingId,
    grossPence: 120, eligibleNetPence: 100, currency: "GBP", policyVersion: "reference_fee_policy_v1", expectedCaseRevision: f.case1.revision };
}

async function privileges(tables: string[]) {
  return {
    tables: (await admin.query("SELECT c.oid::regclass::text AS relation,pg_get_userbyid(c.relowner) AS owner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c WHERE c.oid=ANY($1::regclass[]) ORDER BY relation", [tables])).rows,
    policies: (await admin.query("SELECT p.polrelid::regclass::text AS relation,p.polname,p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid) AS using,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_policy p WHERE p.polrelid=ANY($1::regclass[]) ORDER BY relation,p.polname", [tables])).rows,
    v1: (await admin.query("SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,p.proacl::text,p.prosecdef FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[]) ORDER BY routine", [["app.approve_synthetic_landing(jsonb)", "app.reverse_synthetic_landing(uuid,uuid,uuid,uuid,uuid,bigint,character varying)"]])).rows,
  };
}

it("rule 9: applies only 0136 over nonempty v1 landings/cases/movements/invoices, then all later migrations twice preserve named canonical rows, full types and primary identities", async () => {
  const f = await fixture(), legacy = await legacyLanding(f);
  await withTenant(runtime, context, db => db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb)", [legacy]));
  const tables = ["app.recovery_case", "app.recovery_claim_revision", "app.recovery_case_event", "app.recovery_eligibility_revision", "app.synthetic_recovery_receipt",
    "app.recovery_approval", "app.landing_allocation", "app.recovery_fee_derivation", "app.customer_invoice", "app.customer_payment", "app.practice_feed_event", "app.practice_feed_receipt_match"];
  const allEarlierTables = (await admin.query(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND n.nspname IN('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1`)).rows.map(row => row.name as string);
  // Every populated predecessor table is compared, including Decisions, audit heads, identity and source artifacts.
  // Capture primary identities and column names/types before N; later columns/inserted rows remain outside that identity set.
  for (const table of allEarlierTables) if ((await admin.query(`SELECT EXISTS(SELECT 1 FROM ${table}) AS populated`)).rows[0]!.populated && !tables.includes(table)) tables.push(table);
  const before = await proofBefore(admin, tables), grants = await privileges(allEarlierTables);
  for (const table of tables) expect(Object.keys(before[table]!.rows).length, `${table}: nonempty pre-existing row guard`).toBeGreaterThan(0);
  const clean = { rows: [], types: [] };
  const url = MIGRATION_URLS.find(item => item.pathname.endsWith("0136_recovery_allocation.sql"))!;
  const migration = await migrationLogin.connect();
  try { await migration.query("SET ROLE jobguard_migration"); await migration.query(await readFile(url, "utf8")); }
  finally { await migration.query("RESET ROLE"); migration.release(); }
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('0136_recovery_allocation.sql')");
  expect(await proofDifferences(admin, before)).toEqual(clean);
  expect(await privileges(allEarlierTables)).toEqual(grants);
  await migrate(admin); await migrate(admin);
  expect(await proofDifferences(admin, before)).toEqual(clean);
  // Every control uses precisely the same proofDifferences comparison; all controls roll back their own mutations.
  await rolledBack(admin, async db => {
    await db.query("ALTER TABLE app.customer_payment DISABLE TRIGGER USER");
    await db.query("UPDATE app.customer_payment SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, f.payment1]);
    const changed = await proofDifferences(db, before);
    expect(changed.rows).toHaveLength(1); expect(changed.rows[0]).toContain("app.customer_payment"); expect(changed.types).toEqual([]);
  });
  expect(await proofDifferences(admin, before)).toEqual(clean);
  await rolledBack(admin, async db => {
    // The stored text stays equal; full format_type catches a varchar-to-text change by name.
    await db.query("ALTER TABLE app.customer_payment ALTER COLUMN reference TYPE text");
    const changed = await proofDifferences(db, before);
    expect(changed.types.some(change => change.includes("reference") && change.includes("text"))).toBe(true);
  });
  expect(await proofDifferences(admin, before)).toEqual(clean);
  await rolledBack(admin, async db => {
    await db.query("ALTER TABLE app.customer_payment ADD COLUMN later_nullable_control text");
    expect(await proofDifferences(db, before)).toEqual(clean);
  });
  await rolledBack(admin, async db => {
    expect(await scratchReplaceFunction(db, "app.half_even_ratio(bigint,bigint,bigint)")).toBe(true);
    expect(await proofDifferences(db, before)).toEqual(clean);
  });
  await rolledBack(admin, async db => {
    const laterId = randomUUID();
    await db.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at) VALUES($1,$2,$3,$1::text,$1::text,'settled',120,'GBP',true,clock_timestamp())", [laterId, DEMO_TENANT_ID, f.jobId]);
    expect((await db.query("SELECT count(*)::int n FROM app.synthetic_recovery_receipt WHERE id=$1", [laterId])).rows).toEqual([{ n: 1 }]);
    expect(await proofDifferences(db, before)).toEqual(clean);
  });
  expect(await proofDifferences(admin, before)).toEqual(clean);
});
