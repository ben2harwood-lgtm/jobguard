import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { exactPence, serializeExactPence, sumExactPence } from "@jobguard/core";
import { ContractorPracticeSessionRepository, EnterpriseFeeRepository, ExtraApprovalRepository, migrate, withTenant } from "../src/index.js";
import { cluster, code, world, type World } from "./contractor-billing-fixtures.js";
import { applyMigration, digestOf, startBeforeMigration } from "./contractor-practice-session-fixtures.js";
import { approveInput, raiseOn, submitted } from "./extra-approval-chain-fixtures.js";
import { testActorContext } from "./tenant-context-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";

// Real PostgreSQL only. The coding sandbox authors this suite; CI executes it.
const migration = "0746_enterprise_fee_rejected_line.sql";
const exclusion = "  AND invoice_line->'rejected'='false'::jsonb\n";
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await startBeforeMigration(migration); }, 240000);
afterAll(async () => { await c?.close(); });
const repo = () => new EnterpriseFeeRepository(c.runtime);
const zero = { qualifyingPrincipal: { numerator: "0", denominator: "1" }, cumulativeFeePence: 0, contributions: [] };
const assertZeroPrincipal = (principal: { numerator: string; denominator: string }) => expect(principal).toEqual(zero.qualifyingPrincipal);
const control = { qualifyingPrincipal: { numerator: "250000", denominator: "31" }, cumulativeFeePence: 806 };
const next = (p: string) => { const [y, m] = p.split("-").map(Number) as [number, number]; return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
async function setup() {
  const w = await world(c), id = randomUUID();
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'fictional-rejection',1,10,'on_payment','enterprise_site_capture_policy_v1','2000-01-01T00:00:00Z',false,$3,'synthetic_demo','operations:fictional')`, [w.w.p.tenantId, id, "c".repeat(64)]);
  const p = (await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p as string;
  return { w, id, p };
}
type Setup = Awaited<ReturnType<typeof setup>>;
const derive = (t: Setup, period = t.p, commandId = randomUUID()) => repo().derive(t.w.ctx, t.w.session,
  { version: "enterprise-fee-derive.v1", commandId, agreementVersionId: t.id, period });
async function read(t: Setup, period = t.p) {
  return repo().read(t.w.ctx, t.w.session, (await derive(t, period)).derivationId);
}
const payment = (w: World) => w.event("paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: randomUUID(), amount: { netPence: 41667, vatPence: 8333, grossPence: 50000 } });
function rejection(w: World, invoice: ReturnType<World["event"]>, line = "extra", effectiveAt = "2026-10-04T12:00:00Z") {
  const amount = line === "order" ? { netPence: 100000, vatPence: 20000, grossPence: 120000 } : { netPence: 24000, vatPence: 4800, grossPence: 28800 };
  return w.event("rejected", { originalEventId: invoice.sourceEventId, effectiveAt, amount,
    lineAdjustments: [{ externalInvoiceLineId: line, ...amount }] });
}
async function importEvents(t: Setup, events: unknown[]) {
  return t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput(events));
}
async function assertRejectedPaid(t: Setup, line = "extra") {
  const stored = (await c.admin.query(`SELECT l,al.matched_extra_numerator::text n FROM app.billing_allocation_run r
    CROSS JOIN LATERAL jsonb_array_elements(r.projection->'lines') l
    JOIN app.contractor_receipt_line_allocation al ON al.run_id=r.id AND al.tenant_id=r.tenant_id AND al.external_invoice_line_id=l->>'lineId'
    WHERE r.tenant_id=$1 AND r.job_id=$2 AND l->>'lineId'=$3
      AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run nx WHERE nx.tenant_id=r.tenant_id AND nx.predecessor_id=r.id)`,
    [t.w.w.p.tenantId, t.w.s.jobId, line])).rows;
  expect(stored.length).toBeGreaterThan(0);
  expect(stored.every(row => row.l.rejected === true)).toBe(true);
  expect(stored.some(row => BigInt(row.n) > 0n)).toBe(true);
  expect(stored[0]!.l.billedNet).toEqual({ numerator: "24000", denominator: "1" });
}
async function approve(t: Setup, period = t.p) {
  await derive(t, period);
  const { statementId } = await repo().prepareStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period });
  const statement = await repo().readStatement(t.w.ctx, t.w.session, statementId);
  const { authorizationId } = await repo().approveStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId,
    contentHash: statement.contentHash, totalDeltaPence: statement.totalDeltaPence, expiresAt: new Date(Date.now() + 600000).toISOString() });
  return { statementId, authorizationId, statement };
}
const post = (t: Setup, a: Awaited<ReturnType<typeof approve>>) => repo().postStatement(t.w.ctx, t.w.session,
  { version: "enterprise-fee-post-statement.v1", commandId: randomUUID(), statementId: a.statementId, authorizationId: a.authorizationId });

it("R151-UPGRADE: reproduces the paid rejection defect before upgrade, preserves populated facts and function security, then derives zero", async () => {
  const t = await setup(), invoice = await t.w.invoice();
  await importEvents(t, [invoice, payment(t.w)]);
  const old = await approve(t); await post(t, old);
  await importEvents(t, [rejection(t.w, invoice)]);
  await assertRejectedPaid(t);
  // Failing-first witness on the actual predecessor, through real commands, without editing histories.
  const erroneous = await read(t);
  expect(erroneous).toMatchObject(control);
  const tables = ["app.billing_fact", "app.billing_allocation_run", "app.contractor_receipt_line_allocation", "app.extra_origin", "app.billing_export_line",
    "app.enterprise_fee_derivation", "app.enterprise_fee_contribution", "app.enterprise_fee_statement", "app.enterprise_fee_statement_approval",
    "app.platform_enterprise_fee", "app.platform_enterprise_fee_line", "app.command_receipt", "app.audit_event"];
  const before = await proofBefore(c.admin, tables);
  for (const table of tables) expect(Object.keys(before[table]!.rows).length, table).toBeGreaterThan(0);
  const security = async () => (await c.admin.query("SELECT proowner,proacl,prosecdef,proconfig,provolatile FROM pg_proc WHERE oid='app.ef_inputs(uuid,app.enterprise_agreement_version,text)'::regprocedure")).rows;
  const metadata = await security();
  await applyMigration(c, migration);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  expect(await security()).toEqual(metadata);
  await migrate(c.admin); await migrate(c.admin);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  const corrected = await read(t);
  assertZeroPrincipal(corrected.qualifyingPrincipal);
  expect(corrected).toMatchObject(zero);
  expect(corrected.inputHash).not.toBe(erroneous.inputHash);
  const compensation = await approve(t, next(t.p));
  expect(compensation.statement.totalDeltaPence).toBe(-806);
  await post(t, compensation);
  const original = await repo().readPostings(t.w.ctx, t.w.session, old.statementId);
  expect(await repo().readPostings(t.w.ctx, t.w.session, compensation.statementId)).toEqual([
    expect.objectContaining({ kind: "compensation", amountPence: 806, compensatesFeeId: original[0]!.id })]);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
}, 300000);

for (const beforePayment of [true, false]) it(`R151-ZERO: rejection ${beforePayment ? "before" : "after"} payment retains allocated cash but charges zero`, async () => {
  const t = await setup(), invoice = await t.w.invoice(), paid = payment(t.w);
  await importEvents(t, [invoice]);
  if (beforePayment) await importEvents(t, [rejection(t.w, invoice, "extra", "2026-10-02T18:00:00Z")]);
  await importEvents(t, [paid]);
  if (!beforePayment) await importEvents(t, [rejection(t.w, invoice)]);
  await assertRejectedPaid(t);
  expect(await read(t)).toMatchObject(zero);
  const approved = await approve(t);
  expect(approved.statement.totalDeltaPence).toBe(0);
  expect(await post(t, approved)).toMatchObject({ journals: 0 });
  expect(await repo().readPostings(t.w.ctx, t.w.session, approved.statementId)).toEqual([]);
});

it("R151-CONTROL: identical unrejected ENT-F2 retains exact principal and fee; another rejected invoice line does not erase it", async () => {
  const t = await setup(), invoice = await t.w.invoice();
  await importEvents(t, [invoice, payment(t.w)]);
  expect(await read(t)).toMatchObject(control);
  await importEvents(t, [rejection(t.w, invoice, "order")]);
  const valid = await read(t);
  expect(valid).toMatchObject(control);
  expect(valid.contributions).toEqual([expect.objectContaining({ extraId: t.w.s.extraId })]);
});

it("R151-REPLAY: rejection changes input hash, exact command/event replay adds no duplicate history", async () => {
  const t = await setup(), invoice = await t.w.invoice();
  await importEvents(t, [invoice, payment(t.w)]);
  const original = await read(t), input = t.w.importInput([rejection(t.w, invoice)]);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, input);
  const command = randomUUID(), first = await derive(t, t.p, command);
  const before = await proofBefore(c.admin, ["app.billing_fact", "app.billing_allocation_run", "app.enterprise_fee_derivation", "app.enterprise_fee_contribution"]);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, input);
  expect(await derive(t, t.p, command)).toEqual({ derivationId: first.derivationId, replayed: true });
  const corrected = await repo().read(t.w.ctx, t.w.session, first.derivationId);
  assertZeroPrincipal(corrected.qualifyingPrincipal);
  expect(corrected).toMatchObject(zero);
  expect(corrected.inputHash).not.toBe(original.inputHash);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.billing_fact WHERE tenant_id=$1 AND source_event_id=$2", [t.w.w.p.tenantId, (input.events[0] as ReturnType<World["event"]>).sourceEventId])).rows[0].n).toBe(1);
});

it("R151-COMPENSATE: rejection after approval refuses stale posting; after posting uses linked later-period compensation", async () => {
  for (const alreadyPosted of [false, true]) {
    const t = await setup(), invoice = await t.w.invoice();
    await importEvents(t, [invoice, payment(t.w)]);
    const approved = await approve(t);
    if (alreadyPosted) await post(t, approved);
    const before = await proofBefore(c.admin, ["app.platform_enterprise_fee", "app.platform_enterprise_fee_line", "app.enterprise_fee_statement", "app.enterprise_fee_statement_approval"]);
    await importEvents(t, [rejection(t.w, invoice)]);
    if (!alreadyPosted) expect(await code(post(t, approved))).toBe("STALE_FACTS");
    const later = await approve(t, next(t.p));
    expect(later.statement.totalDeltaPence).toBe(alreadyPosted ? -806 : 0);
    await post(t, later);
    const journals = await repo().readPostings(t.w.ctx, t.w.session, later.statementId);
    if (alreadyPosted) {
      const [original] = await repo().readPostings(t.w.ctx, t.w.session, approved.statementId);
      expect(journals).toEqual([expect.objectContaining({ kind: "compensation", amountPence: 806, compensatesFeeId: original!.id })]);
    } else expect(journals).toEqual([]);
    expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  }
});

it("R151-ADJUST: credits and reversals cannot revive rejected principal", async () => {
  for (const factType of ["credited", "payment_reversed"]) {
    const t = await setup(), invoice = await t.w.invoice(), paid = payment(t.w);
    await importEvents(t, [invoice, paid, rejection(t.w, invoice)]);
    await importEvents(t, [t.w.event(factType, { effectiveAt: "2026-10-05T12:00:00Z",
      originalEventId: factType === "credited" ? invoice.sourceEventId : paid.sourceEventId,
      reconciliationId: factType === "credited" ? null : randomUUID(),
      amount: factType === "credited" ? { netPence: 12000, vatPence: 2400, grossPence: 14400 } : { netPence: 8333, vatPence: 1667, grossPence: 10000 },
      lineAdjustments: factType === "credited" ? [{ externalInvoiceLineId: "extra", netPence: 12000, vatPence: 2400, grossPence: 14400 }] : [],
    })]);
    await assertRejectedPaid(t);
    expect(await read(t)).toMatchObject(zero);
  }
});

it("R151-MIXED: only the rejected extra is excluded from a mixed invoice", async () => {
  const t = await setup(), w = t.w, extraId = await raiseOn(c, w.w, w.s.jobId);
  const approvals = new ExtraApprovalRepository(c.runtime), actor = w.w.members;
  await approvals.priceExtra(await testActorContext(c.admin, w.ctx, actor.surveyor.member), actor.surveyor.member,
    { version: "price-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId, netPence: 24000 });
  const request = await approvals.submitExtra(await testActorContext(c.admin, w.ctx, actor.supervisor.member), actor.supervisor.member,
    { version: "submit-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId });
  await approvals.approveExtraStep(await testActorContext(c.admin, w.ctx, actor.supervisor.member), actor.supervisor.member,
    approveInput({ jobId: w.s.jobId, requestId: request.requestId as string, hash: request.revisionHash as string, net: 24000 }, 0));
  const batch = await w.exported(), view = await w.repo.read(w.ctx, w.session, w.s.jobId);
  const lines = view.exports.find(e => e.id === batch.batchId)!.artifact.lines.map(l => ({ externalInvoiceLineId: l.extraId, kind: "extra", existedAt: "2026-10-01T00:00:00Z",
    netPence: 24000, vatPence: 4800, grossPence: 28800,
    match: { exportLineId: l.exportLineId, jobId: l.jobId, extraId: l.extraId, scopeItemId: l.scopeItemId, revisionId: l.revisionId, revisionHash: l.revisionHash } }));
  expect(lines).toHaveLength(2);
  const amount = { netPence: 48000, vatPence: 9600, grossPence: 57600 };
  const invoice = w.event("invoiced", { amount, composition: { declared: amount, lines } });
  await importEvents(t, [invoice, w.event("paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: randomUUID(), amount }), rejection(w, invoice, w.s.extraId)]);
  await assertRejectedPaid(t, w.s.extraId);
  const result = await read(t);
  expect(result).toMatchObject({ qualifyingPrincipal: { numerator: "24000", denominator: "1" }, cumulativeFeePence: 2400 });
  expect(result.contributions).toEqual([expect.objectContaining({ extraId })]);
});

it("R151-ISOLATION: another job's rejection leaves this job eligible; tenant and finance/session guards remain closed", async () => {
  const t = await setup(), invoice = await t.w.invoice();
  await importEvents(t, [invoice, payment(t.w)]);
  const otherJob = await submitted(c, t.w.w, 24000);
  await new ExtraApprovalRepository(c.runtime).approveExtraStep(await testActorContext(c.admin, t.w.ctx, t.w.w.members.supervisor.member), t.w.w.members.supervisor.member, approveInput(otherJob, 0));
  const other = { ...t, w: { ...t.w, s: { ...t.w.s, ...otherJob } } };
  // Use the actual other job's exported identity in an independent invoice.
  const batch = await t.w.repo.finalise(t.w.ctx, t.w.session, otherJob.jobId, t.w.exportInput());
  const view = await t.w.repo.read(t.w.ctx, t.w.session, otherJob.jobId);
  const l = view.exports.find(e => e.id === batch.batchId)!.artifact.lines[0]!;
  const amount = { netPence: 24000, vatPence: 4800, grossPence: 28800 };
  const inv = t.w.event("invoiced", { invoiceNumber: `INV-${otherJob.extraId}`, amount, composition: { declared: amount, lines: [{ externalInvoiceLineId: "extra", kind: "extra", existedAt: "2026-10-01T00:00:00Z", ...amount,
    match: { exportLineId: l.exportLineId, jobId: l.jobId, extraId: l.extraId, scopeItemId: l.scopeItemId, revisionId: l.revisionId, revisionHash: l.revisionHash } }] } });
  await importEvents(other, [inv, t.w.event("paid", { invoiceNumber: inv.invoiceNumber, effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: randomUUID(), amount }),
    { ...rejection(t.w, inv), invoiceNumber: inv.invoiceNumber }]);
  expect(await read(t)).toMatchObject(control);
  const own = await derive(t), stranger = await setup();
  expect(await code(repo().read(stranger.w.ctx, stranger.w.session, own.derivationId))).toBe("FEE_NOT_FOUND");
  expect(await code(repo().derive(stranger.w.ctx, stranger.w.session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: t.id, period: t.p }))).toBe("FEE_NOT_FOUND");
  for (const role of ["operative", "finance"] as const) {
    const session = randomUUID(), member = t.w.w.members[role].member;
    await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
      SELECT $1,$2,$3,$4,$5,r.t,r.t+interval '7 days' FROM (SELECT clock_timestamp() t) r`, [session, t.w.w.p.tenantId, member.membershipId, member.identityUserId, digestOf(session)]);
    if (role === "finance") await new ContractorPracticeSessionRepository(c.runtime).revoke(await testActorContext(c.admin, t.w.ctx, member), session);
    expect(await code(repo().derive(t.w.ctx, session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: t.id, period: t.p }))).toBe("EXTRA_FORBIDDEN");
  }
  await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query("SELECT app.ef_inputs($1,a,$2) FROM app.enterprise_agreement_version a WHERE id=$3", [t.w.w.p.tenantId, t.p, t.id]))).rejects.toMatchObject({ code: "42501" });
  const approved = await approve(t);
  expect(await code(repo().productionCommand(t.w.ctx, t.w.session, { version: "enterprise-fee-production.v1", action: "accrue", commandId: randomUUID(), statementId: approved.statementId, authorizationId: approved.authorizationId }))).toBe("FEE_GATE_CLOSED");
});

it("R151-MUTATION: removing only the exclusion fails the zero-principal assertion; rollback restores it", async () => {
  const t = await setup(), invoice = await t.w.invoice();
  await importEvents(t, [invoice, payment(t.w), rejection(t.w, invoice)]);
  const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
  expect(sql.split(exclusion)).toHaveLength(2);
  await rolledBack(c.admin, async db => {
    await db.query(sql.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "").replace(exclusion, ""));
    const inputs = (await db.query("SELECT app.ef_inputs($1,a,$2) data FROM app.enterprise_agreement_version a WHERE id=$3", [t.w.w.p.tenantId, t.p, t.id])).rows[0].data;
    expect(inputs.rows).toHaveLength(1);
    expect(inputs.rows[0]).toMatchObject({ n: "250000", dd: "31" });
    const principal = serializeExactPence(sumExactPence(inputs.rows.map((row: { n: string; dd: string }) => exactPence(BigInt(row.n), BigInt(row.dd)))));
    expect(principal).toEqual(control.qualifyingPrincipal);
    // The same principal assertion used by the upgrade regression must fail with only this predicate removed.
    expect(() => assertZeroPrincipal(principal)).toThrow();
  });
  expect(await read(t)).toMatchObject(zero);
});


it("R151-UNKNOWN: only the persisted JSON boolean false qualifies; no compatibility promotion", async () => {
  const rows = (await c.admin.query(`SELECT line FROM (VALUES ('{}'::jsonb), ('{"rejected":null}'::jsonb),
    ('{"rejected":"false"}'::jsonb), ('{"rejected":0}'::jsonb), ('{"rejected":true}'::jsonb), ('{"rejected":false}'::jsonb)) v(line)
    WHERE line->'rejected'='false'::jsonb`)).rows;
  expect(rows).toEqual([{ line: { rejected: false } }]);
});

it("R151-IMMUTABLE: runtime cannot insert contributions, and approved statements/journals resist owner edits", async () => {
  const t = await setup(), invoice = await t.w.invoice();
  await importEvents(t, [invoice, payment(t.w)]);
  const a = await approve(t); await post(t, a);
  const before = await proofBefore(c.admin, ["app.enterprise_fee_statement", "app.platform_enterprise_fee", "app.platform_enterprise_fee_line"]);
  await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query("INSERT INTO app.enterprise_fee_contribution DEFAULT VALUES"))).rejects.toMatchObject({ code: "42501" });
  await expect(c.admin.query("UPDATE app.enterprise_fee_statement SET total_delta_pence=0 WHERE id=$1", [a.statementId])).rejects.toMatchObject({ message: "ENTERPRISE_FEE_IMMUTABLE" });
  const [fee] = await repo().readPostings(t.w.ctx, t.w.session, a.statementId);
  await expect(c.admin.query("UPDATE app.platform_enterprise_fee SET amount_pence=0 WHERE id=$1", [fee!.id])).rejects.toMatchObject({ message: "ENTERPRISE_FEE_IMMUTABLE" });
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
});

it("R151-FRESH: fresh install and repeated migration include the effective exclusion", async () => {
  const fresh = await cluster();
  try {
    await migrate(fresh.admin); await migrate(fresh.admin);
    const definition = (await fresh.admin.query("SELECT pg_get_functiondef('app.ef_inputs(uuid,app.enterprise_agreement_version,text)'::regprocedure) definition")).rows[0].definition as string;
    expect(definition).toContain(exclusion.trim());
  } finally { await fresh.close(); }
}, 300000);
