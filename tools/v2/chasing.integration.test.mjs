// Run against a fresh, seeded V2 rehearsal stack. No provider calls or real data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as db from "../../packages/db/dist/index.js";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { M1_QUOTE_POLICY } from "../../packages/core/dist/index.js";

const tenant = db.DEMO_TENANT_ID;
const day = 86_400_000;
const input = (action, expectedVersion, extra = {}) => ({ version: "v2-chase-command.v1", commandId: randomUUID(), action, expectedVersion, ...extra });
export async function runChasingProof(t, { admin, runtime, firstSession, secondSession }) {
  const principal = async ({ sessionId }) => ({ token: sessionId, ...await db.authenticatePracticeSession(runtime, sessionId) });
  const first = await principal(firstSession), second = await principal(secondSession);
  assert.ok((await admin.query("SELECT to_regclass('app.v2_chase_setting') relation")).rows[0].relation,
    "Apply migration 2019 before running the V2 seed suite");
  let now = Date.now();
  const repo = new db.V2ChaseRepository(runtime, () => now);
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
    const quoteInput = { contractVersion: "quote_draft_command_v1", draftId: randomUUID(), expectedRevision: 0,
      currency: M1_QUOTE_POLICY.currency, taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion,
      lines: priced.scope.map(line => ({ ...line, id: randomUUID(), origin: "captured", included: true, exclusionReason: null,
        discountPercent: "0", taxTreatment: M1_QUOTE_POLICY.taxTreatment, rateProvenance: "entered", category: "Tiling", region: null })) };
    await workspace.quote.save(job, quoteInput);
    const { view } = await workspace.quote.preview(job, { version: "quote-preview-command.v1", recipient: "customer@jobguard-v2.invalid" });
    await workspace.quote.issue(job, { version: "quote-send-command.v1", commandId: randomUUID(), documentId: view.documentId,
      contentHash: view.contentHash, recipient: "customer@jobguard-v2.invalid" });
    await workspace.quote.execute(job, { version: "quote-execute-command.v1", documentId: view.documentId, mode: "success" });
    const anchor = (await admin.query("SELECT issued_at FROM app.quote_send WHERE tenant_id=$1 AND job_id=$2", [tenant, job])).rows[0].issued_at.getTime();
    return { job, view, workspace, anchor, quoteInput };
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

  async function recordPayment(job, fixture, amountPence) {
    await db.withTenant(admin, first.context, tx => tx.$client.query(`INSERT INTO app.customer_payment
      (id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
      VALUES($1,$2,$3,$4,$5,'2026-11-20',$6,'GBP','bank_transfer','fictional-k4',true,'manual_builder_attestation')`,
    [randomUUID(), tenant, job.job, fixture.invoice, fixture.authorization, amountPence]));
  }
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
        await recordPayment(job, fixture, flags.disputed ? 6000 : 12000);
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
      if (!flags.disputed && flags.outstandingPence !== 0) await recordPayment(job, fixture, 12000);
      assert.equal((await run(job.job)).captured, 0);
    }
  });
  await t.test("a missed quote or invoice sends only the latest due step inside its two-day window", async () => {
    for (const kind of ["quote", "invoice"]) {
      // Exercise the inclusive deadline and the very next millisecond.
      for (const lateBy of [2 * day, 2 * day + 1]) {
        const job = await quoteFixture();
        const itemId = kind === "quote" ? job.view.documentId : (await invoiceFixture(job)).invoice;
        await setting(job.job, false);
        now = job.anchor + (kind === "quote" ? 7 : 10) * day + lateBy;
        await setting(job.job, true);
        const captured = lateBy === 2 * day ? 1 : 0;
        const command = input("run", (await repo.read(first.token, job.job)).revision);
        assert.equal((await repo.command(first.token, job.job, command)).captured, captured);
        const initial = await effects(job.job);
        assert.equal((await repo.command(first.token, job.job, command)).replayed, true);
        assert.deepEqual(await effects(job.job), initial);
        assert.equal((await run(job.job)).captured, 0);
        now += 90 * day;
        assert.equal((await run(job.job)).captured, 0);
        const state = await repo.read(first.token, job.job);
        const steps = state.log.filter(row => row.item_id === itemId && row.step > 0).sort((a, b) => a.step - b.step);
        assert.deepEqual(steps.map(row => row.step), [1, 2]);
        const skipped = steps.filter(row => row.stopped_reason === "chase_skipped");
        assert.deepEqual(skipped.map(row => row.step), captured ? [1] : [1, 2]);
        assert.ok(skipped.every(row => row.message === null && row.sent_at === null));
        assert.deepEqual(steps.filter(row => row.message !== null).map(row => row.step), captured ? [2] : []);
        assert.equal(state.items.find(item => item.id === itemId).next, null);
      }
    }
  });
  await t.test("a declined quote records the K4 decision stop without the main-only disposition routine", async () => {
    const job = await quoteFixture();
    const command = input("stop", (await repo.read(first.token, job.job)).revision,
      { kind: "quote", itemId: job.view.documentId, reason: "decision" });
    await repo.command(first.token, job.job, command);
    const old = await effects(job.job);
    assert.equal((await repo.command(first.token, job.job, command)).replayed, true);
    assert.deepEqual(await effects(job.job), old);
    now = job.anchor + 3 * day;
    assert.equal((await run(job.job)).captured, 0);
    assert.equal((await repo.read(first.token, job.job)).items.find(item => item.id === job.view.documentId).stoppedReason, "decision");
  });
  await t.test("a newly issued quote withdraws the earlier version from chasing", async () => {
    const job = await quoteFixture();
    await job.workspace.quote.save(job.job, { ...job.quoteInput, expectedRevision: 1 });
    const { view } = await job.workspace.quote.preview(job.job, { version: "quote-preview-command.v1", recipient: "customer@jobguard-v2.invalid" });
    assert.ok(view.documentVersion > job.view.documentVersion);
    await job.workspace.quote.issue(job.job, { version: "quote-send-command.v1", commandId: randomUUID(),
      documentId: view.documentId, contentHash: view.contentHash, recipient: "customer@jobguard-v2.invalid" });
    await job.workspace.quote.execute(job.job, { version: "quote-execute-command.v1", documentId: view.documentId, mode: "success" });
    now = job.anchor + 4 * day;
    assert.equal((await run(job.job)).captured, 1);
    const state = await repo.read(first.token, job.job);
    assert.equal(state.items.find(item => item.id === job.view.documentId).stoppedReason, "decision");
    assert.deepEqual(state.log.filter(row => row.message).map(row => row.item_id), [view.documentId]);
  });
  for (const reduction of ["payment", "credit note"]) {
    await t.test(`an undisputed partial ${reduction} with matching metadata suppresses chasing`, async () => {
      const job = await quoteFixture(), fixture = await invoiceFixture(job, { outstandingPence: 6000 });
      if (reduction === "payment") {
        await recordPayment(job, fixture, 6000);
      } else {
        await db.withTenant(admin, first.context, tx => tx.$client.query(`INSERT INTO app.customer_credit_note
          (id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason,net_pence,tax_pence,total_pence)
          VALUES($1,$2,$3,$4,$5,$6,6000,'GBP','Fictional partial credit',-5000,-1000,-6000)`,
        [randomUUID(), tenant, job.job, fixture.invoice, fixture.authorization, `K4-CN-${fixture.invoice.slice(0, 8)}`]));
      }
      now = job.anchor + 3 * day;
      assert.equal((await run(job.job)).captured, 0);
      const invoice = (await repo.read(first.token, job.job)).items.find(item => item.id === fixture.invoice);
      assert.equal(invoice.amountPence, 6000);
      assert.equal(invoice.stoppedReason, "part_paid");
      assert.equal(invoice.next, null);
    });
  }
  await t.test("a no-charge pilot activation suppresses the invoice even with otherwise eligible metadata", async () => {
    const job = await quoteFixture(), fixture = await invoiceFixture(job);
    assert.equal(fixture.projection.pilotNoCharge, false);
    await db.withTenant(admin, first.context, tx => tx.$client.query(`INSERT INTO app.job_activation
      (id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,
       fee_policy_version,actor_membership_id,activated_at)
      VALUES($1,$2,$3,$4,$5,$6,'pilot_no_charge','pilot_no_charge.v1','reference_fee_policy_v1',$7,now())`,
    [randomUUID(), tenant, job.job, job.view.documentId, job.view.documentVersion, job.view.contentHash, first.membershipId]));
    now = job.anchor + 3 * day;
    assert.equal((await run(job.job)).captured, 0);
    const state = await repo.read(first.token, job.job);
    assert.equal(state.items.find(item => item.id === fixture.invoice).stoppedReason, "pilot_no_charge");
    assert.ok(!state.log.some(row => row.message));
  });
  for (const change of ["payment", "dispute", "reply", "switch-off"]) {
    await t.test(`a committed ${change} after selection prevents delivery, including on retry`, async t => {
      const job = await quoteFixture();
      const fixture = ["payment", "dispute"].includes(change) ? await invoiceFixture(job) : null;
      await setting(job.job, true);
      now = job.anchor + 3 * day;
      const initial = await repo.read(first.token, job.job);
      const id = fixture?.invoice ?? job.view.documentId;
      assert.equal(initial.items.find(item => item.id === id).next.step, 1);
      let hookCalls = 0;
      const racing = new db.V2ChaseRepository(runtime, () => now, async () => {
        hookCalls++;
        if (change === "payment") await recordPayment(job, fixture, 12000);
        if (change === "dispute") {
          const update = await admin.query(`UPDATE app.dunning_invoice SET projection=jsonb_set(projection,'{disputed}','true')
            WHERE tenant_id=$1 AND job_id=$2 AND invoice_id=$3`, [tenant, job.job, id]);
          assert.equal(update.rowCount, 1);
        }
        if (change === "reply") await repo.command(first.token, job.job, input("stop", initial.revision,
          { kind: "quote", itemId: id, reason: "reply" }));
        if (change === "switch-off") await setting(job.job, false);
      });
      const caught = t.mock.method(console, "info");
      const command = input("run", initial.revision);
      assert.equal((await racing.command(first.token, job.job, command)).captured, 0);
      assert.equal(hookCalls, 1);
      const after = await effects(job.job);
      const replay = await repo.command(first.token, job.job, command);
      assert.equal(replay.replayed, true);
      assert.equal(replay.captured, 0);
      assert.deepEqual(await effects(job.job), after);
      assert.equal((await run(job.job)).captured, 0);
      assert.ok(!(await repo.read(first.token, job.job)).log.some(row => row.message));
      assert.ok(!caught.mock.calls.some(call => call.arguments[0] === '{"event":"v2.delivery.captured","kind":"v2.chase"}'));
    });
  }
  await setting(f.job, true);
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
}

// Preserve the original command-line entry point with the same full-suite setup.
if (process.argv[1] === fileURLToPath(import.meta.url)) await import("./seed.integration.test.mjs");
