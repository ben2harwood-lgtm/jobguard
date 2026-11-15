import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { seedNorthsideDemo, PracticeWorkerSwitchRepository, ContractorRepository, SiteExtraRepository, EnterpriseDashboardRepository, contractorSessionContext, withTenant } from "../src/index.js";
import { enterpriseDashboardSourceSql } from "../src/enterprise-dashboard-queries.js";
import { cluster, startSession, type Cluster } from "./contractor-practice-session-fixtures.js";
import { siteExtraContentSha256V1 } from "@jobguard/core";
import { photo } from "./site-extra-evidence-fixtures.js";
import { randomUUID } from "node:crypto";
let c: Cluster;
let fixture: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster();
  fixture = await seedFixture();
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
async function seedFixture() {
  const session = await startSession(c);
  const seed = await seedNorthsideDemo(c.runtime, session.p, session.context);
  const switches = new PracticeWorkerSwitchRepository(c.runtime);
  await switches.switchOn(session.context, session.p, session.session,
    { version: "practice-worker-switch-on.v1", commandId: randomUUID(), workerId: seed.journey.operativeMembershipId });
  const operativeContext = await contractorSessionContext(c.runtime, session.session);
  const operative = await new ContractorRepository(c.runtime).resolveSession(session.session);
  const jobId = seed.journey.jobId, image = await photo(c, { ctx: operativeContext, jobId });
  const description = "Fictional additional clearance", note = "Fictional resident shown generated image";
  const extra = await new SiteExtraRepository(c.runtime).logSiteExtra(operativeContext, operative, { commandId: randomUUID(), jobId, description, note, photoEvidenceId: image.id,
    shownContentSha256: siteExtraContentSha256V1({ jobId, description, note, photoSha256: image.sha256 }) });
  // LP-6d: switching back (and on again) binds the live session's own request, as the switch fixtures do.
  await switches.switchOff(await contractorSessionContext(c.runtime, session.session), session.p, session.session, { version: "practice-worker-switch-off.v1", commandId: randomUUID() });
  await switches.switchOn(await contractorSessionContext(c.runtime, session.session), session.p, session.session,
    { version: "practice-worker-switch-on.v1", commandId: randomUUID(), workerId: seed.financeMembershipId });
  const context = await contractorSessionContext(c.runtime, session.session);
  return { session, context, extra };
}
it("ENT-DASHBOARD-SLOW bounds dashboard plan work on the journey's 2,000 command-seeded orders", async () => {
  const { session, context, extra } = fixture;
  expect((await c.admin.query("SELECT count(*)::int n FROM app.work_order WHERE tenant_id=$1", [context.tenantId])).rows[0].n).toBe(2000);
  const plans: PlanNode[] = [];
  for (const label of ["before-analyze", "after-analyze"]) {
    if (label === "after-analyze") await c.admin.query("ANALYZE");
    const plan = await withTenant(c.runtime, context, async db => (await db.$client.query(
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${enterpriseDashboardSourceSql}`, [session.session, context.tenantId])).rows[0]["QUERY PLAN"]);
    // Optional evidence export; the assertions below always run, including without an output directory.
    if (process.env.ENT_DASHBOARD_PLAN_DIRECTORY) {
      const directory = resolve(process.env.ENT_DASHBOARD_PLAN_DIRECTORY);
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, `${label}.json`), JSON.stringify(plan, null, 2));
    }
    plans.push(plan[0].Plan as PlanNode);
  }
  for (const plan of plans) {
    const nodes = flatten(plan);
    expect(plan["Actual Rows"]).toBe(1);
    // Only the captured job can contribute, despite 1,999 other valid work orders.
    // Removing the pre-authority candidate fence makes this 2,000 on main.
    expect(nodes.find(n => n["Subplan Name"] === "CTE jobs")?.["Actual Rows"]).toBe(1);
    // Count executor work, including rejected tuples and repeated scans. Main examines
    // 8m / 16m tuples in a single node before / after ANALYZE on this fixture.
    const examined = nodes.map(n => (n["Actual Rows"] + (n["Rows Removed by Filter"] ?? 0)
      + (n["Rows Removed by Join Filter"] ?? 0)) * n["Actual Loops"]);
    expect(Math.max(...examined)).toBeLessThanOrEqual(200_000);
  }
  const query = { version: "enterprise-dashboard-query.v1", from: "2000-01-01T00:00:00Z", until: "2099-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
  const repo = new EnterpriseDashboardRepository(c.runtime);
  const activity = await repo.read(context, session.session, query);
  expect(activity.report.totals.captured.count).toBe(1);
  expect(activity.report.contributions.find(row => row.stage === "captured")?.extraIds).toEqual([extra.variationId]);
  const billing = await repo.readBilling(context, session.session, query);
  expect(billing.contributions).toEqual([]);
});

type PlanNode = {
  "Node Type": string; "Subplan Name"?: string; "Actual Rows": number; "Actual Loops": number;
  "Rows Removed by Filter"?: number; "Rows Removed by Join Filter"?: number; Plans?: PlanNode[];
};
function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}
