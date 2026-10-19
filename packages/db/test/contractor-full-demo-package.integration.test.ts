// Practice sandbox — synthetic data; nothing is sent or charged
// Real PostgreSQL only. NOT RUN locally; dispatcher/CI owns execution and failing-first database evidence.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { moneyFromBigInt, siteExtraContentSha256V1 } from "@jobguard/core";
import { FullDemoPackageApplication } from "../../../apps/api/src/contractor/full-demo-package.application.js";
import { ContractorRepository, ContractorPracticeSessionRepository, ExtraApprovalRepository, SiteExtraRepository,
  PracticeWorkerSwitchRepository, contractorSessionContext, seedNorthsideDemo, northsideOwnActions } from "../src/index.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { startSession } from "./contractor-practice-session-fixtures.js";
import { photo } from "./site-extra-evidence-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
vi.setConfig({ testTimeout: 600000, hookTimeout: 600000 });
let c: Cluster;
const query = { version: "full-demo-package-query.v1", dashboard: { version: "enterprise-dashboard-query.v1", from: "2000-01-01T00:00:00Z", until: "2099-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 } };
async function world() {
  const f = await startSession(c), seed = await seedNorthsideDemo(c.runtime, f.p, f.context);
  const switches = new PracticeWorkerSwitchRepository(c.runtime);
  const act = async (target?: string) => {
    if ((await switches.state(f.context, f.session)).state !== "owner") await switches.switchOff(f.context, f.p, f.session, { version: "practice-worker-switch-off.v1", commandId: randomUUID() });
    if (target) await switches.switchOn(f.context, f.p, f.session, { version: "practice-worker-switch-on.v1", commandId: randomUUID(), workerId: target });
    return new ContractorRepository(c.runtime).resolveSession(f.session);
  };
  const ctx = () => contractorSessionContext(c.runtime, f.session);
  const op = await act(seed.journey.operativeMembershipId), image = await photo(c, { ctx: await ctx(), jobId: seed.journey.jobId });
  const jobId = seed.journey.jobId, commandId = randomUUID(), description = "Fictional additional clearance", note = "Practice resident shown the generated image";
  const extra = await new SiteExtraRepository(c.runtime).logSiteExtra(await ctx(), op, { commandId, jobId, description, note, photoEvidenceId: image.id,
    shownContentSha256: siteExtraContentSha256V1({ jobId, description, note, photoSha256: image.sha256 }) });
  const approval = new ExtraApprovalRepository(c.runtime);
  const surveyor = await act(seed.surveyorMembershipId);
  await approval.priceExtra(await ctx(), surveyor, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId: extra.variationId, netPence: 108000 });
  const supervisor = await act(seed.supervisorMembershipId);
  const submitted = await approval.submitExtra(await ctx(), supervisor, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId: extra.variationId });
  await approval.approveExtraStep(await ctx(), supervisor, { version: "approve-extra-step.v1", commandId: randomUUID(), jobId, requestId: submitted.requestId, stepIndex: 0, revisionHash: submitted.revisionHash, netPence: 108000 });
  // Reuse the existing fictional local-link command. It queues fake_email; no executor or provider is initialized.
  const owner = await act(), token = randomUUID().replaceAll("-", "").repeat(2);
  await approval.issueClientApproval(await ctx(), owner, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId, requestId: submitted.requestId,
    approverMembershipId: seed.clientApproverMembershipId, recipient: seed.clientApproverEmail, linkToken: token, expiresAt: new Date(Date.now() + 600000) });
  const client = await act(seed.clientApproverMembershipId);
  await approval.decideClientApproval(await ctx(), client, { version: "decide-client-approval.v1", commandId: randomUUID(), jobId, requestId: submitted.requestId,
    linkToken: token, email: seed.clientApproverEmail, revisionHash: submitted.revisionHash, netPence: 108000, decision: "approve", fictionalRoleName: "Fictional client approver", actualTesterReference: `membership:${f.p.membershipId}` });
  await act(seed.supervisorMembershipId);
  return { f, seed, act, ctx, extraId: extra.variationId, jobId };
}
let w: Awaited<ReturnType<typeof world>>;
const read = (session = w.f.session, pool = c.runtime, q: unknown = query) => new FullDemoPackageApplication(pool).read({ sessionId: session }, q);
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await world(); });
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("A12 Northside commands feed captured and approved drill-downs", async () => {
  const result = await read(), report = result.observations.value.report;
  for (const stage of ["captured", "approved"] as const) {
    const rows = report.contributions.filter(r => r.stage === stage);
    expect(rows).toEqual([expect.objectContaining({ jobId: w.jobId, extraIds: [w.extraId] })]);
    expect(rows[0]!.sourceIds.length).toBeGreaterThan(0);
    expect(report.totals[stage].known).toEqual(moneyFromBigInt(rows.reduce((n, r) => n + BigInt(r.value?.pence ?? 0), 0n)));
    expect(report.totals[stage].count).toBe(rows.length);
  }
  expect(report.totals.approved.known.pence).toBe(108000);
  const actor = await new ContractorRepository(c.runtime).resolveSession(w.f.session);
  const own = await northsideOwnActions(c.runtime, actor, await w.ctx());
  expect(own.length).toBeGreaterThan(0);
  expect(own.every(a => a.actorMembershipId === w.seed.supervisorMembershipId && a.testerMembershipId === w.f.p.membershipId)).toBe(true);
  expect(JSON.stringify(result)).not.toContain(w.seed.clientApproverEmail);
});
it("A13 fresh application and connection recover committed observations", async () => {
  const before = await read();
  const fresh = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "ent4b_login", max: 1 });
  try {
    const after = await read(w.f.session, fresh);
    // Cutoff and hashes include read time; durable contribution identities and totals must survive.
    expect(after.observations.value.report.contributions).toEqual(before.observations.value.report.contributions);
    expect(after.observations.value.report.totals).toEqual(before.observations.value.report.totals);
  } finally { await fresh.end(); }
});
it("A14 foreign tenant client job and revoked-session reads refuse", async () => {
  const other = await world();
  expect(JSON.stringify(await read())).not.toContain(other.extraId);
  expect(JSON.stringify(await read(other.f.session))).not.toContain(w.extraId);
  for (const client of [other.seed.journey.clientId, w.seed.clientIds.find(id => id !== w.seed.journey.clientId)!]) {
    await expect(read(w.f.session, c.runtime, { ...query, dashboard: { ...query.dashboard, filters: { client } } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  // The existing query has no job filter: a caller cannot introduce a job authority override.
  await expect(read(w.f.session, c.runtime, { ...query, dashboard: { ...query.dashboard, filters: { jobId: other.jobId } } })).rejects.toMatchObject({ code: "DASHBOARD_INVALID" });
  for (const target of [undefined, w.seed.clientApproverMembershipId, w.seed.journey.operativeMembershipId]) {
    await w.act(target);
    await expect(read()).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await w.act(w.seed.supervisorMembershipId);
  await other.act();
  await new ContractorPracticeSessionRepository(c.runtime).revoke(other.f.context, other.f.session);
  await expect(read(other.f.session)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("A15 reads create no commercial audit outbox or money effects", async () => {
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    const tables = (await c.admin.query<{ table_name: string }>(`SELECT p.tablename table_name FROM pg_tables p JOIN information_schema.columns c
      ON(c.table_schema,c.table_name,c.column_name)=(p.schemaname,p.tablename,'tenant_id') WHERE p.schemaname='app' ORDER BY p.tablename`)).rows;
    for (const { table_name: table } of tables) {
      const quoted = '"' + table.replaceAll('"', '""') + '"';
      result[table] = (await c.admin.query(`SELECT row_to_json(t)::text bytes FROM app.${quoted} t WHERE tenant_id=$1 ORDER BY row_to_json(t)::text`, [w.f.p.tenantId])).rows;
    }
    return result;
  };
  const before = await snapshot();
  expect(before.extra_origin).toEqual(expect.arrayContaining([expect.anything()]));
  expect(before.action_outbox).toEqual(expect.arrayContaining([expect.anything()]));
  expect(before.action_attempt).toEqual([]);
  const result = await read();
  expect(result.observations.value.report.totals).toMatchObject({ billed: null, paid: null });
  expect(await snapshot()).toEqual(before);
});
it("A16 reset preserves prior run history and isolates the next run", async () => {
  await w.act();
  const tables = ["app.northside_run", "app.northside_action_attribution", "app.extra_origin", "app.evidence_object", "app.audit_event"];
  const before = await proofBefore(c.admin, tables);
  await new ContractorPracticeSessionRepository(c.runtime).revoke(w.f.context, w.f.session);
  const fresh = await startSession(c), seed = await seedNorthsideDemo(c.runtime, fresh.p, fresh.context);
  expect(fresh.p.tenantId).not.toBe(w.f.p.tenantId);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  await new PracticeWorkerSwitchRepository(c.runtime).switchOn(fresh.context, fresh.p, fresh.session, { version: "practice-worker-switch-on.v1", commandId: randomUUID(), workerId: seed.supervisorMembershipId });
  expect((await read(fresh.session)).observations.value.report.totals.captured.count).toBe(0);
  await expect(read()).rejects.toMatchObject({ code: "NOT_FOUND" });
});
