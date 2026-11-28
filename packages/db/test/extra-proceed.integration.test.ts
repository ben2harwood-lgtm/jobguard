import { priceV2, reviseV2 } from "./extra-price-v2-fixtures.js";
import { bindIssuedCredential } from "../src/tenant-context.js";
import { testActorContext, testTenantContext } from "./tenant-context-test-utils.js";
// PostgreSQL CI only: this sandbox cannot start PostgreSQL.
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { extraProceed, WorkOrderRepository, demoFile, demoRow, ExtraApprovalRepository, withTenant, type AuthenticatedMembership } from "../src/index.js";
import { chainWorld, cluster, submitted, command, approveInput, newToken, emailOf, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";
import { snapshotRows } from "./upgrade-proof-utils.js";
let c: Cluster, w: ChainWorld;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await chainWorld(c); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("proceed is one immutable fact: replay, no approval/step skip/snapshot/pricing/billing/export effect; later approval preserves it", async () => {
 const actor = w.members.operative.member, ctx = await testActorContext(c.admin, w.ctx, actor), repo = new ExtraApprovalRepository(c.runtime), s = await submitted(c, w, 40000);
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
 const [first, replay] = await Promise.all([extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, s.extraId, body), extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, s.extraId, body)]);
 expect(first).toEqual(replay); expect(first.history).toHaveLength(1);
 expect(first.history[0]).toMatchObject({ commandId: body.commandId, requestId: s.requestId, revisionHash: s.hash, actorMembershipId: actor.membershipId, reason: body.reason });
 expect(await snapshot()).toEqual(before);
 await expect(extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, s.extraId, { ...body, reason: "Changed" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
 for (const key of ["actorMembershipId", "tenantId", "recordedAt", "netPence", "requirement", "stepIndex"]) {
  await expect(extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, s.extraId, { ...body, [key]: randomUUID() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  await expect(withTenant(c.runtime, ctx, db => db.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb)", [s.jobId, s.extraId, actor.membershipId, JSON.stringify({ ...body, [key]: randomUUID() })]))).rejects.toMatchObject({ message: "INVALID_COMMAND" });
 }
 await repo.approveExtraStep(await testActorContext(c.admin, ctx, w.members.supervisor.member), w.members.supervisor.member, approveInput(s, 0));
 expect((await extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, s.extraId)).history).toEqual(first.history);
 expect(await extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, s.extraId, body)).toEqual(first);
 await expect(extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, s.extraId, { ...body, commandId: randomUUID() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 const audit = await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='command.succeeded' AND payload->'references'->>'commandId'=$2", [ctx.tenantId, body.commandId]);
 expect(audit.rows).toHaveLength(1); expect(JSON.stringify(audit.rows)).not.toContain(body.reason);
 for (const mutation of ["UPDATE app.extra_proceed_statement SET reason='forged'", "DELETE FROM app.extra_proceed_statement", "TRUNCATE app.extra_proceed_statement"]) {
  const owner = await c.admin.connect();
  try { await owner.query("BEGIN"); await bindIssuedCredential(owner, ctx); await owner.query("SET LOCAL ROLE jobguard_migration"); await owner.query("SELECT set_config('app.tenant_id',$1,true)", [ctx.tenantId]); await expect(owner.query(mutation)).rejects.toMatchObject({ code: "55000" }); }
  finally { await owner.query("ROLLBACK"); owner.release(); }
 }
 await expect(withTenant(c.runtime, ctx, db => db.$client.query("SELECT * FROM app.extra_proceed_statement"))).rejects.toMatchObject({ code: "42501" });
});
it("refuses wrong tenant/job/extra, unassigned or office actors, revoked members and unpriced/stale requests", async () => {
 const ctx = await w.ctx, s = await submitted(c, w, 150000), actor = w.members.operative.member, other = await chainWorld(c), otherCtx = await other.ctx;
 const body = { version: "record-extra-proceed.v1", commandId: randomUUID(), requestId: s.requestId, reason: "Fictional reason" };
 for (const member of [w.unassigned.member, w.members.supervisor.member, { ...actor, membershipId: randomUUID() } as AuthenticatedMembership])
  await expect(extraProceed(c.runtime, testTenantContext(ctx.tenantId, { membershipId: member.membershipId }), member, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, await testActorContext(c.admin, otherCtx, other.members.operative.member), other.members.operative.member, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, await testActorContext(c.admin, ctx, other.members.operative.member), other.members.operative.member, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, randomUUID(), s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, randomUUID(), body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 const unpriced = await submitted(c, w, null);
 await expect(extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, unpriced.jobId, unpriced.extraId, { ...body, requestId: unpriced.requestId })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 const repo = new ExtraApprovalRepository(c.runtime);
 await repo.priceExtra(await testActorContext(c.admin, ctx, w.members.surveyor.member), w.members.surveyor.member, priceV2({ commandId: randomUUID(), jobId: unpriced.jobId, extraId: unpriced.extraId, netPence: 40000 }));
 await expect(extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, unpriced.jobId, unpriced.extraId, { ...body, requestId: unpriced.requestId })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 const saved = await extraProceed(c.runtime, await testActorContext(c.admin, ctx, actor), actor, s.jobId, s.extraId, body);
 const breach = await withTenant(c.runtime, ctx, async db => (await db.$client.query("SELECT app.xa_proceed_breaches($1,$2) ids", [s.jobId, s.extraId])).rows[0].ids);
 expect(breach).toEqual([s.requestId]);
 await command(c, w, { kind: "membership.revoke", membershipId: actor.membershipId });
 // Exercise the repository revocation guard without trying to authenticate the revoked member.
 await expect(extraProceed(c.runtime, testTenantContext(ctx.tenantId, { membershipId: actor.membershipId, bindRequest: false }), actor, s.jobId, s.extraId, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(extraProceed(c.runtime, testTenantContext(ctx.tenantId, { membershipId: actor.membershipId, bindRequest: false }), actor, s.jobId, s.extraId, { ...body, commandId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
 expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_proceed_statement WHERE tenant_id=$1 AND id=$2", [ctx.tenantId, saved.history[0]!.statementId])).rows[0].n).toBe(1);
});

it("a required-preapproval statement reaches the client breach view without authorizing or skipping steps; later approval cannot erase it", async () => {
 const f = await chainWorld(c), ctx = await f.ctx, repo = new ExtraApprovalRepository(c.runtime), s = await submitted(c, f, 150000);
 const first = await extraProceed(c.runtime, await testActorContext(c.admin, ctx, f.members.operative.member), f.members.operative.member, s.jobId, s.extraId,
  { version: "record-extra-proceed.v1", commandId: randomUUID(), requestId: s.requestId, reason: "Fictional proceed statement" });
 await expect(repo.approveExtraStep(await testActorContext(c.admin, ctx, f.supervisor2.member), f.supervisor2.member, approveInput(s, 1))).rejects.toMatchObject({ code: "STEP_OUT_OF_ORDER" });
 await repo.approveExtraStep(await testActorContext(c.admin, ctx, f.members.supervisor.member), f.members.supervisor.member, approveInput(s, 0));
 await repo.approveExtraStep(await testActorContext(c.admin, ctx, f.supervisor2.member), f.supervisor2.member, approveInput(s, 1));
 const email = await emailOf(c, f, f.members.client_approver.member.membershipId), token = newToken();
 // Q10 (0642): a job-granted surveyor or commercial manager sends client approvals, not the owner.
 await repo.issueClientApproval(await testActorContext(c.admin, ctx, f.members.surveyor.member), f.members.surveyor.member, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
  approverMembershipId: f.members.client_approver.member.membershipId, recipient: email, linkToken: token, expiresAt: new Date(Date.now() + 3600000) });
 const view = { version: "client-approval-view.v1", jobId: s.jobId, requestId: s.requestId, linkToken: token, email };
 expect(await repo.clientApprovalView(await testActorContext(c.admin, ctx, f.members.client_approver.member), f.members.client_approver.member, view)).toMatchObject({ doneWithoutRequiredPreapproval: true, workTiming: null });
 await repo.decideClientApproval(await testActorContext(c.admin, ctx, f.members.client_approver.member), f.members.client_approver.member, { ...view, version: "decide-client-approval.v1", commandId: randomUUID(), revisionHash: s.hash,
  netPence: s.net, decision: "approve", fictionalRoleName: "Fictional client", actualTesterReference: "test:synthetic" });
 expect((await extraProceed(c.runtime, await testActorContext(c.admin, ctx, f.members.operative.member), f.members.operative.member, s.jobId, s.extraId)).history).toEqual(first.history);
 // The link has been consumed, so inspect the same read seam after the authenticated decision.
 expect(await withTenant(c.runtime, ctx, async db => (await db.$client.query("SELECT app.xa_proceed_breaches($1,$2) ids", [s.jobId, s.extraId])).rows[0].ids)).toEqual([s.requestId]);
 await repo.reviseExtra(await testActorContext(c.admin, ctx, f.members.surveyor.member), f.members.surveyor.member, await reviseV2(c, { commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, netPence: 40000 }));
 expect((await extraProceed(c.runtime, await testActorContext(c.admin, ctx, f.members.operative.member), f.members.operative.member, s.jobId, s.extraId)).history).toEqual(first.history);
});

// Both operatives have genuine current LogSiteExtra coverage of this same job.
it("only the raiser may append/replay; covered colleagues and supervisors retain reads, with no refused-write effects", async () => {
 const f = await chainWorld(c), s = await submitted(c, f, 150000), a = f.members.operative.member, b = f.unassigned.member;
 const n = f.nextOrder - 1;
 const imported = await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-two-operatives.csv", kind: "csv",
  csv: demoFile([demoRow(f.demo, n, { expectedRevision: 1, assignedMembershipIds: [a.membershipId, b.membershipId] })]) });
 expect(imported.rows[0]?.outcome).toBe("revised");
 const actors = [a, b, f.members.supervisor.member];
 const contexts = await Promise.all(actors.map(actor => testActorContext(c.admin, f.ctx, actor)));
 for (const [i, actor] of [a, b].entries()) {
  expect(await withTenant(c.runtime, contexts[i]!, async db => (await db.$client.query(
   "SELECT decision FROM app.ent3a_extra_authority($1,'LogSiteExtra',$2)", [actor.membershipId, s.jobId])).rows[0].decision)).toBe("allowed");
 }
 const body = { version: "record-extra-proceed.v1", commandId: randomUUID(), requestId: s.requestId, reason: "Fictional raiser's decision" };
 const rollbackBefore = await snapshotRows(c.admin);
 await expect(withTenant(c.runtime, contexts[0]!, async db => {
  const result = await db.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb) result",
   [s.jobId, s.extraId, a.membershipId, JSON.stringify(body)]);
  expect(result.rows[0].result.history).toHaveLength(1);
  throw new Error("raiser SQL append rollback");
 })).rejects.toThrow("raiser SQL append rollback");
 expect(await snapshotRows(c.admin)).toEqual(rollbackBefore);
 const first = await extraProceed(c.runtime, contexts[0]!, a, s.jobId, s.extraId, body);
 expect(await extraProceed(c.runtime, contexts[0]!, a, s.jobId, s.extraId, body)).toEqual(first);
 expect(first.history).toHaveLength(1);
 // Replay the same command directly as the bound runtime actor too.
 const directReplay = await withTenant(c.runtime, contexts[0]!, async db => (await db.$client.query(
  "SELECT app.xa_proceed($1,$2,$3,$4::jsonb) result", [s.jobId, s.extraId, a.membershipId, JSON.stringify(body)])).rows[0].result);
 expect(directReplay).toEqual(first);
 const history = await extraProceed(c.runtime, contexts[0]!, a, s.jobId, s.extraId);
 for (const [i, actor] of actors.entries())
  expect(await extraProceed(c.runtime, contexts[i]!, actor, s.jobId, s.extraId)).toEqual(history);
 const before = await snapshotRows(c.admin);
 for (const i of [1, 2]) {
  for (const raw of [body, { ...body, commandId: randomUUID() }]) {
   await expect(extraProceed(c.runtime, contexts[i]!, actors[i]!, s.jobId, s.extraId, raw)).rejects.toMatchObject({ code: "NOT_FOUND" });
   await expect(withTenant(c.runtime, contexts[i]!, db => db.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb)",
    [s.jobId, s.extraId, actors[i]!.membershipId, JSON.stringify(raw)]))).rejects.toMatchObject({ code: "P0002", message: "NOT_FOUND" });
   expect(await snapshotRows(c.admin)).toEqual(before);
  }
 }
 // Binding B's request cannot be used to supply A as the SQL actor.
 await expect(withTenant(c.runtime, contexts[1]!, db => db.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb)",
  [s.jobId, s.extraId, a.membershipId, JSON.stringify({ ...body, commandId: randomUUID() })]))).rejects.toThrow();
 expect(await snapshotRows(c.admin)).toEqual(before);
 // Scratch mutation: remove ONLY the new raiser predicate. The same B refusal
 // assertion must fail. Always restore the installed body, including on failure.
 const definition = (await c.admin.query("SELECT pg_get_functiondef('app.xa_proceed(uuid,uuid,uuid,jsonb)'::regprocedure) definition")).rows[0].definition as string;
 const predicate = " AND o.raising_membership_id=p_actor";
 expect(definition.split(predicate)).toHaveLength(2);
 const assertRefused = (result: string) => expect(result).toBe("NOT_FOUND");
 const attempt = () => extraProceed(c.runtime, contexts[1]!, b, s.jobId, s.extraId, { ...body, commandId: randomUUID() })
  .then(() => "allowed", (error: { code: string }) => error.code);
 assertRefused(await attempt());
 try {
  await c.admin.query(definition.replace(predicate, ""));
  const mutant = await attempt();
  expect(mutant).toBe("allowed");
  expect(() => assertRefused(mutant)).toThrow();
 } finally { await c.admin.query(definition); }
 assertRefused(await attempt());
 expect((await c.admin.query("SELECT pg_get_functiondef('app.xa_proceed(uuid,uuid,uuid,jsonb)'::regprocedure) definition")).rows[0].definition).toBe(definition);
}, 240_000);

it("expired operative sessions and memberships refuse new statements and replays without effects", async () => {
 for (const expired of ["session", "membership"]) {
  const f = await chainWorld(c), s = await submitted(c, f, 40000), actor = f.members.operative.member;
  const ctx = await testActorContext(c.admin, f.ctx, actor);
  const body = { version: "record-extra-proceed.v1", commandId: randomUUID(), requestId: s.requestId, reason: "Fictional reason" };
  await extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, body);
  if (expired === "session")
   await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1", [actor.identityUserId]);
  else
   await c.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [actor.tenantId, actor.membershipId]);
  const before = await snapshotRows(c.admin);
  for (const raw of [body, { ...body, commandId: randomUUID() }])
   await expect(extraProceed(c.runtime, ctx, actor, s.jobId, s.extraId, raw)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await snapshotRows(c.admin)).toEqual(before);
 }
});
