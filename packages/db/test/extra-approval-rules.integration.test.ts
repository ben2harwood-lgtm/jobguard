// Synthetic PostgreSQL proofs. CI only: this sandbox cannot start PostgreSQL.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository } from "../src/index.js";
import { approveInput, chainWorld, cluster, command, demoRules, reviseRules, submitted, type Cluster } from "./extra-approval-chain-fixtures.js";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("Q08 two London working days skip weekends and preserve wall time over DST", async () => {
  for (const [start, expected] of [
    ["2026-11-06T14:00:00Z", "2026-11-10T14:00:00Z"],
    ["2026-03-27T14:00:00Z", "2026-03-31T13:00:00Z"],
    ["2026-10-23T13:00:00Z", "2026-10-27T14:00:00Z"],
  ]) {
    const row = (await c.admin.query("SELECT app.xa_wait_deadline($1,'{\"waitWorkingDays\":2}'::jsonb) deadline", [start])).rows[0];
    expect(row.deadline.toISOString()).toBe(new Date(expected!).toISOString());
  }
  const legacy = (await c.admin.query("SELECT app.xa_wait_deadline('2026-11-06T14:00Z','{\"timeLimitMinutes\":1}'::jsonb) deadline")).rows[0];
  expect(legacy.deadline.toISOString()).toBe("2026-11-06T14:01:00.000Z");
  const rules = structuredClone(demoRules);
  delete rules.bands[0]!.steps[0]!.waitWorkingDays;
  rules.bands[0]!.steps[0]!.escalationRole = null;
  rules.bands[0]!.steps[0]!.alternateRoles = [];
  const snap = (await c.admin.query("SELECT app.xa_requirement($1,40000) r", [rules])).rows[0].r;
  expect(snap.steps[0]).toMatchObject({ waitWorkingDays: 2, escalationRole: null, alternateRoles: [] });
});
it("Q04 first receipt wins a same-person repeat, with no second fact or audit, and revoked grants refuse replay", async () => {
  const w = await chainWorld(c), ctx = await w.ctx, repo = new ExtraApprovalRepository(c.runtime);
  const s = await submitted(c, w, 40000), actor = w.members.supervisor.member;
  const input = approveInput(s, 0);
  const first = await repo.approveExtraStep(ctx, actor, input);
  const count = async () => (await c.admin.query("SELECT (SELECT count(*) FROM app.extra_approval_step_fact WHERE request_id=$1)::int facts,(SELECT count(*) FROM app.audit_event WHERE tenant_id=$2)::int audits", [s.requestId, w.p.tenantId])).rows[0];
  const before = await count();
  expect(await repo.approveExtraStep(ctx, actor, { ...input, commandId: randomUUID() })).toEqual(first);
  expect(await count()).toEqual(before);
  await expect(repo.approveExtraStep(ctx, actor, { ...input, commandId: randomUUID(), netPence: s.net + 1 })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  await command(c, w, { kind: "grant.revoke", grantId: w.members.supervisor.grant });
  await expect(repo.approveExtraStep(ctx, actor, { ...input, commandId: randomUUID() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  expect(await count()).toMatchObject({ facts: before.facts });
});
it.each(["surveyor", "commercial_manager"] as const)("Q11 covered %s can withdraw an open request, but cannot change its final outcome", async role => {
  const w = await chainWorld(c), repo = new ExtraApprovalRepository(c.runtime), ctx = await w.ctx;
  const s = await submitted(c, w, 40000), actor = w.members[role].member;
  const input = { version: "withdraw-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, reasonCode: "not_done" };
  expect(await repo.withdrawExtra(ctx, actor, input)).toMatchObject({ state: "withdrawn", requestId: s.requestId });
  expect(await repo.withdrawExtra(ctx, actor, input)).toMatchObject({ state: "withdrawn" });
  await expect(repo.approveExtraStep(ctx, w.members.supervisor.member, approveInput(s, 0))).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE request_id=$1", [s.requestId])).rows).toEqual([{ kind: "withdrawn" }]);
});
it("Q06 thresholds are frozen per rule version; Q16 pricing alone never submits", async () => {
  const w = await chainWorld(c), repo = new ExtraApprovalRepository(c.runtime), ctx = await w.ctx;
  const s = await submitted(c, w, 100000);
  const before = (await c.admin.query("SELECT requirement,comparisons FROM app.extra_approval_request WHERE id=$1", [s.requestId])).rows;
  await reviseRules(c, w, { ...demoRules, clientApproval: { kind: "threshold", abovePence: 99999, beforeWorkAbovePence: 100001, timeLimitMinutes: 2880 } });
  expect((await c.admin.query("SELECT requirement,comparisons FROM app.extra_approval_request WHERE id=$1", [s.requestId])).rows).toEqual(before);
  const { newJob, raiseOn } = await import("./extra-approval-chain-fixtures.js");
  const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId);
  await repo.priceExtra(ctx, w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: 100000 });
  expect((await c.admin.query("SELECT id FROM app.extra_approval_request WHERE variation_id=$1", [extraId])).rows).toEqual([]);
});
it("Q08 without a backup the mandatory queue stays waiting and overdue, without an escalation fact", async () => {
  const w = await chainWorld(c), repo = new ExtraApprovalRepository(c.runtime), ctx = await w.ctx;
  const rules = structuredClone(demoRules);
  for (const band of rules.bands) for (const step of band.steps) {
    delete step.waitWorkingDays; step.escalationRole = null; step.alternateRoles = [];
  }
  await reviseRules(c, w, rules);
  const s = await submitted(c, w, 40000);
  // Test-owner clock fixture only: production runtime cannot mutate this immutable row.
  const owner = await c.admin.connect();
  try {
    await owner.query("BEGIN");
    await owner.query("ALTER TABLE app.extra_approval_request DISABLE TRIGGER immutable");
    await owner.query("UPDATE app.extra_approval_request SET server_recorded_at=clock_timestamp()-interval '7 days' WHERE id=$1", [s.requestId]);
    await owner.query("ALTER TABLE app.extra_approval_request ENABLE TRIGGER immutable");
    await owner.query("COMMIT");
  } catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }
  expect((await repo.escalateOverdue(ctx)).filter(r => r.request_id === s.requestId)).toEqual([]);
  expect((await repo.queue(ctx, w.members.supervisor.member.membershipId)).filter(r => r.request_id === s.requestId)).toMatchObject([{ lane: "mandatory", overdue: true, escalated: false }]);
  expect((await repo.queue(ctx, w.members.surveyor.member.membershipId)).filter(r => r.request_id === s.requestId)).toEqual([]);
  expect((await c.admin.query("SELECT id FROM app.extra_approval_outcome WHERE request_id=$1", [s.requestId])).rows).toEqual([]);
});
