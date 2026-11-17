import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SiteVisitRepository, withTenant, type AuthenticatedMembership } from "../src/index.js";
import { assignedJobsQuery, assignedJobsByScopeQuery } from "../src/site-visit-repository.js";
import { fixture } from "./extra-fixtures.js";
import { cluster, visitFixture, invite, command, reviseOrder, extraOrder, ownerVisit, forbiddenRoles, type Cluster, type VisitFixture, type Actor } from "./site-visit-fixtures.js";

let c: Cluster, f: VisitFixture;
let actors: Record<string, Actor>, teamIds: string[];
beforeAll(async () => {
 c = await cluster(); f = await visitFixture(c);
 const region = (await c.admin.query("SELECT parent_id FROM app.org_unit WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.demo.branchId])).rows[0]!.parent_id as string;
 const otherTeam = (await command(c, f, { kind: "team.create", branchId: f.demo.branchId, name: "Fictional other team" })).id;
 const distantRegion = (await command(c, f, { kind: "unit.create", unitKind: "region", parentId: f.p.tenantId, name: "Fictional distant region" })).id;
 const distantBranch = (await command(c, f, { kind: "unit.create", unitKind: "branch", parentId: distantRegion, name: "Fictional distant branch" })).id;
 const distantTeam = (await command(c, f, { kind: "team.create", branchId: distantBranch, name: "Fictional distant team" })).id;
 teamIds = [f.demo.teamId, otherTeam, f.otherDemo.teamId, distantTeam];
 actors = {
  operative: f.members.operative, ownTeam: f.named, otherTeam: f.otherSupervisor,
  branch: await invite(c, f, "supervisor", { kind: "branch", id: f.demo.branchId }),
  region: await invite(c, f, "supervisor", { kind: "region", id: region }),
  tenant: await invite(c, f, "supervisor", { kind: "tenant", id: f.p.tenantId }),
 };
 // Name each actor on each order, including out-of-scope orders. This keeps
 // assignment distinct from grant scope; import requires team membership first.
 for (const actor of Object.values(actors)) for (const team of teamIds) {
  if (team === f.demo.teamId && [actors.operative, actors.ownTeam].includes(actor)) continue;
  if (team === f.otherDemo.teamId && actor === actors.otherTeam) continue;
  await command(c, f, { kind: "team.move", membershipId: actor.member.membershipId, fromTeamId: null, toTeamId: team });
 }
 const assigned = Object.values(actors).map(a => a.member.membershipId);
 await reviseOrder(c, f, 2, assigned);
 // Multiple orders per scope, mixed due dates and priorities, including NULL.
 for (let n = 3; n <= 10; n++) await extraOrder(c, f, n, assigned, {
  teamId: teamIds[(n - 3) % teamIds.length], dueOn: n % 3 ? "2026-10-20" : null,
 });
 await ownerVisit(c, f, actors.operative!.member.membershipId);
 await ownerVisit(c, f, actors.ownTeam!.member.membershipId);
}, 120_000);
afterAll(async () => { await c?.close(); });

async function compare(actor: AuthenticatedMembership) {
 return withTenant(c.runtime, f.ctx, async db => {
  const args = [f.p.tenantId, actor.membershipId];
  const legacy = (await db.$client.query(assignedJobsQuery, args)).rows;
  const scoped = (await db.$client.query(assignedJobsByScopeQuery, args)).rows;
  expect(scoped).toEqual(legacy); // full rows, caller's own visit, and exact order
  return scoped;
 });
}

it("matches the old list for own/other team, branch and region grants, every role, unassigned and foreign members", async () => {
 const sizes: Record<string, number> = {};
 for (const [label, actor] of Object.entries(actors)) {
  const rows = await compare(actor.member);
  sizes[label] = rows.length;
  const actual = await new SiteVisitRepository(c.runtime).assignedJobs(f.ctx, actor.member);
  expect(actual).toEqual({ truncated: false, jobs: rows.map(r => ({ jobId: r.job_id, workOrderId: r.work_order_id, reference: r.reference, priority: r.priority, issuedOn: r.issued_on, dueOn: r.due_on, openVisitId: r.open_visit })) });
 }
 expect(sizes.ownTeam).toBeGreaterThan(1);
 expect(sizes.otherTeam).toBeGreaterThan(1);
 expect(sizes.branch).toBeGreaterThan(sizes.ownTeam!);
 expect(sizes.region).toBeGreaterThan(sizes.branch!);
 expect(sizes.tenant).toBeGreaterThan(sizes.region!);
 for (const role of forbiddenRoles) {
  expect(await compare(f.members[role].member)).toEqual([]);
  await expect(new SiteVisitRepository(c.runtime).assignedJobs(f.ctx, f.members[role].member)).rejects.toMatchObject({ code: "VISIT_FORBIDDEN" });
 }
 expect(await compare(f.unassigned.member)).toEqual([]);
 const foreign = await fixture(c);
 expect(await compare(foreign.p)).toEqual([]);
 await expect(new SiteVisitRepository(c.runtime).assignedJobs(foreign.ctx, actors.operative!.member)).rejects.toMatchObject({ code: "VISIT_FORBIDDEN" });
});

type Plan = { "Node Type": string; "Function Name"?: string; "Actual Loops": number; Plans?: Plan[] };
function authorityLoops(plan: Plan): number {
 return (plan["Node Type"] === "Function Scan" && plan["Function Name"] === "ent3b_visit_authority" ? plan["Actual Loops"] : 0)
  + (plan.Plans ?? []).reduce((sum, child) => sum + authorityLoops(child), 0);
}
it("evaluates authority once per assigned team scope rather than once per order", async () => {
 await withTenant(c.runtime, f.ctx, async db => {
  const args = [f.p.tenantId, actors.region!.member.membershipId];
  const loops: number[] = [];
  for (const query of [assignedJobsQuery, assignedJobsByScopeQuery]) {
   const result = await db.$client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`, args);
   loops.push(authorityLoops(result.rows[0]!["QUERY PLAN"][0].Plan as Plan));
  }
  expect(loops[0]).toBe(9);
  expect(loops[1]).toBe(teamIds.length);
  expect(loops[1]).toBeLessThan(loops[0]!);
 });
});

it("remains equivalent after grant revocation, team removal, reassignment, cancellation and membership revocation", async () => {
 await command(c, f, { kind: "grant.revoke", grantId: actors.ownTeam!.grant });
 expect(await compare(actors.ownTeam!.member)).toEqual([]);
 await command(c, f, { kind: "team.move", membershipId: actors.operative!.member.membershipId, fromTeamId: f.demo.teamId, toTeamId: f.otherDemo.teamId });
 const moved = await compare(actors.operative!.member);
 expect(moved.length).toBeGreaterThan(0);
 expect(moved.some(r => r.job_id === f.jobId)).toBe(false);
 // New current revision drops the region supervisor's assignment on the first job.
 await reviseOrder(c, f, 3, [actors.branch!.member.membershipId]);
 expect((await compare(actors.region!.member)).some(r => r.job_id === f.jobId)).toBe(false);
 await reviseOrder(c, f, 4, [], { status: "cancelled", lines: [] });
 expect((await compare(actors.branch!.member)).some(r => r.job_id === f.jobId)).toBe(false);
 await command(c, f, { kind: "membership.revoke", membershipId: actors.region!.member.membershipId });
 expect(await compare(actors.region!.member)).toEqual([]);
 await expect(new SiteVisitRepository(c.runtime).assignedJobs(f.ctx, actors.region!.member)).rejects.toMatchObject({ code: "VISIT_FORBIDDEN" });
 // Unknown identities never acquire authority from the representative job.
 expect(await compare({ ...f.p, membershipId: randomUUID() })).toEqual([]);
});
