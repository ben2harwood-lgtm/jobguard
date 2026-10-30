// M4-23 contractor sandbox acceptance. Real PostgreSQL; fake export adapter only.
// Platform invoice execution is still held on this base. This suite must not claim invoice/collection acceptance.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { exactPence, parseExactPence, sumExactPence, refuseEnterpriseFeeExecution } from "@jobguard/core";
import { ContractorBillingRepository, EnterpriseFeeRepository, ExtraRepository, ExtraApprovalRepository } from "../src/index.js";
import { ContractorBillingDelivery } from "../src/contractor-billing-delivery.js";
import type { OutboundAdapter } from "../src/outbox.js";
import { cluster, chainWorld, newJob, submitted, approveInput } from "./extra-approval-chain-fixtures.js";
import { direct, chain, type Role } from "./site-extra-fixtures.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";

let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const amount = (netPence: number) => ({ netPence, vatPence: 0, grossPence: netPence });
const exact = (n: number) => ({ numerator: String(n), denominator: "1" });
const nextMonth = (p: string) => {
  const [y, m] = p.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
async function setup() {
  const w = await chainWorld(c), ctx = await w.ctx, session = randomUUID(), agreementVersionId = randomUUID();
  // Infrastructure fixture only: domain actions below all use the existing runtime commands.
  await c.admin.query(`INSERT INTO control_plane.contractor_practice_session
    (session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`,
  [session, w.p.tenantId, w.members.finance.member.membershipId, w.members.finance.member.identityUserId, digestOf(session)]);
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version
    (tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'fictional-m4-23',1,10,'on_payment','enterprise_site_capture_policy_v1','2000-01-01T00:00:00Z',false,$3,'synthetic_demo','operations:fictional')`,
  [w.p.tenantId, agreementVersionId, "c".repeat(64)]);
  const period = (await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p as string;
  return { w, ctx, session, agreementVersionId, period, billing: new ContractorBillingRepository(c.runtime), fees: new EnterpriseFeeRepository(c.runtime) };
}
type Sandbox = Awaited<ReturnType<typeof setup>>;
async function approve(t: Sandbox, s: Awaited<ReturnType<typeof submitted>>, rejected = false) {
  const approvals = new ExtraApprovalRepository(c.runtime), actor = t.w.members.supervisor.member;
  if (rejected) await approvals.rejectExtra(t.ctx, actor, { ...approveInput(s, 0), version: "reject-extra.v1", reasonCode: "not_done" });
  else await approvals.approveExtraStep(t.ctx, actor, approveInput(s, 0));
}
async function extra(t: Sandbox, origin: "site" | "office" | "client" | "rejected" = "site") {
  const raiser: Role = origin === "office" ? "finance" : origin === "client" ? "commercial_manager" : "operative";
  // submitted() uses LogSiteExtra; office/client must use their real origin-specific command instead.
  if (origin === "site" || origin === "rejected") {
    const s = await submitted(c, t.w, 15000, raiser);
    await approve(t, s, origin === "rejected");
    return s;
  }
  const jobId = await newJob(c, t.w), approvals = new ExtraApprovalRepository(c.runtime);
  const { variationId: extraId } = await new ExtraRepository(c.runtime).raiseExtra(t.ctx, direct(t.w, t.w.members[raiser], {
    jobId, commandType: origin === "office" ? "RecordOfficeExtra" : "RecordClientInstruction",
    description: "Fictional excluded contractor work", note: "Synthetic acceptance only",
  }));
  await approvals.priceExtra(t.ctx, t.w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: 15000 });
  const r = await approvals.submitExtra(t.ctx, t.w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
  const s = { jobId, extraId, requestId: r.requestId as string, hash: r.revisionHash as string, net: 15000, result: r };
  await approve(t, s);
  return s;
}
async function exportAndDeliver(t: Sandbox, jobId: string, expectedIds: string[]) {
  const command = { version: "billing-finalise.v1", commandId: randomUUID(), clientContractId: t.w.demo.contractId };
  const batch = await t.billing.finalise(t.ctx, t.session, jobId, command);
  expect(batch.lineCount).toBe(expectedIds.length);
  expect(await t.billing.finalise(t.ctx, t.session, jobId, command)).toEqual(batch);
  expect((await t.billing.finalise(t.ctx, t.session, jobId, { ...command, commandId: randomUUID() })).lineCount).toBe(0);
  const view = await t.billing.read(t.ctx, t.session, jobId);
  const lines = view.exports.flatMap(b => b.artifact.lines);
  expect(lines.map(l => l.extraId).sort()).toEqual([...expectedIds].sort());
  if (expectedIds.length) {
    const persisted = view.exports.find(b => b.id === batch.batchId)!;
    const authorization = { version: "billing-approve-delivery.v1", commandId: randomUUID(), batchId: batch.batchId,
      channel: "fake_sftp", destination: "fictional.invalid", contentHash: persisted.jsonHash, expiresAt: new Date(Date.now() + 600000).toISOString() };
    const action = await t.billing.approveDelivery(t.ctx, t.session, jobId, authorization);
    expect(await t.billing.approveDelivery(t.ctx, t.session, jobId, authorization)).toEqual(action);
    const deliver = vi.fn<OutboundAdapter["deliver"]>(async () => ({ kind: "succeeded", providerReference: "fictional-m4-23-export" }));
    const adapter: OutboundAdapter = { name: "fake_sftp", supportsProviderDeduplication: true, deliver, async reconcile() { return "succeeded"; } };
    const delivery = new ContractorBillingDelivery(c.runtime, new Map([[adapter.name, adapter]]));
    await delivery.execute(t.ctx, t.session, jobId, action.outboxActionId);
    await delivery.execute(t.ctx, t.session, jobId, action.outboxActionId);
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver.mock.calls[0]![0]).toMatchObject({ contentHash: persisted.jsonHash });
    expect((await t.billing.read(t.ctx, t.session, jobId)).deliveries).toEqual([expect.objectContaining({ status: "succeeded" })]);
  }
  return lines;
}
function event(t: Sandbox, jobId: string, factType: string, overrides: Record<string, unknown> = {}) {
  return { version: "billing-status.v1", clientContractId: t.w.demo.contractId, source: "fictional-m4-23", sourceEventId: randomUUID(),
    invoiceNumber: `FICTIONAL-${jobId}`, factType, effectiveAt: "2026-10-02T12:00:00Z", remittanceReference: null,
    reconciliationId: null, originalEventId: null, amount: amount(15000), composition: null, explicit: null,
    separateInvoice: false, lineAdjustments: [], ...overrides };
}
async function ingest(t: Sandbox, jobId: string, events: unknown[]) {
  const cmd = { version: "billing-import-command.v1", commandId: randomUUID(), events, transport: "api", sourceHash: "a".repeat(64) };
  const first = await t.billing.import(t.ctx, t.session, jobId, cmd);
  expect(await t.billing.import(t.ctx, t.session, jobId, cmd)).toEqual(first);
  // New command, same source-event identities: no duplicate facts or allocations.
  await t.billing.import(t.ctx, t.session, jobId, { ...cmd, commandId: randomUUID() });
}
async function billAndPay(t: Sandbox, jobId: string, ids: string[], paid = 15000, orderOnly = false) {
  const lines = await exportAndDeliver(t, jobId, ids);
  const composition = { declared: amount(15000), lines: orderOnly
    ? [{ externalInvoiceLineId: "order", kind: "original_order", existedAt: "2026-10-01T00:00:00Z", ...amount(15000), match: null }]
    : lines.map(l => ({ externalInvoiceLineId: l.extraId, kind: "extra", existedAt: "2026-10-01T00:00:00Z", ...amount(15000),
      match: { exportLineId: l.exportLineId, jobId: l.jobId, extraId: l.extraId, scopeItemId: l.scopeItemId, revisionId: l.revisionId, revisionHash: l.revisionHash } })) };
  const invoice = event(t, jobId, "invoiced", { composition });
  const payment = event(t, jobId, "paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: randomUUID(), amount: amount(paid) });
  // Attack arrival order: an unmatched payment cannot earn a fee before the invoice arrives.
  await ingest(t, jobId, [payment]);
  expect((await derive(t)).cumulativeFeePence).toBe(0);
  await ingest(t, jobId, [invoice, payment]);
  const read = await t.billing.read(t.ctx, t.session, jobId);
  expect(read.invoices).toHaveLength(1);
  expect(read.invoices[0]!.projection.held).toEqual([]);
  const allocation = read.invoices[0]!.projection.allocations;
  expect(allocation).toHaveLength(1);
  expect(sumExactPence(allocation[0]!.lines.map(l => parseExactPence(l.net)))).toEqual(exactPence(BigInt(paid)));
  expect(read.reconciliation.unmatchedFacts).toEqual([]);
  expect(read.reconciliation.approvedNotExported).toEqual([]);
  expect(read.reconciliation.unbilledExports).toEqual([]);
  expect(read.reconciliation.billedDifferences).toEqual([]);
  expect(read.reconciliation.totals.excessPayment).toEqual(exact(0));
  expect((await c.admin.query("SELECT count(*)::int n FROM app.billing_fact WHERE tenant_id=$1", [t.w.p.tenantId])).rows[0].n).toBe(2);
  return invoice;
}
async function derive(t: Sandbox, period = t.period) {
  const cmd = { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: t.agreementVersionId, period };
  const result = await t.fees.derive(t.ctx, t.session, cmd);
  expect(await t.fees.derive(t.ctx, t.session, cmd)).toMatchObject({ derivationId: result.derivationId, replayed: true });
  return t.fees.read(t.ctx, t.session, result.derivationId);
}
async function post(t: Sandbox, expectedFee: number, period = t.period) {
  const { statementId } = await t.fees.prepareStatement(t.ctx, t.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period });
  const statement = await t.fees.readStatement(t.ctx, t.session, statementId);
  expect(statement.totalDeltaPence).toBe(expectedFee);
  const { authorizationId } = await t.fees.approveStatement(t.ctx, t.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(),
    statementId, contentHash: statement.contentHash, totalDeltaPence: statement.totalDeltaPence, expiresAt: new Date(Date.now() + 600000).toISOString() });
  const cmd = { version: "enterprise-fee-post-statement.v1", commandId: randomUUID(), statementId, authorizationId };
  const first = await t.fees.postStatement(t.ctx, t.session, cmd);
  expect(first).toMatchObject({ replayed: false, journals: expectedFee === 0 ? 0 : 1 });
  expect(await t.fees.postStatement(t.ctx, t.session, cmd)).toMatchObject({ replayed: true, journals: first.journals });
  expect(await t.fees.postStatement(t.ctx, t.session, { ...cmd, commandId: randomUUID() })).toMatchObject({ replayed: true, journals: first.journals });
  const postings = await t.fees.readPostings(t.ctx, t.session, statementId);
  expect(postings).toHaveLength(first.journals);
  for (const p of postings) {
    expect(p.amountPence).toBe(Math.abs(expectedFee));
    expect(p.lines.reduce((n, l) => n + BigInt(l.debitPence) - BigInt(l.creditPence), 0n)).toBe(0n);
  }
  const approved = await t.fees.readStatement(t.ctx, t.session, statementId);
  const netPosted = (await c.admin.query(`SELECT coalesce(sum(CASE WHEN kind='accrual' THEN amount_pence ELSE -amount_pence END),0)::text n
    FROM app.platform_enterprise_fee WHERE tenant_id=$1`, [t.w.p.tenantId])).rows[0].n as string;
  expect(BigInt(netPosted)).toBe(approved.sections.reduce((n, section) => n + BigInt(section.cumulativeFeePence), 0n));
  // These are refusals, not fake successful invoices or payments. Replace only when their real pieces land.
  for (const action of ["invoice-simulation", "collect"] as const) {
    expect(() => refuseEnterpriseFeeExecution("synthetic_demo", action)).toThrow("STATEMENT_EXECUTION_HELD");
    expect(() => refuseEnterpriseFeeExecution("pilot_no_charge", action)).toThrow("FEE_GATE_CLOSED");
    expect(() => refuseEnterpriseFeeExecution("production_billing", action)).toThrow("FEE_GATE_CLOSED");
  }
  expect(await t.fees.readStatement(t.ctx, t.session, statementId)).toEqual(approved);
  expect(await t.fees.readPostings(t.ctx, t.session, statementId)).toEqual(postings);
  await chain(c, t.w);
  return { statement: approved, postings };
}

for (const [origin, principal, fee] of [["site", 15000, 1500], ["office", 0, 0], ["client", 0, 0]] as const) {
  it(`M4-23 ${origin}: command approval → fake export → replayed status import → exact monthly posting`, async () => {
    const t = await setup(), s = await extra(t, origin);
    await billAndPay(t, s.jobId, [s.extraId]);
    const d = await derive(t);
    expect(d.qualifyingPrincipal).toEqual(exact(principal));
    expect(d.cumulativeFeePence).toBe(fee);
    expect(d.contributions.map(x => x.extraId)).toEqual(principal ? [s.extraId] : []);
    await post(t, fee);
  });
}
it("M4-23 original order: paid ordinary work stays in allocation and earns no fee", async () => {
  const t = await setup(), jobId = await newJob(c, t.w);
  await billAndPay(t, jobId, [], 15000, true);
  expect(await derive(t)).toMatchObject({ qualifyingPrincipal: exact(0), cumulativeFeePence: 0, contributions: [] });
  await post(t, 0);
});
it("M4-23 rejected extra: the actual rejection prevents export and positive fees", async () => {
  const t = await setup(), s = await extra(t, "rejected");
  await exportAndDeliver(t, s.jobId, []);
  // An imported invoice/payment cannot manufacture the export authority that rejection prevented.
  const forged = event(t, s.jobId, "invoiced", { composition: { declared: amount(15000), lines: [{
    externalInvoiceLineId: s.extraId, kind: "extra", existedAt: "2026-10-01T00:00:00Z", ...amount(15000),
    match: { exportLineId: randomUUID(), jobId: s.jobId, extraId: s.extraId, scopeItemId: randomUUID(), revisionId: randomUUID(), revisionHash: "a".repeat(64) },
  }] } });
  await ingest(t, s.jobId, [forged, event(t, s.jobId, "paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: randomUUID() })]);
  expect((await t.billing.read(t.ctx, t.session, s.jobId)).quarantine.length).toBeGreaterThan(0);
  expect(await derive(t)).toMatchObject({ qualifyingPrincipal: exact(0), cumulativeFeePence: 0, contributions: [] });
  await post(t, 0);
});
it("M4-23 part payment: only settled principal earns 500p; next month posts only the 1000p balance", async () => {
  const t = await setup(), s = await extra(t);
  await billAndPay(t, s.jobId, [s.extraId], 5000);
  expect(await derive(t)).toMatchObject({ qualifyingPrincipal: exact(5000), cumulativeFeePence: 500 });
  await post(t, 500);
  await ingest(t, s.jobId, [event(t, s.jobId, "paid", { effectiveAt: "2026-10-04T12:00:00Z", reconciliationId: randomUUID(), amount: amount(10000) })]);
  const period = nextMonth(t.period);
  expect(await derive(t, period)).toMatchObject({ qualifyingPrincipal: exact(15000), cumulativeFeePence: 1500 });
  await post(t, 1000, period);
});
it("M4-23 credit: next month compensates once and leaves the approved bill and journal immutable", async () => {
  const t = await setup(), s = await extra(t), inv = await billAndPay(t, s.jobId, [s.extraId]);
  await derive(t); const first = await post(t, 1500);
  await ingest(t, s.jobId, [event(t, s.jobId, "credited", { effectiveAt: "2026-10-04T12:00:00Z", originalEventId: inv.sourceEventId,
    amount: amount(5000), lineAdjustments: [{ externalInvoiceLineId: s.extraId, ...amount(5000) }] })]);
  const period = nextMonth(t.period);
  expect(await derive(t, period)).toMatchObject({ qualifyingPrincipal: exact(10000), cumulativeFeePence: 1000 });
  const second = await post(t, -500, period);
  expect(second.postings).toEqual([expect.objectContaining({ kind: "compensation", compensatesFeeId: first.postings[0]!.id })]);
  expect(await t.fees.readStatement(t.ctx, t.session, first.statement.id)).toEqual(first.statement);
  expect(await t.fees.readPostings(t.ctx, t.session, first.statement.id)).toEqual(first.postings);
});
it("M4-23 duplicate log: capture replay and an explicit duplicate resolution leave one billed fee line", async () => {
  const t = await setup(), jobId = await newJob(c, t.w), extras = new ExtraRepository(c.runtime);
  const cmd = direct(t.w, t.w.members.operative, { jobId, clientCaptureId: randomUUID() });
  const first = await extras.raiseExtra(t.ctx, cmd);
  expect(await extras.raiseExtra(t.ctx, cmd)).toEqual(first);
  expect(await extras.raiseExtra(t.ctx, { ...cmd, commandId: randomUUID() })).toEqual(first);
  const other = await extras.raiseExtra(t.ctx, direct(t.w, t.w.members.operative, { jobId, description: "Fictional duplicate work" }));
  const approvals = new ExtraApprovalRepository(c.runtime);
  for (const extraId of [first.variationId, other.variationId]) {
    await approvals.priceExtra(t.ctx, t.w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: 15000 });
    const r = await approvals.submitExtra(t.ctx, t.w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
    await approve(t, { jobId, extraId, requestId: r.requestId as string, hash: r.revisionHash as string, net: 15000, result: r });
  }
  await approvals.markDuplicate(t.ctx, t.w.members.supervisor.member, { version: "mark-duplicate.v1", commandId: randomUUID(), jobId,
    duplicateId: other.variationId, canonicalId: first.variationId });
  await billAndPay(t, jobId, [first.variationId]);
  expect(await derive(t)).toMatchObject({ qualifyingPrincipal: exact(15000), cumulativeFeePence: 1500 });
  await post(t, 1500);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1", [t.w.p.tenantId])).rows[0].n).toBe(2);
});

it("M4-23 cross-customer authority cannot read, import against or post the other contractor's statement", async () => {
  const own = await setup(), foreign = await setup(), s = await extra(own);
  await billAndPay(own, s.jobId, [s.extraId]);
  const d = await derive(own), posted = await post(own, 1500);
  await expect(foreign.fees.read(foreign.ctx, foreign.session, d.id)).rejects.toMatchObject({ code: "FEE_NOT_FOUND" });
  await expect(foreign.fees.readStatement(foreign.ctx, foreign.session, posted.statement.id)).rejects.toMatchObject({ code: "FEE_NOT_FOUND" });
  await expect(foreign.billing.import(foreign.ctx, foreign.session, s.jobId, {
    version: "billing-import-command.v1", commandId: randomUUID(), events: [event(own, s.jobId, "paid")], transport: "api", sourceHash: "a".repeat(64),
  })).rejects.toMatchObject({ code: "BILLING_FORBIDDEN" });
  await expect(foreign.fees.postStatement(foreign.ctx, foreign.session, { version: "enterprise-fee-post-statement.v1", commandId: randomUUID(),
    statementId: posted.statement.id, authorizationId: posted.statement.approval!.authorizationId })).rejects.toMatchObject({ code: "FEE_NOT_FOUND" });
  expect(await own.fees.readStatement(own.ctx, own.session, posted.statement.id)).toEqual(posted.statement);
  expect(await own.fees.readPostings(own.ctx, own.session, posted.statement.id)).toEqual(posted.postings);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.platform_enterprise_fee WHERE tenant_id=$1", [foreign.w.p.tenantId])).rows[0].n).toBe(0);
});
