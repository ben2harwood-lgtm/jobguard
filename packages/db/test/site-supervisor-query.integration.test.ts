import { testActorContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { SiteExtraRepository } from "../src/site-extra-repository.js";
import { ExtraRepository } from "../src/extra-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { cluster, siteFixture, newOrder, lineIds, reviseOrder, type Cluster } from "./site-extra-pricing-fixtures.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 90_000);
afterAll(async () => { await c?.close(); });
it("immutable query: replay, conflict, tenant/assignment/cancellation refusal, stale revision and zero extra effects", async () => {
 const f = await siteFixture(c), other = await siteFixture(c), repo = new SiteExtraRepository(c.runtime);
 const order = await newOrder(c, f, [["a", "FIT-LOCK", "2"]]);
 const line = (await lineIds(c, f.p.tenantId, order.revisionId)).a!;
 const body = { version: "record-site-supervisor-query.v1", commandId: randomUUID(), orderLineScopeItemId: line.scopeItemId, sorCode: "FIT-LOCK", quantity: "1", expectedOrderRevisionId: order.revisionId };
 const actor = f.members.operative.member;
 const raise = vi.spyOn(ExtraRepository.prototype, "raiseExtra");
 const count = async () => (await c.admin.query("SELECT (SELECT count(*) FROM app.variation) variation,(SELECT count(*) FROM app.extra_origin) origin,(SELECT count(*) FROM app.extra_sor_revision) price,(SELECT count(*) FROM app.variation_revision) revisions")).rows[0];
 const before = await count();
 try {
  for (const [ctx, member, job] of [[f.ctx, f.unassigned.member, order.jobId], [other.ctx, other.members.operative.member, order.jobId], [f.ctx, actor, other.jobId]] as const) {
   await expect(repo.recordSupervisorQuery(await testActorContext(c.admin, ctx, member), member, job, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await expect(repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId, { ...body, amount: 100 })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  // Even a direct runtime call cannot smuggle an amount around the Zod boundary.
  await expect(withTenant(c.runtime, await testActorContext(c.admin, f.ctx, actor), db => db.$client.query("SELECT app.ent3_supervisor_query($1,$2,$3::jsonb)", [order.jobId, actor.membershipId, JSON.stringify({ ...body, amount: 100 })]))).rejects.toMatchObject({ message: "INVALID_COMMAND" });
  const [first, second] = await Promise.all([repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId, body), repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId, body)]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({ jobId: order.jobId, orderRevisionId: order.revisionId, orderLineScopeItemId: line.scopeItemId, quantity: "1", operativeMembershipId: actor.membershipId });
  expect(first.recordedAt).toEqual(expect.any(String));
  for (const change of [{ quantity: "2" }, { sorCode: "OTHER" }, { expectedOrderRevisionId: randomUUID() }]) {
   await expect(repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId, { ...body, ...change })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  }
  expect((await repo.supervisorQueries(await testActorContext(c.admin, f.ctx, f.members.supervisor.member), f.members.supervisor.member, order.jobId)).queries).toEqual([first]);
  await expect(repo.supervisorQueries(await testActorContext(c.admin, f.ctx, f.otherSupervisor.member), f.otherSupervisor.member, order.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.supervisorQueries(await testActorContext(c.admin, other.ctx, other.members.supervisor.member), other.members.supervisor.member, order.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.supervisorQueries(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const revised = await reviseOrder(c, f, order, [["a", "FIT-LOCK", "3"]], { assignedMembershipIds: [actor.membershipId, f.unassigned.member.membershipId] });
  await expect(repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, f.unassigned.member), f.unassigned.member, order.jobId, body)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect(await repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId, body)).toEqual(first);
  await expect(repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId, { ...body, commandId: randomUUID() })).rejects.toMatchObject({ code: "ORDER_LINE_NOT_FOUND" });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.site_supervisor_query WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId, order.jobId])).rows[0].n).toBe(1);
  await expect(repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId, { ...body, commandId: randomUUID(), expectedOrderRevisionId: revised.revisionId, quantity: "4" })).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
  const owner = await c.admin.connect();
  try {
   await owner.query("BEGIN"); await owner.query("SET LOCAL ROLE jobguard_migration");
   await owner.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
   await expect(owner.query("UPDATE app.site_supervisor_query SET quantity='2' WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, first.queryId])).rejects.toMatchObject({ code: "55000" });
  } finally { await owner.query("ROLLBACK"); owner.release(); }
  await reviseOrder(c, f, revised, [], { status: "cancelled", assignedMembershipIds: [] });
  await expect(repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, order.jobId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const fresh = await newOrder(c, f, [["a", "FIT-LOCK", "2"]]);
  await reviseOrder(c, f, fresh, [], { status: "cancelled", assignedMembershipIds: [] });
  await expect(repo.recordSupervisorQuery(await testActorContext(c.admin, f.ctx, actor), actor, fresh.jobId, { ...body, commandId: randomUUID(), expectedOrderRevisionId: fresh.revisionId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.supervisorQueries(await testActorContext(c.admin, f.ctx, f.members.supervisor.member), f.members.supervisor.member, fresh.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await count()).toEqual(before); expect(raise).not.toHaveBeenCalled();
  await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("UPDATE app.site_supervisor_query SET quantity='2' WHERE id=$1", [first.queryId]))).rejects.toMatchObject({ code: "42501" });
  const audit = await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='command.succeeded' AND payload->'references'->>'commandId'=$2", [f.p.tenantId, body.commandId]);
  expect(audit.rows).toHaveLength(1);
 } finally { raise.mockRestore(); }
});
