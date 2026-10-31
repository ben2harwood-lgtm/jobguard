// ENT-12 dark server slice. Real PostgreSQL execution belongs to CI.
import { afterAll, beforeAll, expect, it } from "vitest";
import { SiteExtraRepository, SiteVisitRepository, withTenant } from "../src/index.js";
import { cluster, siteFixture, intent, command, revise, facts, freshRuntime, type Cluster } from "./offline-risk-test-utils.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 60_000);
afterAll(async () => { await c?.close(); });

it("ENT12 downloads filter assigned jobs without RLS and expose no resident or shadow columns", async () => {
 const f = await siteFixture(c), foreign = await siteFixture(c);
 // Use the actual download repository with a superuser connection: RLS cannot hide a bad filter.
 await withTenant(c.admin, f.ctx, async db => {
  expect((await db.$client.query("SELECT rolsuper FROM pg_roles WHERE rolname=current_user")).rows).toEqual([{ rolsuper: true }]);
  expect(Number((await db.$client.query("SELECT count(*) FROM app.job WHERE tenant_id=$1", [foreign.p.tenantId])).rows[0].count)).toBeGreaterThan(0);
 });
 const repo = new SiteVisitRepository(c.admin);
 const result = await repo.assignedJobs(f.ctx, f.members.operative.member);
 expect(result.jobs.map(job => job.jobId)).toEqual([f.jobId]);
 expect(Object.keys(result.jobs[0]!).sort()).toEqual(["jobId", "workOrderId", "reference", "priority", "issuedOn", "dueOn", "openVisitId"].sort());
 expect(await repo.assignedJobs(f.ctx, f.unassigned.member)).toEqual({ jobs: [], truncated: false });
 await revise(c, f, [f.unassigned.member.membershipId]);
 expect(await repo.assignedJobs(f.ctx, f.members.operative.member)).toEqual({ jobs: [], truncated: false });
 expect((await repo.assignedJobs(f.ctx, f.unassigned.member)).jobs.map(job => job.jobId)).toEqual([f.jobId]);
});

it("ENT12 retains labelled device time while server writes origin, order and current revision", async () => {
 const f = await siteFixture(c), actor = f.members.operative.member, repo = new SiteExtraRepository(c.runtime);
 const first = intent(f.jobId, 1); // far future capture first
 const [a, duplicate] = await Promise.all([repo.logOfflineSiteExtra(f.ctx, actor, first), repo.logOfflineSiteExtra(f.ctx, actor, first)]);
 expect(duplicate).toEqual(a);
 const revision = await revise(c, f, [actor.membershipId]);
 const second = intent(f.jobId, 0); // backdated capture arrives later
 const b = await repo.logOfflineSiteExtra(f.ctx, actor, second);
 const rows = (await c.admin.query(`SELECT variation_id,raising_membership_id,kind,device_id,
  to_char(device_captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') captured,
  work_order_revision_id FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2 ORDER BY server_recorded_at,variation_id`, [f.p.tenantId, f.jobId])).rows;
 expect(rows).toEqual([
  { variation_id: a.variationId, raising_membership_id: actor.membershipId, kind: "site_user", device_id: first.clientMetadata.hlc.nodeId, captured: first.clientMetadata.capturedAt, work_order_revision_id: f.revisionId },
  { variation_id: b.variationId, raising_membership_id: actor.membershipId, kind: "site_user", device_id: second.clientMetadata.hlc.nodeId, captured: second.clientMetadata.capturedAt, work_order_revision_id: revision.rows[0]!.revisionId },
 ]);
 const before = await facts(c, f);
 expect(await freshRuntime(c, pool => new SiteExtraRepository(pool).logOfflineSiteExtra(f.ctx, actor, JSON.parse(JSON.stringify(first))))).toEqual(a);
 expect(await facts(c, f)).toEqual(before);
 for (const change of [{ ...first, clientMetadata: second.clientMetadata }, { ...first, body: { ...first.body, note: "Changed fictional note" } }]) {
  await expect(repo.logOfflineSiteExtra(f.ctx, actor, change)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 }
 expect(await facts(c, f)).toEqual(before);
});

it("ENT12 offline authority loss and cross-tenant selectors write no origin", async () => {
 for (const loss of ["membership", "grant", "assignment"] as const) {
  const f = await siteFixture(c), actor = f.members.operative, raw = intent(f.jobId);
  await new SiteExtraRepository(c.runtime).logOfflineSiteExtra(f.ctx, actor.member, raw);
  if (loss === "assignment") await revise(c, f, []);
  else await command(c, f, loss === "membership" ? { kind: "membership.revoke", membershipId: actor.member.membershipId } : { kind: "grant.revoke", grantId: actor.grant });
  const before = await facts(c, f);
  for (const queued of [raw, intent(f.jobId)]) await expect(new SiteExtraRepository(c.runtime).logOfflineSiteExtra(f.ctx, actor.member, queued)).rejects.toMatchObject({ code: loss === "membership" ? "EXTRA_FORBIDDEN" : "NOT_FOUND" });
  expect(await facts(c, f)).toEqual(before);
 }
 const f = await siteFixture(c), foreign = await siteFixture(c), repo = new SiteExtraRepository(c.runtime), before = await facts(c, f);
 for (const job of [foreign.jobId, f.otherJob]) await expect(repo.logOfflineSiteExtra(f.ctx, f.members.operative.member, intent(job))).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(repo.logOfflineSiteExtra(f.ctx, foreign.members.operative.member, intent(f.jobId))).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
 expect(await facts(c, f)).toEqual(before);
});
