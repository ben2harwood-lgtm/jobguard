// Run against a fresh, seeded V2 rehearsal stack. No provider calls or real data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import * as db from "../../packages/db/dist/index.js";
import { createIdentityApplication } from "../../apps/api/dist/auth/index.js";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { M1_QUOTE_POLICY } from "../../packages/core/dist/index.js";
import { embeddedSystemId, storageData, verifyDatabaseTarget } from "./local-targets.mjs";
import { migrationUrl, validateSettings } from "./settings.mjs";

const { settings } = validateSettings({});
Object.assign(process.env, settings, { JOBGUARD_LOCAL_V2: "1", JOBGUARD_ENV: "synthetic_demo" });
if (process.env.JOBGUARD_V2_BACKEND === "embedded") process.env.JOBGUARD_V2_STORAGE_DIR = storageData;
process.env.AUTH_CODE_SECRET = readFileSync(new URL("../../.jobguard/v2-auth-secret", import.meta.url), "utf8");
const admin = new Pool({ connectionString: migrationUrl, max: 1 });
const runtime = new Pool({ connectionString: settings.DATABASE_URL, max: 2 });
const identity = createIdentityApplication(process.env);
const tenant = db.DEMO_TENANT_ID;
const day = 86_400_000;
let first, second;
let now = Date.now();
const repo = new db.V2ChaseRepository(runtime, () => now);
const input = (action, expectedVersion, extra = {}) => ({ version: "v2-chase-command.v1", commandId: randomUUID(), action, expectedVersion, ...extra });
async function signIn(localPart) {
  const credentials = { email: `${localPart}@jobguard-v2.invalid`, purpose: "signin" };
  const { fixtureCode } = await identity.request({ version: "identity-request.v1", ...credentials }, "127.0.0.1", identity.allowedOrigin);
  const { sessionToken } = await identity.verify({ version: "identity-verify.v1", ...credentials, code: fixtureCode }, identity.allowedOrigin);
  const token = await db.enterLinkedPracticeCompany(identity.provider.repository.pool, sessionToken, process.env.AUTH_CODE_SECRET,
    { version: "linked-practice-company.v1", action: "enter" });
  return { token, realToken: sessionToken, ...await db.authenticatePracticeSession(runtime, token) };
}
before(async () => {
  const embedded = process.env.JOBGUARD_V2_BACKEND === "embedded";
  await verifyDatabaseTarget(admin, embedded ? embeddedSystemId() : process.env.JOBGUARD_V2_TEST_SYSTEM_ID, embedded);
  assert.ok((await admin.query("SELECT to_regclass('app.v2_chase_setting') relation")).rows[0].relation,
    "Restart the V2 launcher to apply migration 2019 before running this suite");
  first = await signIn("builder"); second = await signIn("second-builder");
});
after(async () => {
  for (const person of [first, second]) if (person) await identity.provider.revokeSession(person.realToken);
  await Promise.all([admin.end(), runtime.end(), identity.provider.repository.pool.end()]);
});

// The normal capture/quote commands create a fresh, unanswered quote. No mutation
// of an immutable seed quote, authorization, acceptance or delivery is needed.
async function quoteFixture() {
  const workspace = createWorkspaceApplication({ pool: runtime, sessionId: first.token });
  const saved = await workspace.capture.create({ contractVersion: "job_capture_v1", requested_tenant_id: tenant,
    captureId: randomUUID(), fixtureId: "v2-a2-occupied-home", source: { kind: "text", text:
      "JOB: Fictional chasing rehearsal\nITEM: Fit kitchen splashback tiles | QTY: 6 | UNIT: m2 | RATE: £95.00\nITEM: Paint the hall | QTY: 1 | UNIT: item | RATE: £420.00" } });
  const job = saved.jobId;
  const partyView = await workspace.parties.view({ sessionId: first.token }, job);
  await workspace.parties.command({ sessionId: first.token }, job, { version: "job-parties-command.v1", action: "save_form",
    commandId: randomUUID(), expectedJobRevision: partyView.jobRevision, expectedBindingId: null,
    customer: { version: "customer.v1", type: "person", name: "Fictional Customer", email: "customer@jobguard-v2.invalid", phone: "+447700900042" },
    customerRef: null, site: { version: "site.v1", addressLines: ["42 Make-Believe Mews"], town: "Sampleford", postcode: "ZY1 0AA" },
    savedSiteRevisionId: null, reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false,
    payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false });
  const { review } = await workspace.capture.save(job, { contractVersion: "proposal_review_command_v1", expectedRevision: 0,
    review: { version: "proposal_review_v1", jobId: job, proposalId: saved.proposalId, reviewId: saved.reviewId, revision: 0,
      lines: saved.proposal.lines.map(line => ({ id: line.id, scopeItemId: line.scopeItemId, origin: "proposal",
        description: line.description.value, room: "Kitchen", category: "Tiling", quantity: line.quantity.value, unit: line.unit.value,
        unitPricePence: line.unitPricePence.value, disposition: "accepted", dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt })),
      questions: saved.proposal.questions.map(({ question }) => ({ id: randomUUID(), question: question.value, blocking: true,
        disposition: "answered", answer: "Fictional builder removes the waste." })) } });
  await workspace.capture.confirm(job, { contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: review.revision });
  const priced = await workspace.quote.get(job);
  await workspace.quote.save(job, { contractVersion: "quote_draft_command_v1", draftId: randomUUID(), expectedRevision: 0,
    currency: M1_QUOTE_POLICY.currency, taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion,
    lines: priced.scope.map(line => ({ ...line, id: randomUUID(), origin: "captured", included: true, exclusionReason: null,
      discountPercent: "0", taxTreatment: M1_QUOTE_POLICY.taxTreatment, rateProvenance: "entered", category: "Tiling", region: null })) });
  const { view } = await workspace.quote.preview(job, { version: "quote-preview-command.v1", recipient: "customer@jobguard-v2.invalid" });
  await workspace.quote.issue(job, { version: "quote-send-command.v1", commandId: randomUUID(), documentId: view.documentId,
    contentHash: view.contentHash, recipient: "customer@jobguard-v2.invalid" });
  await workspace.quote.execute(job, { version: "quote-execute-command.v1", documentId: view.documentId, mode: "success" });
  const anchor = (await admin.query("SELECT issued_at FROM app.quote_send WHERE tenant_id=$1 AND job_id=$2", [tenant, job])).rows[0].issued_at.getTime();
  return { job, view, workspace, anchor };
}
async function setting(job, enabled) {
  const view = await repo.read(first.token, job);
  return repo.command(first.token, job, input("setting", view.revision, { enabled }));
}
async function run(job) {
  return repo.command(first.token, job, input("run", (await repo.read(first.token, job)).revision));
}
async function effects(job) {
  return (await admin.query(`SELECT
    (SELECT count(*)::int FROM app.v2_chase_log WHERE job_id=$1) logs,
    (SELECT count(*)::int FROM app.v2_chase_command WHERE job_id=$1) commands,
    (SELECT count(*)::int FROM app.audit_event WHERE subject_ref=$1::text AND event_type LIKE 'v2.chase.%') audits`, [job])).rows[0];
}

// Administrative synthetic source fixtures only. These are not live issuance or
// payment tests; K4 must read their current balance and suppression facts safely.
async function invoiceFixture(f, flags = {}) {
  const { activeAcceptance } = await f.workspace.quote.accept(f.job, { version: "quote-acceptance-command.v1", commandId: randomUUID(),
    documentId: f.view.documentId, documentVersion: f.view.documentVersion, documentHash: f.view.contentHash,
    statedCustomerName: "Fictional Customer", statedMethod: "verbal", acceptedAt: new Date().toISOString() });
  assert.equal(activeAcceptance.documentId, f.view.documentId);
  const invoice = randomUUID(), revision = randomUUID(), draft = randomUUID(), sourceHash = "b".repeat(64);
  const authorization = (await admin.query("SELECT authorization_id FROM app.quote_send WHERE tenant_id=$1 AND job_id=$2", [tenant, f.job])).rows[0].authorization_id;
  await db.withTenant(admin, first.context, async tx => {
    await tx.$client.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draft, tenant, f.job]);
    await tx.$client.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,
      baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
      VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',10000,2000,12000,false,'[]')`,
    [revision, tenant, f.job, draft, sourceHash, f.view.documentId]);
    await tx.$client.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,
      issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
      VALUES($1,$2,$3,$4,$5,$6,'2026-11-01','{}','candidate_m1_standard_v1','GBP',10000,2000,12000,$7,$7,$8,true,'SYNTHETIC - NOT A REAL INVOICE')`,
    [invoice, tenant, f.job, revision, authorization, `K4-${invoice.slice(0, 8)}`, sourceHash, Buffer.from("synthetic fixture")]);
  });
  const projection = { version: "dunning-invoice.v1", environment: "synthetic_demo", tenantId: tenant, jobId: f.job, invoiceId: invoice,
    revision: 1, sourceRevision: 1, sourceHash, sourceState: "issued_invoice", finalAccountLockId: null, currency: "GBP",
    originalPence: 12000, outstandingPence: 12000, dueTick: f.anchor, category: "customer", recipient: "customer@jobguard-v2.invalid",
    pilotNoCharge: false, disputed: false, refundPending: false, reversed: false, cancelled: false, attemptState: "none", ...flags };
  await admin.query("INSERT INTO app.dunning_invoice(tenant_id,job_id,invoice_id,projection) VALUES($1,$2,$3,$4)", [tenant, f.job, invoice, projection]);
  return { invoice, projection, authorization };
}

test("V2-K4 real PostgreSQL rehearsal", { timeout: 240_000 }, async t => {
  const f = await quoteFixture();
  await t.test("quote day 3/day 7, exact replay, altered replay and catcher/audit counts", async () => {
    await setting(f.job, true);
    now = f.anchor + 3 * day - 1; assert.equal((await run(f.job)).captured, 0);
    now++;
    const request = input("run", (await repo.read(first.token, f.job)).revision);
    assert.equal((await repo.command(first.token, f.job, request)).captured, 1);
    const before = await effects(f.job);
    assert.equal((await repo.command(first.token, f.job, request)).replayed, true);
    assert.deepEqual(await effects(f.job), before);
    await assert.rejects(repo.command(first.token, f.job, { ...request, action: "setting", enabled: false }), /CHASE_CONFLICT/);
    assert.equal((await run(f.job)).captured, 0);
    now = f.anchor + 7 * day; assert.equal((await run(f.job)).captured, 1);
    now += 100 * day; assert.equal((await run(f.job)).captured, 0);
    const messages = (await repo.read(first.token, f.job)).log.filter(row => row.message);
    assert.equal(messages.length, 2); assert.deepEqual(messages.map(row => row.step), [1, 2]);
    assert.ok(messages.every(row => row.message.includes("Fictional Bramble Button Builders") && !/hidden|fee|margin/i.test(row.message)));
    const events = (await admin.query("SELECT actor_ref,event_type,payload FROM app.audit_event WHERE subject_ref=$1 AND event_type LIKE 'v2.chase.%'", [f.job])).rows;
    const receipts = (await effects(f.job)).commands;
    assert.equal(events.length, receipts + 2);
    assert.ok(events.every(row => row.actor_ref === `membership:${first.membershipId}` && row.payload.references.commandId && !('version' in row.payload.references)));
  });
  await t.test("switching the firm off stops future steps on a different job; reply and dispute are permanent", async () => {
    const other = await quoteFixture();
    await setting(f.job, false); now = other.anchor + 3 * day;
    assert.equal((await run(other.job)).captured, 0);
    assert.ok((await repo.read(first.token, other.job)).items.every(row => row.next === null));
    await setting(f.job, true);
    for (const reason of ["reply", "dispute", "builder_stop"]) {
      const stopped = await quoteFixture();
      const revision = (await repo.read(first.token, stopped.job)).revision;
      const stop = input("stop", revision, { kind: "quote", itemId: stopped.view.documentId, reason });
      await repo.command(first.token, stopped.job, stop);
      const before = await effects(stopped.job); await repo.command(first.token, stopped.job, stop);
      assert.deepEqual(await effects(stopped.job), before);
      now = stopped.anchor + 20 * day; assert.equal((await run(stopped.job)).captured, 0);
    }
  });
  await t.test("invoice due+3/+10, accepted quotes stop, paid/part-paid-disputed/pilot invoices never chase", async () => {
    for (const flags of [{}, { disputed: true, outstandingPence: 6000 }, { pilotNoCharge: true }, { outstandingPence: 0 }]) {
      const job = await quoteFixture(), fixture = await invoiceFixture(job, flags);
      if (flags.disputed || flags.outstandingPence === 0) {
        await db.withTenant(admin, first.context, tx => tx.$client.query(`INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,
          authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
          VALUES($1,$2,$3,$4,$5,'2026-11-20',$6,'GBP','bank_transfer','fictional-k4',true,'manual_builder_attestation')`,
        [randomUUID(), tenant, job.job, fixture.invoice, fixture.authorization, flags.disputed ? 6000 : 12000]));
      }
      now = job.anchor + 3 * day - 1; assert.equal((await run(job.job)).captured, 0);
      now++;
      assert.equal((await run(job.job)).captured, Object.keys(flags).length ? 0 : 1);
      now = job.anchor + 10 * day;
      assert.equal((await run(job.job)).captured, Object.keys(flags).length ? 0 : 1);
      now += 30 * day; assert.equal((await run(job.job)).captured, 0);
      if (!Object.keys(flags).length) {
        const logs = (await repo.read(first.token, job.job)).log.filter(row => row.message);
        assert.equal(logs.length, 2); assert.ok(logs.every(row => row.kind === "invoice"));
      }
      // A recorded payment, even with stale metadata, suppresses rather than reuses an old amount.
      if (!flags.disputed && flags.outstandingPence !== 0) await db.withTenant(admin, first.context, tx => tx.$client.query(`INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,
        authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
        VALUES($1,$2,$3,$4,$5,'2026-11-20',$6,'GBP','bank_transfer','fictional-k4',true,'manual_builder_attestation')`,
      [randomUUID(), tenant, job.job, fixture.invoice, fixture.authorization, flags.disputed ? 6000 : 12000]));
      assert.equal((await run(job.job)).captured, 0);
    }
  });
  await t.test("declining a sent quote stops reminders without needing the K4 stop command", async () => {
    const declined = await quoteFixture();
    await declined.workspace.quote.disposition(declined.job, { version: "quote-disposition-command.v1", commandId: randomUUID(),
      documentId: declined.view.documentId, documentHash: declined.view.contentHash, documentVersion: declined.view.documentVersion,
      kind: "declined", occurredAt: new Date().toISOString() });
    now = declined.anchor + 20 * day;
    assert.equal((await run(declined.job)).captured, 0);
    assert.equal((await repo.read(first.token, declined.job)).items[0].stoppedReason, "decision");
  });
  await t.test("second linked firm cannot reach the first firm's reads or writes", async () => {
    await assert.rejects(repo.read(second.token, f.job), /NOT_FOUND/);
    await assert.rejects(repo.command(second.token, f.job, input("run", 0)), /NOT_FOUND/);
    await db.withTenant(runtime, second.context, async tx => {
      for (const table of ["v2_chase_setting", "v2_chase_log", "v2_chase_command"]) {
        const rows = await tx.$client.query(`SELECT * FROM app.${table} WHERE firm_key=$1`, [`practice:${first.digest}`]);
        assert.equal(rows.rowCount, 0);
      }
      const update = await tx.$client.query("UPDATE app.v2_chase_setting SET enabled=false WHERE firm_key=$1", [`practice:${first.digest}`]);
      assert.equal(update.rowCount, 0);
    });
    await assert.rejects(db.withTenant(runtime, second.context, tx => tx.$client.query(`INSERT INTO app.v2_chase_setting
      (tenant_id,firm_key,enabled,revision,actor_membership_id) VALUES($1,$2,true,1,$3)`, [tenant, `practice:${first.digest}`, second.membershipId])));
    for (const table of ["v2_chase_log", "v2_chase_command"]) {
      const foreign = (await admin.query(`SELECT to_jsonb(x) row FROM app.${table} x WHERE job_id=$1 LIMIT 1`, [f.job])).rows[0].row;
      await assert.rejects(db.withTenant(runtime, second.context, tx => tx.$client.query(
        `INSERT INTO app.${table} SELECT * FROM jsonb_populate_record(NULL::app.${table},$1::jsonb)`, [foreign])), { code: "42501" });
      await assert.rejects(db.withTenant(runtime, second.context, tx => tx.$client.query(`UPDATE app.${table} SET job_id=$1 WHERE firm_key=$2`, [f.job, `practice:${first.digest}`])));
    }
    for (const table of ["v2_chase_setting", "v2_chase_log", "v2_chase_command"]) {
      await assert.rejects(db.withTenant(runtime, second.context, tx => tx.$client.query(`DELETE FROM app.${table} WHERE firm_key=$1`, [`practice:${first.digest}`])));
    }
  });
  await t.test("forced failure after business insert rolls back settings, rows and audit", async () => {
    const before = await effects(f.job), old = await repo.read(first.token, f.job);
    await admin.query(`CREATE FUNCTION app.v2_k4_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'K4_FORCED_AFTER_INSERT'; END $$;
      CREATE TRIGGER v2_k4_test_failure BEFORE INSERT ON app.v2_chase_command FOR EACH ROW EXECUTE FUNCTION app.v2_k4_test_failure()`);
    try {
      await assert.rejects(repo.command(first.token, f.job, input("setting", old.revision, { enabled: !old.enabled })), /K4_FORCED_AFTER_INSERT/);
      assert.deepEqual(await effects(f.job), before);
      assert.equal((await repo.read(first.token, f.job)).revision, old.revision);
      // The same trigger also fires after a new chase log row has been inserted.
      const fresh = await quoteFixture(); now = fresh.anchor + 3 * day;
      const freshBefore = await effects(fresh.job);
      await assert.rejects(run(fresh.job), /K4_FORCED_AFTER_INSERT/);
      assert.deepEqual(await effects(fresh.job), freshBefore);
    } finally {
      await admin.query("DROP TRIGGER v2_k4_test_failure ON app.v2_chase_command; DROP FUNCTION app.v2_k4_test_failure()");
    }
  });
  await t.test("forced RLS, narrow grants, upgrade preserves rows and repeated installation", async () => {
    const before = await effects(f.job);
    await admin.query(readFileSync(new URL("./migrations/2019_automatic_chasing.sql", import.meta.url), "utf8"));
    assert.deepEqual(await effects(f.job), before);
    const catalog = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname owner,
      has_table_privilege('jobguard_runtime',c.oid,'DELETE') can_delete,
      has_table_privilege('jobguard_runtime',c.oid,'TRUNCATE') can_truncate
      FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid=ANY($1::regclass[])`,
    [["app.v2_chase_setting", "app.v2_chase_log", "app.v2_chase_command"]])).rows;
    assert.equal(catalog.length, 3);
    assert.ok(catalog.every(row => row.owner === "jobguard_migration" && row.relrowsecurity && row.relforcerowsecurity && !row.can_delete && !row.can_truncate));
    await setting(f.job, false);
  });
});
