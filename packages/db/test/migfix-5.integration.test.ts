import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { createLockFixture, closeLockFixture, seedAccount, prepareLock, addFixtureCapture, asFixtureTenant, LOCK_OWNER, LOCK_HASH, type LockFixture } from "./final-account-lock.integration.test.js";

// MIGFIX-5 (0165): the lock refuses an account assembled before the latest approved variation, and partial
// credit notes conserve the ORIGINAL invoice net and VAT. The legacy-issuer guard and real PDF bytes are held
// (see docs/verdicts/MIGFIX-5/BUILDER_RECEIPT.md); nothing here asserts them.
type Account = Awaited<ReturnType<typeof seedAccount>>;
const REV2_HASH = "b".repeat(64);

async function appendCheck(f: LockFixture, a: Account, status: "pending" | "failed" | "completed") {
  const row = (await f.admin.query("SELECT id,locked_at::text cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0];
  await asFixtureTenant(f.shadow, a.tenantId, db => db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,$5::timestamptz,$6)", [a.tenantId, a.jobId, randomUUID(), row.id, row.cutoff, status]));
}
const invoiceInput = (a: Account, revisionId: string, hash: string, invoiceKind: "final" | "supplementary" = "final") =>
  ({ jobId: a.jobId, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), finalAccountRevisionId: revisionId, expectedSourceHash: hash, invoiceKind, recipient: "practice-customer@example.invalid", issuedOn: "2026-10-12" });
const lockSql = (f: LockFixture, a: Account, revisionId: string, expected: number) => (db: PoolClient) =>
  db.query("SELECT app.lock_final_account($1,$2,$3,$4,$5,$6,'final_account_declaration.v1')", [a.tenantId, a.jobId, LOCK_OWNER, randomUUID(), revisionId, expected]);
const lockInput = (a: Account, revisionId: string, expectedRevision: number) => ({ ...a.input, commandId: randomUUID(), finalAccountRevisionId: revisionId, expectedRevision });

/** Approve the priced capture exactly as the approval writer leaves it: an immutable approval row for the CURRENT revision and state approved. */
async function approveCapture(f: LockFixture, a: Account, variationId: string) {
  await asFixtureTenant(f.admin, a.tenantId, async db => {
    await approveOn(db, a, variationId);
  });
}
async function approveOn(db: PoolClient, a: Account, variationId: string) {
  await db.query("SELECT 1 FROM app.variation WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [a.tenantId, variationId]);
  await db.query(`INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at)
    SELECT gen_random_uuid(),r.tenant_id,r.job_id,r.variation_id,r.id,r.revision,r.content_hash,r.signed_delta_pence,'builder_attestation',$3,now()
    FROM app.variation_revision r JOIN app.variation v ON(v.tenant_id,v.id,v.current_revision_id)=(r.tenant_id,r.variation_id,r.id) WHERE v.tenant_id=$1 AND v.id=$2`, [a.tenantId, variationId, LOCK_OWNER]);
  await db.query("UPDATE app.variation SET state='approved' WHERE tenant_id=$1 AND id=$2", [a.tenantId, variationId]);
}
/** A second account revision: the baseline lines plus one variation line whose source IS the variation's current revision. */
async function reassemble(f: LockFixture, a: Account, variationId: string, extraNet: number, net: number, tax: number) {
  const info = (await f.admin.query("SELECT v.current_revision_id,v.scope_item_id FROM app.variation v WHERE v.tenant_id=$1 AND v.id=$2", [a.tenantId, variationId])).rows[0];
  const revision = randomUUID();
  await asFixtureTenant(f.admin, a.tenantId, async db => {
    await db.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings,created_at) SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,$5,$6,$7,false,findings,clock_timestamp() FROM app.final_account_revision WHERE tenant_id=$3 AND id=$4", [revision, REV2_HASH, a.tenantId, a.revisionId, net, tax, net + tax]);
    await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3", [revision, a.tenantId, a.revisionId]);
    await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) VALUES(gen_random_uuid(),$1,$2,$3,'variation',$4,$5,$4,gen_random_uuid(),'Synthetic approved extra',$6,2)", [a.tenantId, a.jobId, revision, info.current_revision_id, info.scope_item_id, extraNet]);
    await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND id=$3", [revision, a.tenantId, a.draftId]);
  });
  return revision;
}
const previewHash = (a: Account, invoice: { id: string; pdf: string }, net: number, credited: number) =>
  createHash("sha256").update(`${a.jobId}${invoice.id}${net}${credited}${invoice.pdf.trim()}`).digest("hex");

describe("MIGFIX-5 customer billing integrity", () => {
  let f: LockFixture;
  beforeAll(async () => { f = await createLockFixture(); }, 60000);
  afterAll(async () => closeLockFixture(f));

  /** Lock and complete the check for a fresh account, then issue its final invoice through the lock-bound writer. */
  async function invoiced(net: number) {
    const a = await seedAccount(f.admin, randomUUID(), net), repo = await prepareLock(f, a);
    await repo.lock(a.context, a.input); await appendCheck(f, a, "completed");
    const result = await repo.issueInvoice(a.context, invoiceInput(a, a.revisionId, LOCK_HASH));
    const row = (await f.admin.query("SELECT id,net_pence,tax_pence,total_pence,pdf_sha256 FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2", [a.tenantId, result.invoiceId])).rows[0];
    return { a, repo, invoice: { id: row.id as string, pdf: row.pdf_sha256 as string, net: Number(row.net_pence), tax: Number(row.tax_pence), total: Number(row.total_pence) } };
  }
  const credit = (f2: LockFixture, a: Account, invoice: { id: string; pdf: string }, net: number, credited: number) => asFixtureTenant(f2.runtime, a.tenantId, db =>
    db.query("SELECT * FROM app.issue_practice_customer_credit_note($1,$2,$3,$4,$5,$6,'Synthetic correction',$7)", [a.tenantId, a.jobId, invoice.id, LOCK_OWNER, randomUUID(), net, previewHash(a, invoice, net, credited)]));
  async function creditTotals(a: Account, invoiceId: string) {
    const r = (await f.admin.query("SELECT coalesce(-sum(net_pence),0) net,coalesce(-sum(tax_pence),0) tax,coalesce(sum(amount_pence),0) gross,count(*) n FROM app.customer_credit_note WHERE tenant_id=$1 AND invoice_id=$2", [a.tenantId, invoiceId])).rows[0];
    return { net: Number(r.net), tax: Number(r.tax), gross: Number(r.gross), count: Number(r.n) };
  }

  it("lock rejects an account assembled before the latest variation approval, through repository and SQL, with no lock effects", async () => {
    const a = await seedAccount(f.admin), repo = await prepareLock(f, a);
    const variation = await addFixtureCapture(f, a, 80000);
    await approveCapture(f, a, variation);
    const before = async () => ({
      locks: (await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1", [a.tenantId])).rows[0].n,
      receipts: (await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_type='LockFinalAccount'", [a.tenantId])).rows[0].n,
      audit: (await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='final_account.locked'", [a.tenantId])).rows[0].n,
    });
    expect(await before()).toEqual({ locks: 0, receipts: 0, audit: 0 });
    await expect(repo.lock(a.context, lockInput(a, a.revisionId, 1))).rejects.toMatchObject({ code: "STALE_REVISION" });
    await expect(asFixtureTenant(f.runtime, a.tenantId, lockSql(f, a, a.revisionId, 1))).rejects.toThrow("STALE_OR_BLOCKED_FINAL_ACCOUNT");
    expect(await before()).toEqual({ locks: 0, receipts: 0, audit: 0 });

    // Reassemble with the approved extra: the lock now succeeds and the invoice is 3,440,000 / 688,000 / 4,128,000.
    const revision2 = await reassemble(f, a, variation, 80000, 3440000, 688000);
    await repo.lock(a.context, lockInput(a, revision2, 2)); await appendCheck(f, a, "completed");
    await repo.issueInvoice(a.context, invoiceInput(a, revision2, REV2_HASH));
    const row = (await f.admin.query("SELECT net_pence,tax_pence,total_pence FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows;
    expect(row.map(r => [Number(r.net_pence), Number(r.tax_pence), Number(r.total_pence)])).toEqual([[3440000, 688000, 4128000]]);
  }, 60000);

  it("approval and lock racing in both directions never lose an approved source from the locked line set", async () => {
    const blocked = async () => { for (let i = 0; i < 100; i++) { if ((await f.admin.query("SELECT count(*)::int n FROM pg_locks WHERE NOT granted")).rows[0].n > 0) return; await new Promise(r => setTimeout(r, 50)); } throw new Error("expected one session to be waiting on the other"); };
    // Approval first (uncommitted) then lock: the lock waits, then sees the approval and refuses the old account.
    const a = await seedAccount(f.admin); await prepareLock(f, a);
    const v1 = await addFixtureCapture(f, a, 80000);
    const approval = await f.admin.connect();
    try {
      await approval.query("BEGIN"); await approval.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]); await approveOn(approval, a, v1);
      const racing = asFixtureTenant(f.runtime, a.tenantId, lockSql(f, a, a.revisionId, 1)); const settled = racing.then(() => "locked", (e: Error) => e.message);
      await blocked(); await approval.query("COMMIT");
      expect(await settled).toContain("STALE_OR_BLOCKED_FINAL_ACCOUNT");
    } finally { await approval.query("ROLLBACK").catch(() => undefined); approval.release(); }
    expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(0);

    // Lock first (uncommitted) then approval: the approval waits, so it is a post-lock source, and the locked set is exactly the account's own lines.
    const b = await seedAccount(f.admin); await prepareLock(f, b);
    const v2 = await addFixtureCapture(f, b, 80000);
    const locking = await f.runtime.connect(); let approvalDone = false;
    try {
      await locking.query("BEGIN"); await locking.query("SELECT set_config('app.tenant_id',$1,true)", [b.tenantId]); await lockSql(f, b, b.revisionId, 1)(locking);
      const late = asFixtureTenant(f.admin, b.tenantId, db => approveOn(db, b, v2)).then(() => { approvalDone = true; });
      await blocked(); expect(approvalDone).toBe(false); await locking.query("COMMIT"); await late;
    } finally { await locking.query("ROLLBACK").catch(() => undefined); locking.release(); }
    const lock = (await f.admin.query("SELECT snapshot FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [b.tenantId, b.jobId])).rows[0];
    expect(lock.snapshot.lines.map((l: { id: string }) => l.id)).toEqual([b.lineId]);
    expect((await f.admin.query("SELECT state FROM app.variation WHERE tenant_id=$1 AND id=$2", [b.tenantId, v2])).rows[0].state).toBe("approved");
  }, 90000);

  it("conserves invoice net and VAT across partial credits (10,003 / 2,001 / 12,004)", async () => {
    const { a, invoice } = await invoiced(10003);
    expect([invoice.net, invoice.tax, invoice.total]).toEqual([10003, 2001, 12004]);
    const practice = new PracticeInvoiceRepository(f.runtime);
    for (const net of [10000, 3]) {
      const preview = await practice.previewCredit(a.context, { jobId: a.jobId, invoiceId: invoice.id, netPence: net, reason: "Synthetic correction" });
      await practice.issueCredit(a.context, { jobId: a.jobId, invoiceId: invoice.id, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), netPence: net, reason: "Synthetic correction", previewHash: preview.previewHash });
    }
    expect(await creditTotals(a, invoice.id)).toEqual({ net: 10003, tax: 2001, gross: 12004, count: 2 });

    // 10,000 -> 2 -> 2: the second 2p fits the remaining gross but not the remaining net, so it must refuse in SQL too.
    const second = await invoiced(10003);
    await credit(f, second.a, second.invoice, 10000, 0); await credit(f, second.a, second.invoice, 2, 12000);
    await expect(credit(f, second.a, second.invoice, 2, 12002)).rejects.toThrow("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
    expect(await creditTotals(second.a, second.invoice.id)).toMatchObject({ net: 10002, count: 2 });
  }, 90000);

  it("split credits cannot exceed original net principal (20,003 / 4,001 / 24,004)", async () => {
    const { a, invoice } = await invoiced(20003);
    expect([invoice.net, invoice.tax, invoice.total]).toEqual([20003, 4001, 24004]);
    const practice = new PracticeInvoiceRepository(f.runtime);
    const issued: number[] = [];
    for (const net of [10001, 10002]) {
      const preview = await practice.previewCredit(a.context, { jobId: a.jobId, invoiceId: invoice.id, netPence: net, reason: "Synthetic correction" });
      const done = await practice.issueCredit(a.context, { jobId: a.jobId, invoiceId: invoice.id, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), netPence: net, reason: "Synthetic correction", previewHash: preview.previewHash });
      expect(done.totalPence, "preview and issued credit agree").toBe(-(net + -preview.taxPence)); issued.push(done.totalPence);
    }
    // Cumulative whole-invoice VAT (Ben decisions 7, 8a): the credit reaching full net takes exactly the original VAT; the stray penny is the customer's.
    expect(issued).toEqual([-12001, -12003]);
    expect(await creditTotals(a, invoice.id)).toEqual({ net: 20003, tax: 4001, gross: 24004, count: 2 });
    await expect(credit(f, a, invoice, 1, 24004)).rejects.toThrow("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
    expect(await creditTotals(a, invoice.id)).toMatchObject({ net: 20003, count: 2 });
  }, 90000);

  it("credit VAT can never pass the VAT left on the original invoice (12 / 2 / 14 split in thirds)", async () => {
    const { a, invoice } = await invoiced(12);
    expect([invoice.net, invoice.tax, invoice.total]).toEqual([12, 2, 14]);
    await credit(f, a, invoice, 4, 0); await credit(f, a, invoice, 4, 5); await credit(f, a, invoice, 4, 10);
    expect(await creditTotals(a, invoice.id)).toEqual({ net: 12, tax: 2, gross: 14, count: 3 });
    await expect(credit(f, a, invoice, 1, 14)).rejects.toThrow("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
  }, 90000);

  it("regression: a revised account cannot rebill invoiced scope; the supplementary path bills only the added line (132,000p aggregate)", async () => {
    // The extra is captured (priced) before the lock, as post-lock capture is closed; it is approved after the first invoice.
    const a = await seedAccount(f.admin, randomUUID(), 100000), repo = await prepareLock(f, a);
    const variation = await addFixtureCapture(f, a, 10000);
    await repo.lock(a.context, a.input); await appendCheck(f, a, "completed");
    await repo.issueInvoice(a.context, invoiceInput(a, a.revisionId, LOCK_HASH));
    expect((await f.admin.query("SELECT total_pence FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows.map(r => Number(r.total_pence))).toEqual([120000]);
    await approveCapture(f, a, variation);
    const revision2 = await reassemble(f, a, variation, 10000, 110000, 22000);
    await expect(repo.issueInvoice(a.context, invoiceInput(a, revision2, REV2_HASH, "final"))).rejects.toMatchObject({ code: expect.stringMatching(/FINAL_INVOICE_(REVISION_MISMATCH|ALREADY_ISSUED)/) });
    await repo.issueInvoice(a.context, invoiceInput(a, revision2, REV2_HASH, "supplementary"));
    const all = (await f.admin.query("SELECT net_pence,total_pence FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id", [a.tenantId, a.jobId])).rows;
    expect(all.map(r => Number(r.total_pence))).toEqual([120000, 12000]);
    expect(all.reduce((s, r) => s + Number(r.total_pence), 0)).toBe(132000);
  }, 60000);
});
