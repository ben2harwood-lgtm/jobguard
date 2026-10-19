// Written before persistence; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
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
  directory = await mkdtemp(join(tmpdir(), "jg-allocation-races-"));
  const port = await freePort(63200, 180);
  const options = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "postgres", password: passphrase };
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: passphrase, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  admin = new Pool(options); await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Allocation fictional builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query(`CREATE ROLE allocation_races_login LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO allocation_races_login`);
  runtime = new Pool({ ...options, user: "allocation_races_login", max: 10 });
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

// pg_stat_activity can show wait_event_type='Lock' while `query` still holds the previous statement, so a row only counts
// once its query text is the advisory-lock statement itself. Poll every 10 ms; the wait stays bounded and fails loudly.
async function waitForLock(applicationName: string) {
  const deadline = Date.now() + 2000;
  let lastSeen: string[] = [];
  while (Date.now() < deadline) {
    const rows = (await admin.query("SELECT query,wait_event_type FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [applicationName])).rows;
    const hit = rows.find(row => String(row.query).includes("pg_advisory_xact_lock"));
    if (hit) return hit;
    lastSeen = rows.map(row => String(row.query).slice(0, 120));
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Expected PostgreSQL case advisory wait (pg_advisory_xact_lock under wait_event_type='Lock') was not observed within 2000 ms for ${applicationName}; lock-waiting queries last seen: ${JSON.stringify(lastSeen)}`);
}
function heldCasePool(applicationName: string) {
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { acquired = resolve; });
  let captured = false;
  const pool = new Proxy(runtime, { get(target, property) {
    if (property === "connect") return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, key) {
        if (key === "query") return async (sql: string, values?: unknown[]) => {
          const result = await connection.query(sql, values);
          if (sql === "BEGIN") {
            await connection.query("SELECT set_config('application_name',$1,true)", [applicationName]);
            await connection.query("SET LOCAL lock_timeout='3s'");
            await connection.query("SET LOCAL statement_timeout='5s'");
          }
          if (!captured && sql.includes("pg_advisory_xact_lock")) { captured = true; acquired(); await gate; }
          return result;
        };
        const value = Reflect.get(connection, key);
        return typeof value === "function" ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { pool, locked, release };
}
function timedPool(applicationName: string) {
  return new Proxy(runtime, { get(target, property) {
    if (property === "connect") return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, key) {
        if (key === "query") return async (sql: string, values?: unknown[]) => {
          const result = await connection.query(sql, values);
          if (sql === "BEGIN") {
            await connection.query("SELECT set_config('application_name',$1,true)", [applicationName]);
            await connection.query("SET LOCAL lock_timeout='3s'");
            await connection.query("SET LOCAL statement_timeout='5s'");
          }
          return result;
        };
        const value = Reflect.get(connection, key);
        return typeof value === "function" ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
const outcome = (promise: Promise<unknown>) => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
const noDeadlock = (result: Awaited<ReturnType<typeof outcome>>) => {
  if (!result.ok) {
    expect(result.error).not.toMatchObject({ code: "40P01" });
    expect(result.error).not.toMatchObject({ code: "55P03" });
    expect(result.error).not.toMatchObject({ code: "57014" });
    expect(String(result.error)).not.toMatch(/deadlock|lock timeout|statement timeout/iu);
  }
};

it.each(["A", "B"] as const)("[M-LOCK] same case: caller %s takes canonical key first, competing replay waits and no write duplicates", async first => {
  const f = await fixture(), command = await reviewed(f);
  const held = heldCasePool(`m4_8_s_first_${first}_${randomUUID()}`), waitingName = `m4_8_s_wait_${randomUUID()}`;
  const a = new RecoveryAllocationRepository(first === "A" ? held.pool : timedPool(waitingName), "synthetic_demo");
  const b = new RecoveryAllocationRepository(first === "B" ? held.pool : timedPool(waitingName), "synthetic_demo");
  const invoke = (repository: RecoveryAllocationRepository) => repository.command(context, actor, f.digest, f.jobId, command);
  const firstPromise = outcome(invoke(first === "A" ? a : b));
  let secondPromise: ReturnType<typeof outcome> | undefined;
  try {
    await held.locked;
    secondPromise = outcome(invoke(first === "A" ? b : a));
    expect((await waitForLock(waitingName)).query).toContain("pg_advisory_xact_lock");
    held.release();
    const results = await Promise.all([firstPromise, secondPromise]);
    results.forEach(noDeadlock);
    expect(results.every(result => result.ok)).toBe(true);
    expect((await countRows(f)).allocations).toBe(1);
    expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, command.commandId])).rows).toEqual([{ n: 1 }]);
    const saved = await originals(f), counts = await countRows(f);
    await invoke(a); await invoke(b);
    expect(await originals(f)).toEqual(saved);
    expect(await countRows(f)).toEqual(counts);
  } finally { held.release(); await firstPromise; await secondPromise; }
});

it("DW8: eight parallel repetitions of one command produce one allocation, one case event and no extra audit", async () => {
  const f = await fixture(), command = await reviewed(f);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => run(f, command)));
  expect(results.every(result => result.status === "fulfilled")).toBe(true);
  expect((await countRows(f)).allocations).toBe(1);
  const counts = await countRows(f);
  for (let i = 0; i < 3; i++) await run(f, command);
  expect(await countRows(f)).toEqual(counts);
  await expect(run(f, { ...command, grossPence: command.grossPence - 6 })).rejects.toMatchObject({ code: "ALLOCATION_IDEMPOTENCY_CONFLICT" });
  const anotherOwnedJob = randomUUID();
  await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Another owned replay target',$3,'capture')", [anotherOwnedJob, DEMO_TENANT_ID, f.digest]);
  await expect(repo().command(context, actor, f.digest, anotherOwnedJob, command)).rejects.toMatchObject({ code: "ALLOCATION_IDEMPOTENCY_CONFLICT" });
  expect(await countRows(f)).toEqual(counts);
});

it("DW3: different cases competing for one fully allocated receipt conserve PostgreSQL cash", async () => {
  const f = await fixture({ claim2: 32000 });
  const a = await reviewed(f), b = await reviewed(f, { ...allocationInput(f), caseId: f.case2.id, expectedCaseRevision: f.case2.revision });
  const results = await Promise.allSettled([run(f, a), run(f, b)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  for (const result of results) if (result.status === "rejected") noDeadlock({ ok: false, error: result.reason });
  expect((await admin.query("SELECT sum(gross_pence)::text AS gross FROM app.recovery_case_allocation WHERE tenant_id=$1 AND payment_id=$2", [DEMO_TENANT_ID, f.payment1])).rows).toEqual([{ gross: "38400" }]);
});

async function legacyLanding(f: Fixture) {
  const receiptId = randomUUID(), eligibilityId = randomUUID(), landingId = randomUUID(), evidenceId = randomUUID(), uploadId = randomUUID();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==", "base64"), sha = hash(bytes), objectKey = `allocation-legacy/${uploadId}`;
  await tq("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,$5,'image/png',$6,'standard_evidence','verified','v1',clock_timestamp(),clock_timestamp()+interval '1 hour')", [uploadId, DEMO_TENANT_ID, f.jobId, objectKey, sha, bytes.length]);
  await tq("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','synthetic_bank_receipt',$5,'v1',$6,$7,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())", [evidenceId, DEMO_TENANT_ID, uploadId, f.jobId, objectKey, sha, bytes.length]);
  await admin.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at) VALUES($1::uuid,$2,$3,($1::uuid)::text,($1::uuid)::text,'settled',120,'GBP',true,clock_timestamp())", [receiptId, DEMO_TENANT_ID, f.jobId]);
  for (const [id, kind] of [[eligibilityId, "eligibility"], [landingId, "landing"]]) await admin.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id) VALUES($1,$2,$3,$4,$5,$6,'approved','reference_fee_policy_v1',clock_timestamp()+interval '1 hour',$7)", [id, DEMO_TENANT_ID, f.jobId, f.case1.id, kind, f.case1.revision, randomUUID()]);
  return { version: "recovery.landing.approve.v1", allocationId: randomUUID(), derivationId: randomUUID(), journalId: randomUUID(), jobId: f.jobId,
    caseId: f.case1.id, receiptId, evidenceId, eligibilityApprovalId: eligibilityId, landingApprovalId: landingId,
    grossPence: 120, eligibleNetPence: 100, currency: "GBP", policyVersion: "reference_fee_policy_v1", expectedCaseRevision: f.case1.revision };
}

it.each(["allocator", "v1"] as const)("[M-LOCK] allocator versus merged v1 approve_synthetic_landing on the same case, %s takes the key first", async first => {
  const f = await fixture(), command = await reviewed(f), legacy = await legacyLanding(f);
  const held = heldCasePool(`m4_8_s_legacy_first_${randomUUID()}`), waitingName = `m4_8_s_legacy_wait_${randomUUID()}`;
  const allocator = () => new RecoveryAllocationRepository(first === "allocator" ? held.pool : timedPool(waitingName), "synthetic_demo").command(context, actor, f.digest, f.jobId, command);
  const v1 = () => withTenant(first === "v1" ? held.pool : timedPool(waitingName), context, async db => {
    // Holding the exact merged key before entering its routine forces the interleaving, without touching job/case rows first.
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [DEMO_TENANT_ID, f.case1.id]);
    return db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb) AS id", [legacy]);
  });
  const firstPromise = outcome(first === "allocator" ? allocator() : v1());
  let secondPromise: ReturnType<typeof outcome> | undefined;
  try {
    await held.locked;
    secondPromise = outcome(first === "allocator" ? v1() : allocator());
    expect((await waitForLock(waitingName)).query).toContain("pg_advisory_xact_lock");
    held.release();
    const results = await Promise.all([firstPromise, secondPromise]); results.forEach(noDeadlock);
    expect(results[0]!.ok).toBe(true); expect(results[1]!.ok).toBe(false);
    const allocationCount = (await countRows(f)).allocations;
    expect(allocationCount).toBe(first === "allocator" ? 1 : 0);
    const legacyCount = (await admin.query("SELECT count(*)::int n FROM app.landing_allocation WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, legacy.allocationId])).rows[0]!.n;
    expect(legacyCount).toBe(first === "v1" ? 1 : 0);
    const before = await countRows(f);
    if (first === "allocator") await allocator(); else {
      // The untouched legacy routine refuses exhausted-receipt replay; it still writes nothing twice.
      const replay = await outcome(v1()); noDeadlock(replay);
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.error).toMatchObject({ code: "23514" });
    }
    expect(await countRows(f)).toEqual(before);
    expect((await admin.query("SELECT count(*)::int n FROM app.landing_allocation WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, legacy.allocationId])).rows[0]!.n).toBe(legacyCount);
  } finally { held.release(); await firstPromise; await secondPromise; }
});

it.each(["allocator", "case-command"] as const)("[M-LOCK] allocator versus merged v1 public recovery-case command, %s acquires the canonical key first", async first => {
  const f = await fixture(), command = await reviewed(f);
  const caseCommand = { version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId: f.case1.id,
    expectedRevision: f.case1.revision, eventType: "record_landing", amountPence: 100 };
  const held = heldCasePool(`m4_8_s_case_first_${randomUUID()}`), waitingName = `m4_8_s_case_wait_${randomUUID()}`;
  const allocator = () => new RecoveryAllocationRepository(first === "allocator" ? held.pool : timedPool(waitingName), "synthetic_demo").command(context, actor, f.digest, f.jobId, command);
  const merged = () => new RecoveryCaseRepository(first === "case-command" ? held.pool : timedPool(waitingName)).command(context, f.jobId, caseCommand, actor);
  const firstPromise = outcome(first === "allocator" ? allocator() : merged());
  let secondPromise: ReturnType<typeof outcome> | undefined;
  try {
    await held.locked;
    secondPromise = outcome(first === "allocator" ? merged() : allocator());
    expect((await waitForLock(waitingName)).query).toContain("pg_advisory_xact_lock");
    held.release();
    const results = await Promise.all([firstPromise, secondPromise]); results.forEach(noDeadlock);
    expect(results[0]!.ok).toBe(true); expect(results[1]!.ok).toBe(false);
    const winnerId = first === "allocator" ? command.commandId : caseCommand.commandId;
    expect((await admin.query("SELECT command_id,count(*)::int n FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=ANY($2::uuid[]) GROUP BY command_id", [DEMO_TENANT_ID, [command.commandId, caseCommand.commandId]])).rows).toEqual([{ command_id: winnerId, n: 1 }]);
    const before = await countRows(f);
    if (first === "allocator") await allocator(); else await merged();
    expect(await countRows(f)).toEqual(before);
  } finally { held.release(); await firstPromise; await secondPromise; }
});

it.each(["A", "B"] as const)("[M-LOCK] distinct same-case commands: %s holds the key first; stale contender rolls back all business writes", async first => {
  const f = await fixture(), a = await reviewed(f), b = { ...a, commandId: randomUUID() };
  const held = heldCasePool(`m4_8_s_distinct_first_${first}_${randomUUID()}`), waitingName = `m4_8_s_distinct_wait_${randomUUID()}`;
  const winningCommand = first === "A" ? a : b, losingCommand = first === "A" ? b : a;
  const firstPromise = outcome(new RecoveryAllocationRepository(held.pool, "synthetic_demo").command(context, actor, f.digest, f.jobId, winningCommand));
  let secondPromise: ReturnType<typeof outcome> | undefined;
  try {
    await held.locked;
    secondPromise = outcome(new RecoveryAllocationRepository(timedPool(waitingName), "synthetic_demo").command(context, actor, f.digest, f.jobId, losingCommand));
    expect((await waitForLock(waitingName)).query).toContain("pg_advisory_xact_lock");
    held.release(); const results = await Promise.all([firstPromise, secondPromise]); results.forEach(noDeadlock);
    expect(results[0]!.ok).toBe(true); expect(results[1]!.ok).toBe(false);
    expect((await admin.query("SELECT command_id,count(*)::int n FROM app.recovery_allocation_command WHERE tenant_id=$1 AND command_id=ANY($2::uuid[]) GROUP BY command_id", [DEMO_TENANT_ID, [a.commandId, b.commandId]])).rows).toEqual([{ command_id: winningCommand.commandId, n: 1 }]);
    expect((await countRows(f)).allocations).toBe(1);
    const saved = await countRows(f); await run(f, winningCommand); expect(await countRows(f)).toEqual(saved);
  } finally { held.release(); await firstPromise; await secondPromise; }
});
