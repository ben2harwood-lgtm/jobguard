import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
// Real PostgreSQL acceptance, deferred to CI: this sandbox cannot bind localhost.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { BASELINE_METHOD_V1, parseExactPence, serializeExactPence, sumExactPence } from "@jobguard/core";
import { EnterpriseBaselineRepository } from "../src/enterprise-baseline-repository.js";
import { EnterpriseDashboardRepository } from "../src/enterprise-dashboard-repository.js";
import { contractorSessionContext, withTenant } from "../src/index.js";
import { authorityCluster, type AuthorityCluster } from "./enterprise-dashboard.authority-fixtures.js";
import { world } from "./contractor-billing-fixtures.js";
import { command, invite, chainWorld } from "./extra-approval-chain-fixtures.js";
vi.setConfig({ testTimeout: 120000, hookTimeout: 240000 });
let c: AuthorityCluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await authorityCluster(); });
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const query = { version: "enterprise-dashboard-query.v1", from: "2000-01-01T00:00:00Z", until: "2099-01-01T00:00:00Z", dimension: "operative", filters: {}, offset: 0, limit: 20 };
async function session(member: { tenantId: string; membershipId: string; identityUserId: string }) {
  const value = randomUUID();
  await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`,
  [randomUUID(), member.tenantId, member.membershipId, member.identityUserId, createHash("sha256").update(value).digest("hex")]);
  return value;
}
it("stored ENT-6 billed/paid totals conserve full-composition allocation and trace exact run/line facts", async () => {
  const f = await world(c), invoice = await f.invoice();
  await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([invoice]));
  await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([f.event("paid", {
    effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: "fictional-receipt", amount: { netPence: 12000, vatPence: 2400, grossPence: 14400 },
  })]));
  // Establish valid stored producer facts before testing the dashboard's scoped read.
  const storedInvoice = (await f.repo.read(f.ctx, f.session, f.s.jobId)).invoices[0]!.projection;
  expect(storedInvoice.held).toEqual([]);
  const storedExtra = storedInvoice.lines.find(l => l.lineId === "extra")!;
  expect(storedExtra.billedNet).toEqual({ numerator: "24000", denominator: "1" });
  expect(storedExtra.matchedExtraNet).toEqual({ numerator: "72000", denominator: "31" });
  const s = await session(f.w.members.supervisor.member), context = await contractorSessionContext(c.runtime, s);
  const repo = new EnterpriseDashboardRepository(c.runtime), report = await repo.readBilling(context, s, query);
  expect(report.complete).toBe(true);
  expect(report.totals.billed.known.pence).toBe(24000);
  // 14400 / 148800 of the whole invoice, then 24000 net extra: 72000/31 pence.
  expect(report.totals.paid.exactPence).toEqual({ numerator: "72000", denominator: "31" });
  for (const stage of ["billed", "paid"] as const)
    expect(serializeExactPence(sumExactPence(report.contributions.filter(r => r.stage === stage).map(r => parseExactPence(r.exactPence)))))
      .toEqual(report.totals[stage].exactPence);
  expect(report.groups[0]?.totals).toEqual(report.totals);
  expect(report.contributions.every(r => r.runId && r.exportLineId && r.factId && r.inputHash)).toBe(true);
  expect(await repo.readBilling(context, s, query)).toEqual(report);
  await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([
    f.event("credited", { effectiveAt: "2026-10-04T12:00:00Z", originalEventId: invoice.sourceEventId, amount: { netPence: 4000, vatPence: 800, grossPence: 4800 },
      lineAdjustments: [{ externalInvoiceLineId: "extra", netPence: 4000, vatPence: 800, grossPence: 4800 }] }),
  ]));
  const credited = await repo.readBilling(context, s, query);
  expect(credited.totals.billed.known.pence).toBe(20000);
  const stored = (await f.repo.read(f.ctx, f.session, f.s.jobId)).invoices[0]!.projection.lines.find(l => l.lineId === "extra")!;
  expect(credited.totals.paid.exactPence).toEqual(stored.matchedExtraNet);
  await expect(repo.readBilling(context, s, { ...query, filters: { operative: randomUUID() } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const other = await world(c), foreignSession = await session(other.w.members.supervisor.member);
  expect(JSON.stringify(await repo.readBilling(await contractorSessionContext(c.runtime, foreignSession), foreignSession, query))).not.toContain(f.s.extraId);
  await expect(repo.readBilling(await contractorSessionContext(c.runtime, foreignSession), s, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await command(c, f.w, { kind: "team.move", membershipId: f.w.members.operative.member.membershipId, fromTeamId: f.w.demo.teamId, toTeamId: f.w.otherDemo.teamId });
  expect((await repo.readBilling(context, s, query)).contributions).toEqual([]);
  await command(c, f.w, { kind: "grant.revoke", grantId: f.w.members.supervisor.grant });
  await expect(repo.readBilling(context, s, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
function history() {
  return { version: "baseline-history.v1", environment: "synthetic_demo", sourceNamespace: "fictional.invalid",
    sourceBatchId: "batch-1", sourceRevision: "revision-1", startMonth: "2026-01", endMonthExclusive: "2026-07", teamIds: ["pilot", "rest"],
    jobs: [{ sourceJobId: "job-1", teamId: "pilot", month: "2026-01", extras: [{ sourceExtraId: "extra-1", sourceWorkId: "work-1", reportedNet: { pence: 12000, currency: "GBP" } }] },
      { sourceJobId: "job-2", teamId: "rest", month: "2026-02", extras: [] }] };
}
it("stores immutable history, serializes replay once, reproduces with a new repository instance and requires complete current team coverage", async () => {
  const w = await chainWorld(c), finance = await session(w.members.finance.member), context = await contractorSessionContext(c.runtime, finance);
  const repo = new EnterpriseBaselineRepository(c.runtime), input = { version: "baseline-store.v1", format: "json", content: JSON.stringify(history()),
    teamBindings: [{ sourceTeamId: "pilot", teamId: w.demo.teamId }, { sourceTeamId: "rest", teamId: w.otherDemo.teamId }] };
  const [a, b] = await Promise.all([repo.import(context, finance, input), repo.import(context, finance, input)]);
  expect(a.batchId).toBe(b.batchId); expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
 await assertLp4SealedEvents(c.admin, w.p.tenantId, "enterprise.baseline.imported");
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='enterprise.baseline.imported'", [w.p.tenantId])).rows[0].n).toBe(1);
  const viewer = await invite(c, w, "commercial_manager", { kind: "tenant", id: w.p.tenantId }), s = await session(viewer.member), ctx = await contractorSessionContext(c.runtime, s);
  const read = { version: "baseline-read.v1", batchId: a.batchId, cohorts: { version: "baseline-cohorts.v1", pilotTeamIds: ["pilot"], restTeamIds: ["rest"] },
    methodVersion: BASELINE_METHOD_V1.version, outputFormat: "json" };
  const first = await repo.read(ctx, s, read), again = await new EnterpriseBaselineRepository(c.runtime).read(ctx, s, read);
  expect(again).toEqual(first);
  expect(first.report.pilot.totals.knownNet.pence).toBe(12000);
  expect(first.report.pilot.totals.extras).toBe(first.report.pilot.jobs.reduce((n, j) => n + j.extras.length, 0));
  expect(first.content).toContain(BASELINE_METHOD_V1.text);
  await expect(repo.import(context, finance, { ...input, content: JSON.stringify({ ...history(), sourceRevision: "revision-2" }) })).rejects.toMatchObject({ code: "BASELINE_CONFLICT" });
  await expect(repo.import(context, finance, { ...input, teamBindings: [...input.teamBindings].reverse().map(b => ({ ...b, teamId: b.sourceTeamId === "pilot" ? w.otherDemo.teamId : w.demo.teamId })) })).rejects.toMatchObject({ code: "BASELINE_CONFLICT" });
  const supervisor = await session(w.members.supervisor.member), supervisorContext = await contractorSessionContext(c.runtime, supervisor);
  await expect(repo.read(supervisorContext, supervisor, read)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.import(supervisorContext, supervisor, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const foreign = await chainWorld(c), foreignSession = await session(foreign.members.finance.member), foreignContext = await contractorSessionContext(c.runtime, foreignSession);
  await expect(repo.read(foreignContext, foreignSession, read)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.import(context, finance, { ...input, teamBindings: input.teamBindings.map(b => ({ ...b, teamId: b.sourceTeamId === "pilot" ? foreign.demo.teamId : foreign.otherDemo.teamId })) })).rejects.toMatchObject({ code: "BASELINE_INVALID" });
  await command(c, w, { kind: "grant.revoke", grantId: viewer.grant });
  await expect(repo.read(ctx, s, read)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.read(ctx, s, { ...read, methodVersion: "unknown" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("catalog enforces FORCE RLS, tenant keys, migration ownership and no raw runtime writes or reads", async () => {
  const w = await chainWorld(c), s = await session(w.members.finance.member), ctx = await contractorSessionContext(c.runtime, s);
  for (const table of ["enterprise_baseline_batch", "enterprise_baseline_team"]) {
    const row = (await c.admin.query(`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner,
      has_table_privilege('jobguard_runtime',oid,'SELECT') readable, has_table_privilege('jobguard_runtime',oid,'INSERT,UPDATE,DELETE,TRUNCATE') writable
      FROM pg_class WHERE oid=$1::regclass`, [`app.${table}`])).rows[0];
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration", readable: false, writable: false });
    await expect(withTenant(c.runtime, ctx, db => db.$client.query(`SELECT * FROM app.${table}`))).rejects.toMatchObject({ code: "42501" });
  }
  const routines = (await c.admin.query(`SELECT proname,prosecdef,pg_get_userbyid(proowner) owner,proconfig,
    has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime FROM pg_proc
    WHERE pronamespace='app'::regnamespace AND proname LIKE 'enterprise_baseline_%' ORDER BY proname`)).rows;
  expect(routines).toHaveLength(3);
  for (const r of routines) {
    expect(r.prosecdef).toBe(true); expect(r.owner).toBe("jobguard_migration"); expect(r.proconfig).toContain("search_path=pg_catalog");
    expect(r.runtime).toBe(r.proname !== "enterprise_baseline_actor");
  }
});
