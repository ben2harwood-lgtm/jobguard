import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { statementLines, exactPence, sumExactPence } from "@jobguard/core";
import { EnterpriseFeeRepository, ExtraRepository, ExtraApprovalRepository, WorkOrderRepository, demoFile, demoRow, withTenant } from "../src/index.js";
import { cluster, code, world, type World } from "./contractor-billing-fixtures.js";
import { approveInput, newJob, raiseOn } from "./extra-approval-chain-fixtures.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";
import { reference } from "./enterprise-fee-reference-fixtures.js";
import { direct, chain, type Actor } from "./site-extra-fixtures.js";

// Synthetic command fixtures only. PostgreSQL execution belongs to CI, never a mocked database.
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
const next = (p: string) => { const [y, m] = p.split("-").map(Number) as [number, number]; return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const exact = (n: number | string, d = "1") => ({ numerator: String(n), denominator: d });
const amount = (netPence: number) => ({ netPence, vatPence: netPence / 5, grossPence: netPence * 6 / 5 });
async function agreement(w: World, rate = 10, effectiveFrom = "2000-01-01T00:00:00Z") {
  const id = randomUUID();
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'fictional-command-fixtures',$3,100,'on_payment','enterprise_site_capture_policy_v1',$4,false,$5,'synthetic_demo','operations:fictional')`, [w.w.p.tenantId, id, rate, effectiveFrom, "c".repeat(64)]);
  return id;
}
async function setup(net = 15000) {
  const w = await world(c, net), repo = new EnterpriseFeeRepository(c.runtime), id = await agreement(w);
  const p = (await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p as string;
  return { w, repo, id, p };
}
type Setup = Awaited<ReturnType<typeof setup>>;
async function addExtra(t: Setup, net: number, kind: "site_user" | "office_entry" | "client_instruction" = "site_user", siteActor: Actor = t.w.w.members.operative) {
  const { w } = t, role = kind === "site_user" ? "operative" : kind === "office_entry" ? "finance" : "commercial_manager";
  const extraId = (await new ExtraRepository(c.runtime).raiseExtra(w.ctx, direct(w.w, kind === "site_user" ? siteActor : w.w.members[role], {
    jobId: w.s.jobId, commandType: kind === "site_user" ? "LogSiteExtra" : kind === "office_entry" ? "RecordOfficeExtra" : "RecordClientInstruction",
    description: `Fictional separate work ${randomUUID()}`, note: "Made-up command fixture",
  }))).variationId;
  const repo = new ExtraApprovalRepository(c.runtime);
  await repo.priceExtra(w.ctx, w.w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId, netPence: net });
  const submitted = await repo.submitExtra(w.ctx, w.w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId });
  await repo.approveExtraStep(w.ctx, w.w.members.supervisor.member, approveInput({ jobId: w.s.jobId, requestId: submitted.requestId as string, hash: submitted.revisionHash as string, net }, 0));
  if (net > 50000) await repo.approveExtraStep(w.ctx, w.w.supervisor2.member, approveInput({ jobId: w.s.jobId, requestId: submitted.requestId as string, hash: submitted.revisionHash as string, net }, 1));
  return extraId;
}
async function invoice(t: Setup, nets: Record<string, number>, orderNet = 0) {
  const { w } = t, batch = await w.exported(), view = await w.repo.read(w.ctx, w.session, w.s.jobId);
  const exported = view.exports.find(e => e.id === batch.batchId)!.artifact.lines;
  const lines = exported.filter(l => nets[l.extraId] !== undefined).map(l => ({ externalInvoiceLineId: l.extraId, kind: "extra", existedAt: "2026-10-01T00:00:00Z",
    ...amount(nets[l.extraId]!), match: { exportLineId: l.exportLineId, jobId: l.jobId, extraId: l.extraId, scopeItemId: l.scopeItemId, revisionId: l.revisionId, revisionHash: l.revisionHash } }));
  const total = Object.values(nets).reduce((a, b) => a + b, orderNet);
  const composition = { declared: amount(total), lines: [...lines, ...(orderNet ? [{ externalInvoiceLineId: "order", kind: "original_order", existedAt: "2026-10-01T00:00:00Z", ...amount(orderNet), match: null }] : [])] };
  const inv = w.event("invoiced", { amount: amount(total), composition });
  await w.repo.import(w.ctx, w.session, w.s.jobId, w.importInput([inv]));
  return inv;
}
async function pay(t: Setup, net: number, effectiveAt = "2026-10-03T12:00:00Z") {
  const e = t.w.event("paid", { effectiveAt, reconciliationId: randomUUID(), amount: amount(net) });
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([e]));
  return e;
}
async function credit(t: Setup, inv: ReturnType<World["event"]>, net: number) {
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("credited", { effectiveAt: "2026-10-04T12:00:00Z", originalEventId: inv.sourceEventId,
    amount: amount(net), lineAdjustments: [{ externalInvoiceLineId: t.w.s.extraId, ...amount(net) }] })]));
}
async function derive(t: Setup, p = t.p, id = t.id) {
  const r = await t.repo.derive(t.w.ctx, t.w.session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: id, period: p });
  return t.repo.read(t.w.ctx, t.w.session, r.derivationId);
}
async function post(t: Setup, p = t.p) {
  const { statementId } = await t.repo.prepareStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period: p });
  const s = await t.repo.readStatement(t.w.ctx, t.w.session, statementId);
  const { authorizationId } = await t.repo.approveStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId,
    contentHash: s.contentHash, totalDeltaPence: s.totalDeltaPence, expiresAt: new Date(Date.now() + 600000).toISOString() });
  await t.repo.postStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-post-statement.v1", commandId: randomUUID(), statementId, authorizationId });
  await chain(c, t.w.w);
  return { s, postings: await t.repo.readPostings(t.w.ctx, t.w.session, statementId) };
}

async function check(t: Setup, approved: number, billed: number, q: number, fee: number) {
  const read = await derive(t), ref = reference(t, [{ approved, billed, paid: exact(q) }]);
  expect(read.qualifyingPrincipal).toEqual(exact(q));
  expect(read.cumulativeFeePence).toBe(fee);
  expect(read.cumulativeFeePence).toBe(ref.cumulativeFee.pence);
  expect(ref.qualifyingPrincipal).toEqual(exactPence(BigInt(q)));
  return read;
}

it("ENT-F1: £150 approved, billed plus VAT and paid yields a 1500p accrual", async () => {
  const t = await setup(); await invoice(t, { [t.w.s.extraId]: 15000 }); await pay(t, 15000);
  await check(t, 15000, 15000, 15000, 1500);
  const r = await post(t); expect(r.s.totalDeltaPence).toBe(1500); expect(r.postings[0]).toMatchObject({ kind: "accrual", amountPence: 1500 });
});
it("ENT-F2: full blended receipt follows 806p with a 1594p delta, never another 2400p", async () => {
  const t = await setup(24000); await invoice(t, { [t.w.s.extraId]: 24000 }, 100000);
  const first = t.w.event("paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: randomUUID(), amount: { netPence: 41667, vatPence: 8333, grossPence: 50000 } });
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([first]));
  const partial = await derive(t), ref = reference(t, [{ approved: 24000, billed: 24000, paid: exact("250000", "31") }]);
  expect(partial.qualifyingPrincipal).toEqual(exact("250000", "31")); expect(partial.cumulativeFeePence).toBe(ref.cumulativeFee.pence); expect(ref.cumulativeFee.pence).toBe(806);
  expect((await post(t)).s.totalDeltaPence).toBe(806);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("paid", { effectiveAt: "2026-10-04T12:00:00Z", reconciliationId: randomUUID(), amount: { netPence: 82333, vatPence: 16467, grossPence: 98800 } })]));
  const p = next(t.p); expect((await derive(t, p)).cumulativeFeePence).toBe(2400);
  expect((await post(t, p)).s.totalDeltaPence).toBe(1594);
});
it("ENT-F3 / ENT-F12: credit after an approved month compensates next month, preserving the original statement", async () => {
  const t = await setup(), inv = await invoice(t, { [t.w.s.extraId]: 15000 }); await pay(t, 15000); await check(t, 15000, 15000, 15000, 1500);
  const first = await post(t); await credit(t, inv, 5000);
  const p = next(t.p), r = await derive(t, p), ref = reference(t, [{ approved: 15000, billed: 15000, paid: exact(15000), credit: 5000 }]);
  expect(r.qualifyingPrincipal).toEqual(exact(10000)); expect(r.cumulativeFeePence).toBe(ref.cumulativeFee.pence); expect(r.cumulativeFeePence).toBe(1000);
  const second = await post(t, p); expect(second.s.totalDeltaPence).toBe(-500); expect(second.postings[0]).toMatchObject({ kind: "compensation", amountPence: 500, compensatesFeeId: first.postings[0]!.id });
  expect(await t.repo.readStatement(t.w.ctx, t.w.session, first.s.id)).toEqual({ ...first.s, approval: expect.any(Object) });
  expect(await t.repo.readPostings(t.w.ctx, t.w.session, first.s.id)).toEqual(first.postings);
  await derive(t); // Fresh inputs isolate the closed-month guard from the separate stale-derivation guard.
  expect(await code(t.repo.prepareStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period: t.p }))).toBe("COMMAND_CONFLICT");
});
it("ENT-F4: a reversed £180 payment compensates the entire 1500p fee", async () => {
  const t = await setup(); await invoice(t, { [t.w.s.extraId]: 15000 }); const paid = await pay(t, 15000); await derive(t); const first = await post(t);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("payment_reversed", { originalEventId: paid.sourceEventId, reconciliationId: randomUUID(), effectiveAt: "2026-10-05T12:00:00Z", amount: paid.amount })]));
  const p = next(t.p), r = await derive(t, p), ref = reference(t, [{ approved: 15000, billed: 15000, paid: exact(0) }]);
  expect(r.cumulativeFeePence).toBe(ref.cumulativeFee.pence); expect(r.qualifyingPrincipal).toEqual(exact(0));
  expect((await post(t, p)).postings[0]).toMatchObject({ kind: "compensation", amountPence: 1500, compensatesFeeId: first.postings[0]!.id });
});
for (const [name, billed, q, fee] of [["ENT-F5", 20000, 15000, 1500], ["ENT-F6", 12000, 12000, 1200]] as const) it(`${name}: approved and billed caps survive posting`, async () => {
  const t = await setup(); await invoice(t, { [t.w.s.extraId]: billed }); await pay(t, billed);
  const r = await derive(t), ref = reference(t, [{ approved: 15000, billed, paid: exact(billed) }]);
  expect(r.qualifyingPrincipal).toEqual(exact(q)); expect(r.cumulativeFeePence).toBe(fee); expect(fee).toBe(ref.cumulativeFee.pence);
  expect((await post(t)).s.totalDeltaPence).toBe(fee);
});
it("ENT-F7: two billed-and-paid logs reconcile once, retain artifacts and origins, and compensate to one fee", async () => {
  const t = await setup();
  const order = (await c.admin.query("SELECT reference FROM app.work_order WHERE tenant_id=$1 AND job_id=$2", [t.w.w.p.tenantId, t.w.s.jobId])).rows[0].reference as string;
  await new WorkOrderRepository(c.runtime).importCsv(t.w.w.p, { commandId: randomUUID(), kind: "csv", name: "fictional-second-operative.csv",
    csv: demoFile([demoRow(t.w.w.demo, Number(order.split("-").at(-1)), { expectedRevision: 1,
      assignedMembershipIds: [t.w.w.members.operative.member.membershipId, t.w.w.unassigned.member.membershipId] })]) });
  const duplicate = await addExtra(t, 15000, "site_user", t.w.w.unassigned);
  await invoice(t, { [t.w.s.extraId]: 15000, [duplicate]: 15000 }); await pay(t, 30000); await derive(t); const first = await post(t);
  expect(first.s.totalDeltaPence).toBe(3000);
  const snapshot = async () => (await c.admin.query("SELECT (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM app.billing_export_batch x WHERE tenant_id=$1) exports,(SELECT jsonb_agg(to_jsonb(x) ORDER BY variation_id) FROM app.extra_origin x WHERE tenant_id=$1) origins", [t.w.w.p.tenantId])).rows[0];
  const before = await snapshot(), command = { version: "enterprise-reconcile-exported-duplicate.v1", commandId: randomUUID(), jobId: t.w.s.jobId, duplicateId: t.w.s.extraId, canonicalId: duplicate };
  const results = await Promise.all([t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, command), t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, command)]);
  expect(results.filter(r => !r.replayed)).toHaveLength(1); expect(results[0]!.correctionId).toBe(results[1]!.correctionId);
  expect(results[0]!.corrections).toEqual([expect.objectContaining({ kind: "credit_instruction", netPence: exact(15000), grossPence: 18000 })]);
  expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, { ...command, canonicalId: command.duplicateId }))).toBe("INVALID_FEE_INPUT");
  expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, { ...command, duplicateId: command.canonicalId, canonicalId: command.duplicateId }))).toBe("COMMAND_CONFLICT");
  expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, { ...command, commandId: randomUUID() }))).toBe("COMMAND_CONFLICT");
  expect(await snapshot()).toEqual(before); await chain(c, t.w.w);
  await expect(c.admin.query("UPDATE app.enterprise_duplicate_correction SET corrections='[]' WHERE tenant_id=$1", [t.w.w.p.tenantId])).rejects.toMatchObject({ message: "ENTERPRISE_FEE_IMMUTABLE" });
  const authority = (await c.admin.query("SELECT d.action_type,r.resolution,a.content_hash,a.amount_pence::int FROM app.enterprise_duplicate_correction c JOIN app.action_authorization a ON(a.tenant_id,a.id)=(c.tenant_id,c.authorization_id) JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id) JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id) WHERE c.tenant_id=$1", [t.w.w.p.tenantId])).rows;
  expect(authority).toEqual([{ action_type: "ReconcileExportedDuplicate", resolution: "approved", content_hash: results[0]!.contentHash, amount_pence: 18000 }]);
  const p = next(t.p), r = await derive(t, p), ref = reference(t, [{ id: duplicate, approved: 15000, billed: 15000, paid: exact(15000) }, { id: t.w.s.extraId, approved: 15000, billed: 15000, paid: exact(15000), duplicateOf: duplicate }]);
  expect(r.contributions).toHaveLength(1); expect(r.contributions[0]!.extraId).toBe(duplicate); expect(r.cumulativeFeePence).toBe(ref.cumulativeFee.pence);
  const second = await post(t, p); expect(second.s.totalDeltaPence).toBe(-1500); expect(second.postings[0]).toMatchObject({ kind: "compensation", amountPence: 1500, compensatesFeeId: first.postings[0]!.id });
  await c.admin.query("UPDATE app.job SET status='paid' WHERE tenant_id=$1 AND id=$2", [t.w.w.p.tenantId, t.w.s.jobId]);
  expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, command))).toBe("JOB_NOT_LIVE");
});
it("fractional duplicate credit preserves 250000/31 net pence in storage, replay and the authorized hash", async () => {
  const t = await setup(24000), canonical = await addExtra(t, 24000);
  await invoice(t, { [t.w.s.extraId]: 24000, [canonical]: 24000 });
  // Owner-only synthetic boundary fixture: today's importer emits integer credit details. Append a fractional
  // pro-rata projection without changing existing history; exercise the real reconciliation routine below.
  const run = (await c.admin.query("SELECT id,projection FROM app.billing_allocation_run WHERE tenant_id=$1 AND job_id=$2 ORDER BY server_recorded_at DESC LIMIT 1", [t.w.w.p.tenantId, t.w.s.jobId])).rows[0];
  const projection = { ...run.projection, lines: run.projection.lines.map((line: { lineId: string }) => line.lineId === t.w.s.extraId
    ? { ...line, billedNet: exact(48000, "2"), creditedNet: exact(494000, "31") } : line) };
  await c.admin.query(`INSERT INTO app.billing_allocation_run(tenant_id,id,job_id,client_contract_id,source,invoice_number,input_hash,projection,predecessor_id,command_id)
    SELECT tenant_id,$3,job_id,client_contract_id,source,invoice_number,$5,$4::jsonb,id,command_id FROM app.billing_allocation_run WHERE tenant_id=$1 AND id=$2`,
    [t.w.w.p.tenantId,run.id,randomUUID(),JSON.stringify(projection),"f".repeat(64)]);
  const command = { version: "enterprise-reconcile-exported-duplicate.v1", commandId: randomUUID(), jobId: t.w.s.jobId, duplicateId: t.w.s.extraId, canonicalId: canonical };
  const result = await t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, command);
  expect(result.corrections).toEqual([expect.objectContaining({ netPence: exact("250000", "31"), grossPence: 28800 })]);
  const net = result.corrections[0]!.netPence;
  expect(BigInt(net.numerator) * 2n * 31n).toBe((48000n * 31n - 494000n * 2n) * BigInt(net.denominator));
  const stored = (await c.admin.query(`SELECT c.corrections,c.content_hash,a.content_hash authorization_hash,a.amount_pence::int,
    app.final_lock_hash(jsonb_build_object('version','enterprise-duplicate-correction.v1','jobId',c.job_id,'duplicateId',c.duplicate_id,'canonicalId',c.canonical_id,'corrections',c.corrections)) recomputed_hash
    FROM app.enterprise_duplicate_correction c JOIN app.action_authorization a ON(a.tenant_id,a.id)=(c.tenant_id,c.authorization_id) WHERE c.tenant_id=$1 AND c.id=$2`, [t.w.w.p.tenantId,result.correctionId])).rows[0];
 await assertLp4SealedEvents(c.admin, t.w.w.p.tenantId, "contractor.extra.duplicate_linked");
  expect(stored).toEqual({ corrections: result.corrections, content_hash: result.contentHash, authorization_hash: result.contentHash, recomputed_hash: result.contentHash, amount_pence: 28800 });
  expect(await t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, command)).toEqual({ ...result, replayed: true });
});
it("ENT-F8: office, client instructions and order lines contribute zero even when billed and paid", async () => {
  const t = await setup(), office = await addExtra(t, 50000, "office_entry"), client = await addExtra(t, 80000, "client_instruction");
  await invoice(t, { [office]: 50000, [client]: 80000 }, 100000); await pay(t, 230000);
  const r = await derive(t), ref = reference(t, [{ approved: 50000, billed: 50000, paid: exact(50000), kind: "office_entry" }, { approved: 80000, billed: 80000, paid: exact(80000), kind: "client_instruction" }]);
  expect(r.cumulativeFeePence).toBe(ref.cumulativeFee.pence); expect(r.qualifyingPrincipal).toEqual(exact(0)); expect((await post(t)).postings).toEqual([]);
});
it("ENT-F9: origins either side of a version boundary keep 10% / 8%; a later X credit stays under v1", async () => {
  const t = await setup();
  // Use the CI server's real instants instead of rewriting immutable origin timestamps to November dates.
  const boundary = (await c.admin.query("SELECT clock_timestamp()::text t")).rows[0].t as string, v2 = await agreement(t.w, 8, boundary);
  const y = await addExtra(t, 15000), inv = await invoice(t, { [t.w.s.extraId]: 15000, [y]: 15000 }); await pay(t, 30000);
  const a = await derive(t), b = await derive(t, t.p, v2);
  expect(a.cumulativeFeePence).toBe(reference(t, [{ approved: 15000, billed: 15000, paid: exact(15000) }]).cumulativeFee.pence);
  expect(b.cumulativeFeePence).toBe(reference(t, [{ approved: 15000, billed: 15000, paid: exact(15000) }], 8, v2).cumulativeFee.pence);
  expect(a.contributions.map(x => x.extraId)).toEqual([t.w.s.extraId]); expect(b.contributions.map(x => x.extraId)).toEqual([y]);
  expect([a.cumulativeFeePence, b.cumulativeFeePence]).toEqual([1500, 1200]); const first = await post(t); expect(first.s.totalDeltaPence).toBe(2700); expect(first.s.sections).toHaveLength(2);
  await credit(t, inv, 5000); const p = next(t.p); await derive(t, p); await derive(t, p, v2);
  const second = await post(t, p); expect(second.s.sections.find(s => s.agreementVersionId === t.id)!.deltaPence).toBe(-500); expect(second.s.sections.find(s => s.agreementVersionId === v2)!.deltaPence).toBe(0);
});
it("ReconcileExportedDuplicate retains the earlier agreement when the later log is chosen as canonical", async () => {
  const t = await setup(), boundary = (await c.admin.query("SELECT clock_timestamp()::text t")).rows[0].t as string;
  const v2 = await agreement(t.w, 8, boundary), canonical = await addExtra(t, 15000);
  await invoice(t, { [t.w.s.extraId]: 15000, [canonical]: 15000 }); await pay(t, 30000);
  await derive(t); await derive(t, t.p, v2); const first = await post(t); expect(first.s.totalDeltaPence).toBe(2700);
  await t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, { version: "enterprise-reconcile-exported-duplicate.v1", commandId: randomUUID(), jobId: t.w.s.jobId, duplicateId: t.w.s.extraId, canonicalId: canonical });
  const p = next(t.p), originalVersion = await derive(t, p), laterVersion = await derive(t, p, v2);
  expect(originalVersion.contributions).toEqual([expect.objectContaining({ extraId: canonical })]);
  expect(originalVersion.cumulativeFeePence).toBe(reference(t, [{ approved: 15000, billed: 15000, paid: exact(15000) }]).cumulativeFee.pence);
  expect(laterVersion.cumulativeFeePence).toBe(0);
  const second = await post(t, p); expect(second.s.totalDeltaPence).toBe(-1200);
  expect(second.postings).toEqual([expect.objectContaining({ kind: "compensation", agreementVersionId: v2, amountPence: 1200 })]);
});
it("Self-check: cumulative approval/credit caps survive signed partial reversals and replay without rounding", async () => {
  const t = await setup(), inv = await invoice(t, { [t.w.s.extraId]: 20000 });
  await pay(t, 10000); const second = await pay(t, 10000, "2026-10-04T12:00:00Z");
  let read = await derive(t); expect(read.qualifyingPrincipal).toEqual(exact(15000));
  expect(read.contributions.map(x => x.qualifyingPrincipal)).toEqual([exact(7500), exact(7500)]);
  await post(t);
  // Credit follows both receipts; its cap applies to their cumulative principal, not to each receipt separately.
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("credited", { originalEventId: inv.sourceEventId,
    effectiveAt: "2026-10-05T12:00:00Z", amount: amount(10000), lineAdjustments: [{ externalInvoiceLineId: t.w.s.extraId, ...amount(10000) }] })]));
  const reversal = t.w.event("payment_reversed", { originalEventId: second.sourceEventId, reconciliationId: randomUUID(), effectiveAt: "2026-10-06T12:00:00Z", amount: amount(5000) });
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([reversal]));
  const p = next(t.p); read = await derive(t, p);
  expect(read.qualifyingPrincipal).toEqual(exact(10000));
  expect(read.cumulativeFeePence).toBe(reference(t, [{ approved: 15000, billed: 20000, paid: exact(15000), credit: 10000 }]).cumulativeFee.pence);
  const shares = read.contributions.map(x => exactPence(BigInt(x.qualifyingPrincipal.numerator), BigInt(x.qualifyingPrincipal.denominator)));
  expect(sumExactPence(shares)).toEqual(exactPence(10000n)); expect(shares.some(x => x.numerator < 0n)).toBe(true);
  expect(read.contributions.map(x => x.qualifyingPrincipal.denominator)).toEqual(["3", "3", "3"]);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([reversal]));
  expect((await derive(t, p)).id).toBe(read.id);
  expect((await post(t, p)).s.totalDeltaPence).toBe(-500);
});
it("Self-check: wrong locked export revision and oversized amounts cannot create fee contributions", async () => {
  const t = await setup(), batch = await t.w.exported(), view = await t.w.repo.read(t.w.ctx, t.w.session, t.w.s.jobId);
  const line = view.exports.find(e => e.id === batch.batchId)!.artifact.lines[0]!;
  const badInvoice = t.w.event("invoiced", { amount: amount(15000), composition: { declared: amount(15000), lines: [{ externalInvoiceLineId: "wrong-revision", kind: "extra", existedAt: "2026-10-01T00:00:00Z", ...amount(15000),
    match: { exportLineId: line.exportLineId, jobId: line.jobId, extraId: line.extraId, scopeItemId: line.scopeItemId, revisionId: randomUUID(), revisionHash: line.revisionHash } }] } });
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([badInvoice])); const payment = await pay(t, 15000);
  const facts = (await c.admin.query<{ id: string; source_event_id: string }>(
    "SELECT id, source_event_id FROM app.billing_fact WHERE tenant_id=$1 AND job_id=$2", [t.w.w.p.tenantId, t.w.s.jobId])).rows;
  const invoiceFact = facts.find(f => f.source_event_id === badInvoice.sourceEventId)!;
  const paymentFact = facts.find(f => f.source_event_id === payment.sourceEventId)!;
  const held = await t.w.repo.read(t.w.ctx, t.w.session, t.w.s.jobId);
  // Ingest rejects the match; projection also holds the invoice and the payment without a valid invoice.
  expect([...held.quarantine].sort((a, b) => a.reason.localeCompare(b.reason))).toEqual([
    { fact_id: invoiceFact.id, reason: "COMPOSITION_REQUIRED" },
    { fact_id: invoiceFact.id, reason: "INVALID_COMPOSITION_OR_MATCH" },
    { fact_id: paymentFact.id, reason: "INVOICE_REQUIRED" },
  ]);
  expect(await derive(t)).toMatchObject({ qualifyingPrincipal: exact(0), cumulativeFeePence: 0, contributions: [] });
  expect(await code(t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("paid", { amount: { netPence: 1000000000001, vatPence: 0, grossPence: 1000000000001 } })])))).toBe("BILLING_INVALID");
  expect(await derive(t)).toMatchObject({ qualifyingPrincipal: exact(0), cumulativeFeePence: 0, contributions: [] });
  // Try the SQL entrypoint too, bypassing the application's Zod schema. It must quarantine the oversized line.
  const tooLarge = { netPence: 1000000000001, vatPence: 0, grossPence: 1000000000001 };
  const directInvoice = t.w.event("invoiced", { invoiceNumber: "fictional-oversized", amount: tooLarge, composition: { declared: tooLarge,
    lines: [{ externalInvoiceLineId: "oversized", kind: "extra", existedAt: "2026-10-01T00:00:00Z", ...tooLarge,
      match: { exportLineId: line.exportLineId, jobId: line.jobId, extraId: line.extraId, scopeItemId: line.scopeItemId, revisionId: line.revisionId, revisionHash: line.revisionHash } }] } });
  const cmd = t.w.importInput([directInvoice]);
  await withTenant(c.runtime, t.w.ctx, async db => {
    const r = (await db.$client.query("SELECT app.cb_ingest($1,$2,$3,$4::jsonb) result", [t.w.session,t.w.s.jobId,cmd.commandId,JSON.stringify(cmd)])).rows[0].result;
    await db.$client.query("SELECT app.cb_complete($1,$2,$3,$4::jsonb)", [t.w.session,t.w.s.jobId,cmd.commandId,JSON.stringify(r)]);
  });
  expect((await c.admin.query("SELECT match_valid FROM app.billing_fact WHERE tenant_id=$1 AND source_event_id=$2", [t.w.w.p.tenantId,directInvoice.sourceEventId])).rows).toEqual([{ match_valid: false }]);
  expect(await derive(t)).toMatchObject({ qualifyingPrincipal: exact(0), cumulativeFeePence: 0, contributions: [] });
});
it("Self-check: posting command IDs bind the exact statement and authorization, including zero-result replays", async () => {
  const t = await setup(5); await invoice(t, { [t.w.s.extraId]: 5 }); await pay(t, 5); await derive(t);
  const approve = async (period: string) => {
    const { statementId } = await t.repo.prepareStatement(t.w.ctx,t.w.session,{ version: "enterprise-fee-prepare-statement.v1",commandId: randomUUID(),period });
    const st = await t.repo.readStatement(t.w.ctx,t.w.session,statementId);
    const { authorizationId } = await t.repo.approveStatement(t.w.ctx,t.w.session,{ version: "enterprise-fee-approve-statement.v1",commandId: randomUUID(),statementId,contentHash: st.contentHash,totalDeltaPence: st.totalDeltaPence,expiresAt: new Date(Date.now()+600000).toISOString() });
    return { statementId, authorizationId };
  };
  const first = await approve(t.p), commandId = randomUUID();
  const cmd = { version: "enterprise-fee-post-statement.v1",commandId,...first };
  expect(await t.repo.postStatement(t.w.ctx,t.w.session,cmd)).toMatchObject({ replayed: false, journals: 0 });
  await withTenant(c.runtime,t.w.ctx,db => db.$client.query("UPDATE app.command_receipt SET result=$2::jsonb WHERE tenant_id=$1 AND command_id=$3", [t.w.w.p.tenantId,JSON.stringify({ statementId: randomUUID(),journals: 999 }),commandId]));
  expect(await t.repo.postStatement(t.w.ctx,t.w.session,cmd)).toEqual({ statementId: first.statementId,replayed: true,journals: 0 });
  expect(await code(t.repo.postStatement(t.w.ctx,t.w.session,{ ...cmd,authorizationId: randomUUID() }))).toBe("COMMAND_CONFLICT");
  expect(await code(t.repo.postStatement(t.w.ctx,t.w.session,{ ...cmd,commandId: randomUUID(),authorizationId: randomUUID() }))).toBe("STATEMENT_AUTHORITY_INVALID");
  expect(await t.repo.postStatement(t.w.ctx,t.w.session,{ ...cmd,commandId: randomUUID() })).toMatchObject({ replayed: true });
  const p = next(t.p); await derive(t,p); const second = await approve(p);
  expect(await code(t.repo.postStatement(t.w.ctx,t.w.session,{ version: "enterprise-fee-post-statement.v1",commandId,...second }))).toBe("COMMAND_CONFLICT");
 await assertLp4SealedEvents(c.admin, t.w.w.p.tenantId, "enterprise_fee.statement_posted");
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='enterprise_fee.statement_posted'",[t.w.w.p.tenantId])).rows[0].n).toBe(1);
  expect(await t.repo.readPostings(t.w.ctx,t.w.session,first.statementId)).toEqual([]); await chain(c,t.w.w);
});
it("Self-check: approved statements reject stale credit inputs without changing the locked bill or posting", async () => {
  const t = await setup(), inv = await invoice(t, { [t.w.s.extraId]: 15000 }); await pay(t, 15000); await derive(t);
  const { statementId } = await t.repo.prepareStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period: t.p });
  const before = await t.repo.readStatement(t.w.ctx, t.w.session, statementId);
  const { authorizationId } = await t.repo.approveStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId, contentHash: before.contentHash, totalDeltaPence: before.totalDeltaPence, expiresAt: new Date(Date.now()+600000).toISOString() });
  const approved = await t.repo.readStatement(t.w.ctx, t.w.session, statementId);
  await credit(t, inv, 5000);
  expect(await code(t.repo.postStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-post-statement.v1", commandId: randomUUID(), statementId, authorizationId }))).toBe("STALE_FACTS");
  expect(await t.repo.readStatement(t.w.ctx, t.w.session, statementId)).toEqual(approved);
  expect(await t.repo.readPostings(t.w.ctx, t.w.session, statementId)).toEqual([]); await chain(c, t.w.w);
});
it("Self-check: cross-tenant replay, reads and cross-job duplicate references disclose no foreign data", async () => {
  const t = await setup(), canonical = await addExtra(t, 15000), foreign = await setup();
  await invoice(t, { [t.w.s.extraId]: 15000, [canonical]: 15000 });
  const command = { version: "enterprise-reconcile-exported-duplicate.v1", commandId: randomUUID(), jobId: t.w.s.jobId, duplicateId: t.w.s.extraId, canonicalId: canonical };
  const correction = await t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, command);
  await withTenant(c.runtime,t.w.ctx,db => db.$client.query("UPDATE app.command_receipt SET result=$2::jsonb WHERE tenant_id=$1 AND command_id=$3", [t.w.w.p.tenantId,JSON.stringify({ correctionId: foreign.w.s.extraId }),command.commandId]));
  expect(await t.repo.reconcileExportedDuplicate(t.w.ctx,t.w.session,command)).toEqual({ ...correction,replayed: true });
  expect(await code(t.repo.reconcileExportedDuplicate(foreign.w.ctx, foreign.w.session, command))).toBe("FEE_NOT_FOUND");
  expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, { ...command, commandId: randomUUID(), canonicalId: foreign.w.s.extraId }))).toBe("FEE_NOT_FOUND");
  const otherJob = await newJob(c, t.w.w), otherExtra = await raiseOn(c, t.w.w, otherJob);
  expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, { ...command, commandId: randomUUID(), canonicalId: otherExtra }))).toBe("FEE_NOT_FOUND");
  const read = await derive(t); expect(await code(t.repo.read(foreign.w.ctx, foreign.w.session, read.id))).toBe("FEE_NOT_FOUND");
  expect((await c.admin.query("SELECT count(*)::int n FROM app.enterprise_duplicate_correction WHERE tenant_id=$1", [t.w.w.p.tenantId])).rows[0].n).toBe(1);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.enterprise_duplicate_correction WHERE tenant_id=$1", [foreign.w.w.p.tenantId])).rows[0].n).toBe(0);
  // The new entrypoint grants no shadow-role execution and its audited outputs contain references/hashes only.
  expect((await c.admin.query("SELECT has_function_privilege('jobguard_shadow','app.ef_reconcile_exported_duplicate(uuid,uuid,uuid,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  await chain(c, t.w.w);
});
it("ENT-F10: three 5p extras round cumulatively to 2p; largest-remainder trace is 1p/1p/0p by ID", async () => {
  const t = await setup(5), b = await addExtra(t, 5), d = await addExtra(t, 5), ids = [t.w.s.extraId, b, d].sort();
  await invoice(t, Object.fromEntries(ids.map(id => [id, 5]))); await pay(t, 15); const r = await derive(t);
  const ref = reference(t, ids.map(id => ({ id, approved: 5, billed: 5, paid: exact(5) })));
  expect(r.cumulativeFeePence).toBe(ref.cumulativeFee.pence); expect(r.qualifyingPrincipal).toEqual(exact(15)); expect((await post(t)).s.totalDeltaPence).toBe(2);
  const lines = statementLines(r.cumulativeFeePence, r.contributions.map(x => ({ extraId: x.extraId, change: exactPence(BigInt(x.qualifyingPrincipal.numerator), BigInt(x.qualifyingPrincipal.denominator) * 10n) })));
  expect(lines.map(l => [l.extraId, l.fee.pence])).toEqual(ids.map((id, i) => [id, i < 2 ? 1 : 0])); expect(ref.lines.map(l => l.fee.pence)).toEqual([1, 1, 0]);
});
for (const [net, fee] of [[5, 0], [15, 2], [25, 2]] as const) it(`ENT-F11: Q=${net}p half-even cumulative fee=${fee}p`, async () => {
  const t = await setup(net); await invoice(t, { [t.w.s.extraId]: net }); await pay(t, net); await check(t, net, net, net, fee); expect((await post(t)).s.totalDeltaPence).toBe(fee);
});
it("ENT-F11: two 5p receipts accumulate to 1p rather than rounding each receipt down", async () => {
  const t = await setup(10); await invoice(t, { [t.w.s.extraId]: 10 }); await pay(t, 5); await check(t, 10, 10, 5, 0); await post(t);
  await pay(t, 5, "2026-10-04T12:00:00Z"); const p = next(t.p), r = await derive(t, p); expect(r.qualifyingPrincipal).toEqual(exact(10)); expect(r.cumulativeFeePence).toBe(reference(t, [{ approved: 10, billed: 10, paid: exact(10) }]).cumulativeFee.pence); expect((await post(t, p)).s.totalDeltaPence).toBe(1);
});
it("ReconcileExportedDuplicate refuses non-live jobs, wrong tenant/session and direct runtime writes", async () => {
  const t = await setup(), duplicate = await addExtra(t, 15000); await invoice(t, { [t.w.s.extraId]: 15000, [duplicate]: 15000 });
  const command = { version: "enterprise-reconcile-exported-duplicate.v1", commandId: randomUUID(), jobId: t.w.s.jobId, duplicateId: duplicate, canonicalId: t.w.s.extraId };
  expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, randomUUID(), command))).toBe("EXTRA_FORBIDDEN");
  const other = await setup(); expect(await code(t.repo.reconcileExportedDuplicate(other.w.ctx, other.w.session, command))).toBe("FEE_NOT_FOUND");
  const nonFinanceSession = randomUUID();
  await c.admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) SELECT $1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 hour'", [nonFinanceSession,t.w.w.p.tenantId,t.w.w.members.supervisor.member.membershipId,t.w.w.members.supervisor.member.identityUserId,digestOf(nonFinanceSession)]);
  expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, nonFinanceSession, command))).toBe("EXTRA_FORBIDDEN");
  for (const status of ["quoting", "accepted", "invoiced", "paid", "lost", "draft"]) {
    // Owner-only fixture state transition; the command itself must refuse each non-live state.
    await c.admin.query("UPDATE app.job SET status=$2 WHERE tenant_id=$1 AND id=$3", [t.w.w.p.tenantId, status, t.w.s.jobId]);
    expect(await code(t.repo.reconcileExportedDuplicate(t.w.ctx, t.w.session, command))).toBe("JOB_NOT_LIVE");
    await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query("SELECT app.ef_reconcile_exported_duplicate($1,$2,$3,$4,$5)", [t.w.session, command.commandId, command.jobId, duplicate, command.canonicalId]))).rejects.toMatchObject({ message: "JOB_NOT_LIVE" });
  }
  for (const sql of ["SELECT * FROM app.enterprise_duplicate_correction", "INSERT INTO app.enterprise_duplicate_correction DEFAULT VALUES", "UPDATE app.enterprise_duplicate_correction SET corrections='[]'", "DELETE FROM app.enterprise_duplicate_correction", "TRUNCATE app.enterprise_duplicate_correction"])
    await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
  const routine = (await c.admin.query("SELECT pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public FROM pg_proc p WHERE p.oid='app.ef_reconcile_exported_duplicate(uuid,uuid,uuid,uuid,uuid)'::regprocedure")).rows;
  expect(routine).toEqual([{ owner: "jobguard_migration", prosecdef: true, proconfig: ["search_path=pg_catalog"], runtime: true, infrastructure: false, public: false }]);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.enterprise_duplicate_correction WHERE tenant_id=$1", [t.w.w.p.tenantId])).rows[0].n).toBe(0);
});
