import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EnterpriseFeeRepository, withTenant } from "../src/index.js";
import { cluster, code, world, type World } from "./contractor-billing-fixtures.js";

// CI ONLY. ENT-7c: posting into platform_enterprise_fee from an approved statement (migration 0298).
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });

async function agreement(w: World) {
  const id = randomUUID();
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'fictional-agreement',1,10,'on_payment','enterprise_site_capture_policy_v1','2000-01-01T00:00:00Z',false,$3,'synthetic_demo','operations:fictional')`, [w.w.p.tenantId, id, "c".repeat(64)]);
  return id;
}
const thisMonth = async () => (await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p as string;
const nextMonth = (p: string) => { const [y, m] = p.split("-").map(Number) as [number, number]; return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const later = (minutes = 30) => new Date(Date.now() + minutes * 60_000).toISOString();

async function setUp() {
  const w = await world(c), repo = new EnterpriseFeeRepository(c.runtime), id = await agreement(w), p = await thisMonth();
  const invoice = { ...await w.invoice(), sourceEventId: `inv-${randomUUID()}` };
  const paid = w.event("paid", { sourceEventId: `pay-${randomUUID()}`, effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: `r-${randomUUID()}`, amount: { netPence: 41667, vatPence: 8333, grossPence: 50000 } });
  await w.repo.import(w.ctx, w.session, w.s.jobId, w.importInput([invoice, paid]));
  // Derive, prepare and approve one month's statement; returns what posting needs.
  const approvedStatement = async (period: string) => {
    await repo.derive(w.ctx, w.session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: id, period });
    const { statementId } = await repo.prepareStatement(w.ctx, w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period });
    const s = await repo.readStatement(w.ctx, w.session, statementId);
    const { authorizationId } = await repo.approveStatement(w.ctx, w.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId,
      contentHash: s.contentHash, totalDeltaPence: s.totalDeltaPence, expiresAt: later() });
    return { statementId, authorizationId, statement: s };
  };
  const post = (statementId: string, authorizationId: string, commandId = randomUUID(), session = w.session) =>
    repo.postStatement(w.ctx, session, { version: "enterprise-fee-post-statement.v1", commandId, statementId, authorizationId });
  return { w, repo, id, p, invoice, paid, approvedStatement, post };
}

it("posts an approved statement once: one balanced accrual of the exact delta; replays and races add nothing", async () => {
  const t = await setUp(), { statementId, authorizationId } = await t.approvedStatement(t.p);
  const results = await Promise.all([t.post(statementId, authorizationId), t.post(statementId, authorizationId)]);
  expect(results.filter(r => !r.replayed)).toHaveLength(1);
  expect(await t.post(statementId, authorizationId)).toMatchObject({ replayed: true });
  const postings = await t.repo.readPostings(t.w.ctx, t.w.session, statementId);
  expect(postings).toEqual([expect.objectContaining({ kind: "accrual", agreementVersionId: t.id, amountPence: 806, compensatesFeeId: null, environment: "synthetic_demo",
    lines: [{ account: "contractor_fee_receivable", debitPence: 806, creditPence: 0 }, { account: "platform_fee_revenue", debitPence: 0, creditPence: 806 }] })]);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.platform_enterprise_fee WHERE tenant_id=$1", [t.w.w.p.tenantId])).rows[0].n).toBe(1);
});

it("an unchanged next month subtracts prior posted net: zero delta and no new journal", async () => {
  const t = await setUp(), first = await t.approvedStatement(t.p);
  await t.post(first.statementId, first.authorizationId);
  const second = await t.approvedStatement(nextMonth(t.p));
  expect(second.statement).toMatchObject({ totalDeltaPence: 0 });
  expect(second.statement.sections).toEqual([expect.objectContaining({ cumulativeFeePence: 806, priorNetPostedPence: 806, deltaPence: 0 })]);
  // ENT-11b self-attack: replay both months, with fresh command IDs and racing next-month requests.
  expect(await t.post(first.statementId, first.authorizationId)).toMatchObject({ replayed: true });
  const nextMonthPosts = await Promise.all([t.post(second.statementId, second.authorizationId), t.post(second.statementId, second.authorizationId)]);
  expect(nextMonthPosts).toEqual([expect.objectContaining({ journals: 0 }), expect.objectContaining({ journals: 0 })]);
  expect(await t.repo.readPostings(t.w.ctx, t.w.session, second.statementId)).toEqual([]);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.platform_enterprise_fee WHERE tenant_id=$1", [t.w.w.p.tenantId])).rows[0].n).toBe(1);
});

it("posting is refused without approval, with another authorisation, revoked or expired authority, or non-finance", async () => {
  const t = await setUp();
  await t.repo.derive(t.w.ctx, t.w.session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: t.id, period: t.p });
  const { statementId } = await t.repo.prepareStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period: t.p });
  expect(await code(t.post(statementId, randomUUID()))).toBe("STATEMENT_AUTHORITY_INVALID"); // not approved
  const s = await t.repo.readStatement(t.w.ctx, t.w.session, statementId);
  const { authorizationId } = await t.repo.approveStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId,
    contentHash: s.contentHash, totalDeltaPence: s.totalDeltaPence, expiresAt: new Date(Date.now() + 1500).toISOString() });
  expect(await code(t.post(statementId, randomUUID()))).toBe("STATEMENT_AUTHORITY_INVALID"); // a different authorisation
  expect(await code(t.post(statementId, authorizationId, randomUUID(), randomUUID()))).toBe("EXTRA_FORBIDDEN");
  await new Promise(resolve => setTimeout(resolve, 2000));
  expect(await code(t.post(statementId, authorizationId))).toBe("STATEMENT_AUTHORITY_INVALID"); // expired
  const other = await setUp(), approved = await other.approvedStatement(other.p);
  await c.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE id=$1", [approved.authorizationId]);
  expect(await code(other.post(approved.statementId, approved.authorizationId))).toBe("STATEMENT_AUTHORITY_INVALID"); // revoked
  expect((await c.admin.query("SELECT count(*)::int n FROM app.platform_enterprise_fee WHERE tenant_id IN($1,$2)", [t.w.w.p.tenantId, other.w.w.p.tenantId])).rows[0].n).toBe(0);
});

it("posting is refused when the facts move after approval", async () => {
  const t = await setUp(), { statementId, authorizationId } = await t.approvedStatement(t.p);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("paid", { effectiveAt: "2026-10-04T12:00:00Z", reconciliationId: `r-${randomUUID()}`, amount: { netPence: 16667, vatPence: 3333, grossPence: 20000 } })]));
  expect(await code(t.post(statementId, authorizationId))).toBe("STALE_FACTS");
});

it("a reversal after posting becomes a linked compensation on the next month's statement, netting the fee back to zero", async () => {
  const t = await setUp(), first = await t.approvedStatement(t.p);
  await t.post(first.statementId, first.authorizationId);
  const [accrual] = await t.repo.readPostings(t.w.ctx, t.w.session, first.statementId);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("payment_reversed", { composition: t.invoice.composition, reconciliationId: `rev-${randomUUID()}`,
    originalEventId: t.paid.sourceEventId, effectiveAt: "2026-10-05T12:00:00Z", amount: t.paid.amount })]));
  const second = await t.approvedStatement(nextMonth(t.p));
  expect(second.statement).toMatchObject({ totalDeltaPence: -806 });
  expect(second.statement.sections).toEqual([expect.objectContaining({ cumulativeFeePence: 0, priorNetPostedPence: 806, deltaPence: -806 })]);
  await t.post(second.statementId, second.authorizationId);
  expect(await t.repo.readPostings(t.w.ctx, t.w.session, second.statementId)).toEqual([expect.objectContaining({ kind: "compensation", amountPence: 806, compensatesFeeId: accrual!.id,
    lines: [{ account: "platform_fee_revenue", debitPence: 806, creditPence: 0 }, { account: "contractor_fee_receivable", debitPence: 0, creditPence: 806 }] })]);
  const net = (await c.admin.query("SELECT sum(CASE kind WHEN 'accrual' THEN amount_pence ELSE -amount_pence END)::int n FROM app.platform_enterprise_fee WHERE tenant_id=$1", [t.w.w.p.tenantId])).rows[0].n;
  expect(net).toBe(0);
});

it("direct runtime SQL can neither write the fee book nor call its private helper, and journals are immutable", async () => {
  const t = await setUp(), { statementId, authorizationId } = await t.approvedStatement(t.p);
  await t.post(statementId, authorizationId);
  const [fee] = await t.repo.readPostings(t.w.ctx, t.w.session, statementId);
  for (const sql of [
    "SELECT * FROM app.platform_enterprise_fee",
    `INSERT INTO app.platform_enterprise_fee_line(tenant_id,fee_id,line_no,account,debit_pence,credit_pence) VALUES('${t.w.w.p.tenantId}','${fee!.id}',1,'platform_fee_revenue',1,0)`,
    `UPDATE app.platform_enterprise_fee SET amount_pence=1 WHERE id='${fee!.id}'`,
    `SELECT app.ef_posted_net('${t.w.w.p.tenantId}','${t.id}')`,
  ]) await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
  await expect(c.admin.query("DELETE FROM app.platform_enterprise_fee_line WHERE fee_id=$1", [fee!.id])).rejects.toMatchObject({ message: "ENTERPRISE_FEE_IMMUTABLE" });
});

it("ENT-11b self-attack: a credit after approval blocks posting without changing the approved statement", async () => {
  const t = await setUp(), approved = await t.approvedStatement(t.p);
  const before = await t.repo.readStatement(t.w.ctx, t.w.session, approved.statementId);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("credited", {
    originalEventId: t.invoice.sourceEventId, effectiveAt: "2026-10-05T12:00:00Z", amount: { netPence: 24000, vatPence: 4800, grossPence: 28800 },
    lineAdjustments: [{ externalInvoiceLineId: "extra", netPence: 24000, vatPence: 4800, grossPence: 28800 }],
  })]));
  expect(await code(t.post(approved.statementId, approved.authorizationId))).toBe("STALE_FACTS");
  expect(await t.repo.readStatement(t.w.ctx, t.w.session, approved.statementId)).toEqual(before);
  expect(await t.repo.readPostings(t.w.ctx, t.w.session, approved.statementId)).toEqual([]);
});

it("ENT-11b self-attack: another company cannot read a statement, derivation or journals, or post its approval", async () => {
  const t = await setUp(), approved = await t.approvedStatement(t.p), other = await setUp();
  const derivation = approved.statement.sections[0]!.derivationId;
  for (const attempt of [
    () => t.repo.readStatement(other.w.ctx, other.w.session, approved.statementId),
    () => t.repo.read(other.w.ctx, other.w.session, derivation),
    () => t.repo.readPostings(other.w.ctx, other.w.session, approved.statementId),
    () => t.repo.postStatement(other.w.ctx, other.w.session, { version: "enterprise-fee-post-statement.v1", commandId: randomUUID(), statementId: approved.statementId, authorizationId: approved.authorizationId }),
  ]) expect(await code(attempt())).toBe("FEE_NOT_FOUND");
  expect(await t.repo.readPostings(t.w.ctx, t.w.session, approved.statementId)).toEqual([]);
});
