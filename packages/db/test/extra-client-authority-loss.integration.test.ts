import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ActionExecutor, ExtraApprovalRepository, withTenant } from "../src/index.js";
import { ContractorBundleCheckApplication } from "../../../apps/api/src/evidence-bundle.application.js";
import { storage } from "./site-extra-evidence-fixtures.js";
import { cluster, chainWorld, submitted, approveInput, emailOf, newToken, command, raiseOn, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";

let c: Cluster, identity: Pool;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster();
  await c.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'synthetic'");
  identity = new Pool({ ...c.config, database: c.admin.options.database, user: "jobguard_identity", max: 2 });
}, 180_000);
afterAll(async () => { await identity?.end(); await c?.close(); vi.unstubAllEnvs(); });

async function invitation(w: ChainWorld, onJob?: string) {
  const repo = new ExtraApprovalRepository(c.runtime), ctx = await w.ctx;
  let s: Awaited<ReturnType<typeof submitted>>;
  if (onJob) {
    const extraId = await raiseOn(c, w, onJob);
    await repo.priceExtra(ctx, w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId: onJob, extraId, netPence: 150000 });
    const result = await repo.submitExtra(ctx, w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId: onJob, extraId });
    s = { jobId: onJob, extraId, requestId: result.requestId as string, hash: result.revisionHash as string, net: 150000, result };
  } else s = await submitted(c, w, 150000);
  await repo.approveExtraStep(ctx, w.members.supervisor.member, approveInput(s, 0));
  await repo.approveExtraStep(ctx, w.supervisor2.member, approveInput(s, 1));
  return issueInvitation(w, repo, ctx, s);
}
async function issueInvitation(w: ChainWorld, repo: ExtraApprovalRepository, ctx: Awaited<ChainWorld["ctx"]>,
  s: Awaited<ReturnType<typeof submitted>>, actor = w.members.client_approver.member.membershipId) {
  const token = newToken(), signinDigest = randomUUID().replaceAll("-", "").repeat(2);
  const sd = randomUUID().replaceAll("-", "").repeat(2);
  const recipient = await emailOf(c, w, actor);
  const sent = await repo.issueClientApproval(ctx, w.members.surveyor.member, {
    version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
    approverMembershipId: actor, recipient, linkToken: token, signinDigest, expiresAt: new Date(Date.now() + 3600_000),
  });
  const use = (digest = signinDigest, operation = "redeem") => identity.query(
    "SELECT identity.extra_customer_use($1,$2,$3,$4,$5,$6) result",
    [w.p.tenantId, s.jobId, actor, digest, operation === "redeem" ? sd : null, operation]);
  const run = (action: string) => identity.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result",
    [w.p.tenantId, s.jobId, actor, sd, action === "decide" ? {
      version: "extra-customer.v1", action, jobId: s.jobId, requestId: s.requestId, commandId: randomUUID(),
      revisionHash: s.hash, netPence: s.net, decision: "approve",
    } : { version: "extra-customer.v1", action, jobId: s.jobId }]).then(r => r.rows[0].result);
  const view = () => repo.clientApprovalView(ctx, w.members.client_approver.member, {
    version: "client-approval-view.v1", jobId: s.jobId, requestId: s.requestId, linkToken: token, email: recipient,
  });
  return { w, repo, ctx, s, sent, actor, use, run, view, sd, token, recipient };
}
async function revoke(w: ChainWorld, kind: string) {
  if (kind === "membership") await command(c, w, { kind: "membership.revoke", membershipId: w.members.client_approver.member.membershipId });
  else await command(c, w, { kind: "grant.revoke", grantId: kind === "client grant" ? w.members.client_approver.grant : w.members.surveyor.grant });
}
const facts = async (request: string) => (await c.admin.query(
  "SELECT to_jsonb(f) fact FROM app.extra_approval_step_fact f WHERE request_id=$1 ORDER BY step_index", [request])).rows;

it("A3 control: approver who keeps authority is not over-cancelled; send delivers once and link works", async () => {
  const w = await chainWorld(c), lost = await invitation(w);
  const kept = await issueInvitation(w, lost.repo, lost.ctx, lost.s, w.client2.member.membershipId);
  await command(c, w, { kind: "membership.revoke", membershipId: lost.actor });
  const deliver = vi.fn(async () => ({ kind: "succeeded" as const, providerReference: "fictional" }));
  const adapter = { name: "fake_email" as const, supportsProviderDeduplication: true, deliver, reconcile: async () => "unknown" as const };
  const executor = new ActionExecutor(c.runtime, new Map([["fake_email", adapter]]), { emit: vi.fn() });
  const status = async (id: string) => (await c.admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [id])).rows[0].status;
  await executor.execute(lost.ctx, lost.sent.outboxActionId as string);
  expect(await status(lost.sent.outboxActionId as string)).toBe("cancelled");
  expect(await status(kept.sent.outboxActionId as string)).toBe("pending");
  await executor.execute(kept.ctx, kept.sent.outboxActionId as string);
  await executor.execute(kept.ctx, kept.sent.outboxActionId as string);
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(await status(kept.sent.outboxActionId as string)).toBe("succeeded");
  expect((await kept.use()).rows[0].result).toMatchObject({ extraApprover: true });
  expect(await kept.run("decide")).toMatchObject({ state: expect.any(String) });
});

it("A8 legacy runtime decide path refuses an unused link after sender grant loss", async () => {
  const f = await invitation(await chainWorld(c));
  await revoke(f.w, "sender grant");
  await expect(f.repo.decideClientApproval(f.ctx, f.w.members.client_approver.member, {
    version: "decide-client-approval.v1", commandId: randomUUID(), jobId: f.s.jobId, requestId: f.s.requestId,
    linkToken: f.token, email: f.recipient, revisionHash: f.s.hash, netPence: f.s.net, decision: "approve",
    fictionalRoleName: "Fictional Housing Approver", actualTesterReference: "tester:practice-ben",
  })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_client_link_closure WHERE link_id=$1", [f.sent.linkId])).rows[0].n).toBe(0);
});

it.each(["membership", "client grant", "sender grant"])("Q14 %s loss cancels pending and retryable sends, preserves decisions and current-authority reads", async kind => {
  const w = await chainWorld(c), history = await invitation(w);
  await history.use(); await history.run("decide");
  const before = await facts(history.s.requestId);
  // Same approver/job: one claim cancels all unused invitations.
  const pending = await invitation(w, history.s.jobId), retry = await invitation(w, history.s.jobId);
  // Also exercise a pre-existing session: loss must refuse resolve as well as redeem.
  await retry.use();
  await c.admin.query("UPDATE app.action_outbox SET status='retryable' WHERE id=$1", [retry.sent.outboxActionId]);
  await revoke(w, kind);
  await expect(pending.use()).rejects.toMatchObject({ code: "42501" });
  await expect(retry.use(retry.sd, "resolve")).rejects.toMatchObject({ code: "42501" });
  await expect(pending.view()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  const deliver = vi.fn(async () => ({ kind: "succeeded" as const, providerReference: "fictional" }));
  const adapter = { name: "fake_email" as const, supportsProviderDeduplication: true, deliver, reconcile: async () => "unknown" as const };
  const executor = new ActionExecutor(c.runtime, new Map([["fake_email", adapter]]), { emit: vi.fn() });
  await executor.execute(pending.ctx, pending.sent.outboxActionId as string);
  expect((await c.admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [retry.sent.outboxActionId])).rows).toEqual([{ status: "cancelled" }]);
  for (const f of [pending, retry]) {
    await executor.execute(f.ctx, f.sent.outboxActionId as string);
    await executor.execute(f.ctx, f.sent.outboxActionId as string);
    expect((await c.admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [f.sent.outboxActionId])).rows).toEqual([{ status: "cancelled" }]);
    expect((await c.admin.query("SELECT 1 FROM app.action_attempt WHERE action_id=$1", [f.sent.outboxActionId])).rows).toEqual([]);
  }
  expect(deliver).not.toHaveBeenCalled();
  expect(await facts(history.s.requestId)).toEqual(before);
  // The current supervisor reads the retained decision using the runtime role.
  const readable = await withTenant(c.runtime, history.ctx, db => db.$client.query(
    `SELECT f.id FROM app.extra_approval_step_fact f WHERE f.tenant_id=$1 AND f.request_id=$2
      AND app.contractor_job_allowed($3,'job.read',f.job_id)`,
    [w.p.tenantId, history.s.requestId, w.members.supervisor.member.membershipId]));
  expect(readable.rows).toHaveLength(3);
  if (kind === "sender grant") {
    expect(await history.run("history")).toMatchObject({ items: [{ requestId: history.s.requestId, decision: "approve" }] });
    const revokedRead = await withTenant(c.runtime, history.ctx, db => db.$client.query(
      "SELECT 1 WHERE app.contractor_job_allowed($1,'job.read',$2)", [w.members.surveyor.member.membershipId, history.s.jobId]));
    expect(revokedRead.rows).toEqual([]);
  } else {
    await expect(history.run("history")).rejects.toMatchObject({ code: "42501" });
  }
  if (kind === "client grant") {
    await command(c, w, { kind: "grant.create", membershipId: history.actor, role: "client_approver",
      scope: { kind: "client", id: w.demo.clientId }, contractId: w.demo.contractId });
    expect(await history.run("history")).toMatchObject({ items: [{ requestId: history.s.requestId, decision: "approve" }] });
    await expect(pending.use()).rejects.toMatchObject({ code: "42501" });
    await expect(retry.use(retry.sd, "resolve")).rejects.toMatchObject({ code: "42501" });
  }
});

it("Q14 client session has no export action and stores no refusal", async () => {
  const f = await invitation(await chainWorld(c)); await f.use(); await f.run("decide");
  const before = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.w.p.tenantId])).rows;
  await expect(f.run("export")).rejects.toMatchObject({ code: "42501", message: "CUSTOMER_REFUSED" });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.w.p.tenantId])).rows).toEqual(before);
});

it("Q14 contractor bundle check returns only verification, and refuses export input", async () => {
  const f = await invitation(await chainWorld(c)); await f.use(); await f.run("decide");
  const app = new ContractorBundleCheckApplication(c.runtime, storage);
  const input = { version: "contractor-bundle-query.v1", jobId: f.s.jobId, extraId: f.s.extraId, requestId: f.s.requestId };
  const result = await app.check(f.ctx, f.w.members.surveyor.member, input);
  expect(result.reason).toBeNull();
  expect(result.report?.content).toBe("intact");
  expect(Object.keys(result).sort()).toEqual(["manifestDigest", "reason", "report", "sections", "version"]);
  const bytes = JSON.stringify(result);
  for (const privateValue of [f.actor, f.s.requestId, f.sent.linkId, "extra_approval_step_fact", "server_recorded_at", "bundle_text"])
    expect(bytes).not.toContain(privateValue);
  await expect(app.check(f.ctx, f.w.members.surveyor.member, { ...input, export: true }))
    .rejects.toMatchObject({ code: "INVALID_INPUT" });
});

// CI-only negative proof: mutate a scratch function body, observe the cancelled
// assertion would fail, restore the exact catalog definition before leaving.
it("Q14 negative mutation: removing the SQL cancellation makes the cancel case fail", async () => {
  const f = await invitation(await chainWorld(c)); await revoke(f.w, "client grant");
  const definition = (await c.admin.query("SELECT pg_get_functiondef('app.xc_cancel_authority_loss(uuid)'::regprocedure) AS sql")).rows[0].sql as string;
  const scratch = definition.replace(/AS \$function\$[\s\S]*\$function\$/u, "AS $function$ BEGIN RETURN false; END $function$");
  expect(scratch).not.toBe(definition);
  const cancel = () => withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT app.xc_cancel_authority_loss($1)", [f.sent.outboxActionId]));
  try {
    await c.admin.query(scratch);
    await cancel();
    const status = (await c.admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [f.sent.outboxActionId])).rows[0].status;
    expect(() => expect(status).toBe("cancelled")).toThrow();
  } finally { await c.admin.query(definition); }
  await cancel();
  expect((await c.admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [f.sent.outboxActionId])).rows).toEqual([{ status: "cancelled" }]);
  expect((await c.admin.query("SELECT 1 FROM app.action_attempt WHERE action_id=$1", [f.sent.outboxActionId])).rows).toEqual([]);
});
