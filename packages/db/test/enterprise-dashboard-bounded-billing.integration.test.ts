// EP-F6 repair 1 (RED): billed/paid grouping and pagination run in the database. Real PostgreSQL, synthetic data only.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { dashboardFactsV1, projectStoredDashboardBilling } from "@jobguard/core";
import { ExtraApprovalRepository, EnterpriseDashboardRepository, contractorSessionContext, withTenant } from "../src/index.js";
import { enterpriseDashboardScopeLockSql, enterpriseDashboardSourceSql } from "../src/enterprise-dashboard-queries.js";
import { authorityCluster, type AuthorityCluster } from "./enterprise-dashboard.authority-fixtures.js";
import { world } from "./contractor-billing-fixtures.js";
import { approveInput, submitted } from "./extra-approval-chain-fixtures.js";
import { testActorContext } from "./tenant-context-test-utils.js";

vi.setConfig({ testTimeout: 240000, hookTimeout: 240000 });
let c: AuthorityCluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await authorityCluster(); });
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const q = (dimension: string, extra: Record<string, unknown> = {}) => ({ version: "enterprise-dashboard-query.v1", from: "2000-01-01T00:00:00Z",
  until: "2099-01-01T00:00:00Z", dimension, filters: {}, offset: 0, limit: 20, ...extra });
async function session(member: { tenantId: string; membershipId: string; identityUserId: string }) {
  const value = randomUUID();
  await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`,
  [randomUUID(), member.tenantId, member.membershipId, member.identityUserId, createHash("sha256").update(value).digest("hex")]);
  return value;
}
/** Five billed extras on five jobs of one tenant: operative- and supervisor-raised, partial receipts, one credit. */
async function billedWorld() {
  const f = await world(c);
  await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([await f.invoice()]));
  const approvals = new ExtraApprovalRepository(c.runtime), plans = [
    { net: 10000, raiser: "operative", paid: 3100 }, { net: 7000, raiser: "supervisor", paid: 0 },
    { net: 3300, raiser: "operative", paid: 1000, credit: 300 }, { net: 12000, raiser: "supervisor", paid: 14400 }] as const;
  for (const plan of plans) {
    const s = await submitted(c, f.w, plan.net, plan.raiser);
    // A supervisor never approves their own capture: the team's second supervisor approves those.
    const approver = plan.raiser === "supervisor" ? f.w.supervisor2 : f.w.members.supervisor;
    await approvals.approveExtraStep(await testActorContext(c.admin, f.ownerCtx, approver.member), approver.member, approveInput(s, 0));
    const batch = await f.repo.finalise(f.ctx, f.session, s.jobId, f.exportInput());
    const line = (await f.repo.read(f.ctx, f.session, s.jobId)).exports.find(e => e.id === batch.batchId)!.artifact.lines[0]!;
    const match = { exportLineId: line.exportLineId, jobId: line.jobId, extraId: line.extraId, scopeItemId: line.scopeItemId, revisionId: line.revisionId, revisionHash: line.revisionHash };
    const vat = plan.net / 5, amount = { netPence: 100000 + plan.net, vatPence: 20000 + vat, grossPence: 120000 + plan.net + vat }, invoiceNumber = `INV-${s.extraId}`;
    const invoice = f.event("invoiced", { invoiceNumber, amount, composition: { declared: amount, lines: [
      { externalInvoiceLineId: "order", kind: "original_order", existedAt: "2026-10-01T00:00:00Z", netPence: 100000, vatPence: 20000, grossPence: 120000, match: null },
      { externalInvoiceLineId: "extra", kind: "extra", existedAt: "2026-10-01T00:00:00Z", netPence: plan.net, vatPence: vat, grossPence: plan.net + vat, match }] } });
    const events: unknown[] = [invoice];
    if (plan.paid) events.push(f.event("paid", { invoiceNumber, effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: `fictional-${s.extraId}`,
      amount: { netPence: plan.paid, vatPence: plan.paid / 5, grossPence: plan.paid * 1.2 } }));
    if ("credit" in plan) events.push(f.event("credited", { invoiceNumber, effectiveAt: "2026-10-04T12:00:00Z", originalEventId: invoice.sourceEventId,
      amount: { netPence: plan.credit, vatPence: plan.credit / 5, grossPence: plan.credit * 1.2 },
      lineAdjustments: [{ externalInvoiceLineId: "extra", netPence: plan.credit, vatPence: plan.credit / 5, grossPence: plan.credit * 1.2 }] }));
    for (const event of events) await f.repo.import(f.ctx, f.session, s.jobId, f.importInput([event]));
  }
  return { f, viewer: await session(f.w.members.supervisor.member) };
}
/** The pre-EP-F6 billing path: every selected row through the unchanged source statement, projected in TypeScript. */
async function reference(s: string, query: ReturnType<typeof q>) {
  const context = await contractorSessionContext(c.runtime, s);
  const row = await withTenant(c.runtime, context, async db => {
    await db.$client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
    return (await db.$client.query(enterpriseDashboardSourceSql, [s, context.tenantId])).rows[0];
  });
  return projectStoredDashboardBilling(dashboardFactsV1.parse(row.facts), query, row.billing);
}
async function bounded(s: string, query: ReturnType<typeof q>) {
  return new EnterpriseDashboardRepository(c.runtime).readBilling(await contractorSessionContext(c.runtime, s), s, query);
}
const withoutHashes = <T extends { inputHash: string; outputHash: string }>({ inputHash: _i, outputHash: _o, ...rest }: T) => rest;

it("EP-F6 billed and paid totals, groups and pages from the database equal the previous projection", async () => {
  const { viewer } = await billedWorld();
  const all = await reference(viewer, q("operative"));
  expect(all.totals.billed.count).toBe(5);
  expect(all.totals.paid.count).toBe(3); // three of the five extras have receipts
  expect(all.totals.paid.exactPence.denominator).not.toBe("1"); // fractional receipts reach the exact sum
  expect(all.groupCount).toBe(2);
  for (const query of [q("operative"), q("team"), q("period"), q("client"), q("operative", { offset: 1, limit: 1 }),
    q("operative", { from: "2099-01-01T00:00:00Z", until: "2099-02-01T00:00:00Z" })]) {
    const result = await bounded(viewer, query);
    expect(withoutHashes(result)).toEqual(withoutHashes(await reference(viewer, query)));
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/u);
  }
});

it("EP-F6 paging a billed or paid drill-down past its first page returns every row exactly once", async () => {
  const { viewer } = await billedWorld();
  const groups = (await reference(viewer, q("operative"))).groups.map(g => g.id);
  for (const [stage, group] of [["billed", undefined], ["paid", undefined], ["billed", groups[0]!], ["paid", groups[1]!]] as const) {
    const expected = (await reference(viewer, q("operative"))).contributions.filter(r => r.stage === stage && (group === undefined || r.group === group));
    expect(expected.length).toBeGreaterThan(1);
    const seen: unknown[] = [];
    for (let offset = 0; ; offset += 1) {
      const page = (await bounded(viewer, q("operative", { drilldown: { stage, ...(group === undefined ? {} : { group }), offset, limit: 1 } }))).drilldown!;
      expect(page.total).toBe(expected.length);
      seen.push(...page.contributions);
      if (page.complete) break;
    }
    expect(seen).toEqual(expected);
    expect(new Set(seen.map(r => JSON.stringify(r))).size).toBe(seen.length);
  }
});
