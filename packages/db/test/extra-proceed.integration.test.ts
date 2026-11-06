// PostgreSQL CI only: this sandbox cannot start PostgreSQL.
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { extraProceed, ExtraApprovalRepository, withTenant, type AuthenticatedMembership } from "../src/index.js";
import { chainWorld, cluster, submitted, command, approveInput, newToken, emailOf, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";
import { snapshotRows } from "./upgrade-proof-utils.js";
let c: Cluster, w: ChainWorld;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await chainWorld(c); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("proceed is one immutable fact: replay, no approval/step skip/snapshot/pricing/billing/export effect; later approval preserves it", async () => {
 const ctx = await w.ctx, repo = new ExtraApprovalRepository(c.runtime), s = await submitted(c, w, 40000), actor = w.members.operative.member;
 const body = { version: "record-extra-proceed.v1", commandId: randomUUID(), requestId: s.requestId, reason: "Fictional operative proceeding before approval" };
 // Compare every business row, not just row counts: a statement must not mutate a requirement, fill a step,
 // emit approval events, create a price revision, a bill or an export.
 const snapshot = async () => Object.fromEntries(Object.entries(await snapshotRows(c.admin)).filter(([table]) => ![
  "app.extra_proceed_statement", "app.command_receipt", "app.command_lifecycle_claim", "app.audit_event", "audit_control.audit_head",
 ].includes(table)));
 const rollbackBefore = await snapshotRows(c.admin);
 const rollbackCommand = randomUUID();
 await expect(withTenant(c.runtime, ctx, async db => {
  await db.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb)", [s.jobId, s.extraId, actor.membershipId, JSON.stringify({ ...body, commandId: rollbackCommand })]);
  throw new Error("synthetic rollback after statement, receipt and audit");
 })).rejects.toThrow("synthetic rollback");
 expect(await snapshotRows(c.admin)).toEqual(rollbackBefore);
 const before = await snapshot();
 const [first, replay] = await Promise.all([extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, body), extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, body)]);
 expect(first).toEqual(replay); expect(first.history).toHaveLength(1);
 expect(first.history[0]).toMatchObject({ commandId: body.commandId, requestId: s.requestId, revisionHash: s.hash, actorMembershipId: actor.membershipId, reason: body.reason });
 expect(await snapshot()).toEqual(before);
 await expect(extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, { ...body, reason: "Changed" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
 for (const key of ["actorMembershipId", "tenantId", "recordedAt", "netPence", "requirement", "stepIndex"]) {
  await expect(extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, { ...body, [key]: randomUUID() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  await expect(withTenant(c.runtime, ctx, db => db.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb)", [s.jobId, s.extraId, actor.membershipId, JSON.stringify({ ...body, [key]: randomUUID() })]))).rejects.toMatchObject({ message: "INVALID_COMMAND" });
 }
 await repo.approveExtraStep(ctx, w.members.supervisor.member, approveInput(s, 0));
 expect((await extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId)).history).toEqual(first.history);
 expect(await extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, body)).toEqual(first);
 await expect(extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, { ...body, commandId: randomUUID() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 const audit = await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='command.succeeded' AND payload->'references'->>'commandId'=$2", [ctx.tenantId, body.commandId]);
 expect(audit.rows).toHaveLength(1); expect(JSON.stringify(audit.rows)).not.toContain(body.reason);
 for (const mutation of ["UPDATE app.extra_proceed_statement SET reason='forged'", "DELETE FROM app.extra_proceed_statement", "TRUNCATE app.extra_proceed_statement"]) {
  const owner = await c.admin.connect();
  try { await owner.query("BEGIN"); await owner.query("SET LOCAL ROLE jobguard_migration"); await owner.query("SELECT set_config('app.tenant_id',$1,true)", [ctx.tenantId]); await expect(owner.query(mutation)).rejects.toMatchObject({ code: "55000" }); }
  finally { await owner.query("ROLLBACK"); owner.release(); }
 }
 await expect(withTenant(c.runtime, ctx, db => db.$client.query("SELECT * FROM app.extra_proceed_statement"))).rejects.toMatchObject({ code: "42501" });
});
it("refuses wrong tenant/job/extra, unassigned or office actors, revoked members and unpriced/stale requests", async () => {
 const ctx = await w.ctx, s = await submitted(c, w, 150000), actor = w.members.operative.member, other = await chainWorld(c), otherCtx = await other.ctx;
 const body = { version: "record-extra-proceed.v1", commandId: randomUUID(), requestId: s.requestId, reason: "Fictional reason" };
 for (const member of [w.unassigned.member, w.members.supervisor.member, { ...actor, membershipId: randomUUID() } as AuthenticatedMembership])
  await expect(extraProceed(c.runtime, ctx, member, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, otherCtx, other.members.operative.member, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, ctx, other.members.operative.member, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, ctx, actor, randomUUID(), s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, ctx, actor, s.jobId, randomUUID(), body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 const unpriced = await submitted(c, w, null);
 await expect(extraProceed(c.runtime, ctx, actor, unpriced.jobId, unpriced.extraId, { ...body, requestId: unpriced.requestId })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 const repo = new ExtraApprovalRepository(c.runtime);
 await repo.priceExtra(ctx, w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId: unpriced.jobId, extraId: unpriced.extraId, netPence: 40000 });
 await expect(extraProceed(c.runtime, ctx, actor, unpriced.jobId, unpriced.extraId, { ...body, requestId: unpriced.requestId })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 const saved = await extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, body);
 const breach = await withTenant(c.runtime, ctx, async db => (await db.$client.query("SELECT app.xa_proceed_breaches($1,$2) ids", [s.jobId, s.extraId])).rows[0].ids);
 expect(breach).toEqual([s.requestId]);
 await command(c, w, { kind: "membership.revoke", membershipId: actor.membershipId });
 await expect(extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, { ...body, commandId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
 expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_proceed_statement WHERE tenant_id=$1 AND id=$2", [ctx.tenantId, saved.history[0]!.statementId])).rows[0].n).toBe(1);
});

it("a required-preapproval statement reaches the client breach view without authorizing or skipping steps; later approval cannot erase it", async () => {
 const f = await chainWorld(c), ctx = await f.ctx, repo = new ExtraApprovalRepository(c.runtime), s = await submitted(c, f, 150000);
 const first = await extraProceed(c.runtime, ctx, f.members.operative.member, s.jobId, s.extraId,
  { version: "record-extra-proceed.v1", commandId: randomUUID(), requestId: s.requestId, reason: "Fictional proceed statement" });
 await expect(repo.approveExtraStep(ctx, f.supervisor2.member, approveInput(s, 1))).rejects.toMatchObject({ code: "STEP_OUT_OF_ORDER" });
 await repo.approveExtraStep(ctx, f.members.supervisor.member, approveInput(s, 0));
 await repo.approveExtraStep(ctx, f.supervisor2.member, approveInput(s, 1));
 const email = await emailOf(c, f, f.members.client_approver.member.membershipId), token = newToken();
 await repo.issueClientApproval(ctx, f.members.owner.member, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
  approverMembershipId: f.members.client_approver.member.membershipId, recipient: email, linkToken: token, expiresAt: new Date(Date.now() + 3600000) });
 const view = { version: "client-approval-view.v1", jobId: s.jobId, requestId: s.requestId, linkToken: token, email };
 expect(await repo.clientApprovalView(ctx, f.members.client_approver.member, view)).toMatchObject({ doneWithoutRequiredPreapproval: true, workTiming: null });
 await repo.decideClientApproval(ctx, f.members.client_approver.member, { ...view, version: "decide-client-approval.v1", commandId: randomUUID(), revisionHash: s.hash,
  netPence: s.net, decision: "approve", fictionalRoleName: "Fictional client", actualTesterReference: "test:synthetic" });
 expect((await extraProceed(c.runtime, ctx, f.members.operative.member, s.jobId, s.extraId)).history).toEqual(first.history);
 // The link has been consumed, so inspect the same read seam after the authenticated decision.
 expect(await withTenant(c.runtime, ctx, async db => (await db.$client.query("SELECT app.xa_proceed_breaches($1,$2) ids", [s.jobId, s.extraId])).rows[0].ids)).toEqual([s.requestId]);
 await repo.reviseExtra(ctx, f.members.surveyor.member, { version: "revise-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, netPence: 40000 });
 expect((await extraProceed(c.runtime, ctx, f.members.operative.member, s.jobId, s.extraId)).history).toEqual(first.history);
});
