import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, withTenant } from "../src/index.js";
import { sha256Hex } from "../src/work-order-repository.js";
import { testActorContext, testTenantContext } from "./tenant-context-test-utils.js";
import { cluster, chainWorld, submitted, raiseOn, approveInput, emailOf, newToken, command,
  type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";

let c: Cluster;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster();
}, 180_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

async function fixture(ready = false) {
  const w = await chainWorld(c), s = await submitted(c, w, 150000);
  const repo = new ExtraApprovalRepository(c.runtime), ctx = await w.ctx;
  if (ready) {
    await repo.approveExtraStep(await testActorContext(c.admin, ctx, w.members.supervisor.member), w.members.supervisor.member, approveInput(s, 0));
    await repo.approveExtraStep(await testActorContext(c.admin, ctx, w.supervisor2.member), w.supervisor2.member, approveInput(s, 1));
  }
  const extraId = await raiseOn(c, w, s.jobId);
  const unpriced = await repo.submitExtra(await testActorContext(c.admin, ctx, w.members.supervisor.member), w.members.supervisor.member,
    { version: "submit-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId });
  const raw = { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
    approverMembershipId: w.members.client_approver.member.membershipId,
    recipient: await emailOf(c, w, w.members.client_approver.member.membershipId),
    linkToken: newToken(), expiresAt: new Date(Date.now() + 3600_000) };
  return { w, s, repo, ctx, raw, unpricedId: unpriced.requestId as string };
}

// Snapshot whole rows, including prior effects: a refusal must not update or append any of them.
async function effects(w: ChainWorld) {
  const snapshot: Record<string, unknown> = {};
  for (const table of ["command_receipt", "decision", "decision_resolution", "action_authorization", "extra_client_link", "action_outbox", "action_attempt", "audit_event"]) {
    snapshot[table] = (await c.admin.query(`SELECT to_jsonb(r) row FROM app.${table} r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`, [w.p.tenantId])).rows;
  }
  return snapshot;
}

it("a bound current operative gets the same refusal for priced, absent and unpriced requests on one valid job, with no effects", async () => {
  const f = await fixture(), actor = f.w.members.operative.member;
  const ctx = await testActorContext(c.admin, f.ctx, actor);
  expect((await withTenant(c.runtime, ctx, db => db.$client.query(
    "SELECT session_user,app.current_actor() actor,app.current_tenant() tenant"))).rows)
    .toEqual([{ session_user: "ent4b_login", actor: actor.membershipId, tenant: f.w.p.tenantId }]);
  const before = await effects(f.w);
  for (const requestId of [f.s.requestId, randomUUID(), f.unpricedId]) {
    await expect(f.repo.issueClientApproval(ctx, actor, { ...f.raw, requestId })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await effects(f.w)).toEqual(before);
  }
});

it.each(["surveyor", "commercial_manager"] as const)("covered %s sends the exact fake action once; missing and unpriced remain NOT_FOUND", async role => {
  const f = await fixture(true), actor = f.w.members[role].member;
  const ctx = await testActorContext(c.admin, f.ctx, actor), before = await effects(f.w);
  for (const requestId of [randomUUID(), f.unpricedId]) {
    await expect(f.repo.issueClientApproval(ctx, actor, { ...f.raw, requestId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await effects(f.w)).toEqual(before);
  }
  const sent = await f.repo.issueClientApproval(ctx, actor, f.raw), after = await effects(f.w);
  expect(await f.repo.issueClientApproval(ctx, actor, f.raw)).toEqual(sent);
  expect(await effects(f.w)).toEqual(after);
  const outbox = (await c.admin.query("SELECT * FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [f.w.p.tenantId, sent.outboxActionId])).rows[0];
  const authorization = (await c.admin.query("SELECT * FROM app.action_authorization WHERE tenant_id=$1 AND id=$2", [f.w.p.tenantId, outbox.authorization_id])).rows[0];
  const link = (await c.admin.query("SELECT * FROM app.extra_client_link WHERE tenant_id=$1 AND id=$2", [f.w.p.tenantId, sent.linkId])).rows[0];
  expect(outbox).toMatchObject({ adapter: "fake_email", action_type: "extra.client_approval_request.send", recipient: f.raw.recipient,
    content_hash: sha256Hex(outbox.immutable_content), aggregate_revision: 1, currency: "GBP", policy_version: "extra-client-approval-send.v1" });
  expect(Number(outbox.amount_pence)).toBe(f.s.net);
  expect(outbox.authorization_expires_at).toEqual(f.raw.expiresAt);
  expect(JSON.parse(outbox.immutable_content)).toMatchObject({ requestId: f.s.requestId, revision: 1,
    revisionHash: f.s.hash, netPence: f.s.net, recipient: f.raw.recipient, expiresAt: f.raw.expiresAt.toISOString() });
  expect(authorization).toMatchObject({ actor_membership_id: actor.membershipId, content_hash: outbox.content_hash,
    recipient: f.raw.recipient, aggregate_revision: 1, currency: "GBP", policy_version: outbox.policy_version, expires_at: f.raw.expiresAt });
  expect(Number(authorization.amount_pence)).toBe(f.s.net);
  expect(link).toMatchObject({ request_id: f.s.requestId, job_id: f.s.jobId, command_id: f.raw.commandId,
    authorization_id: authorization.id, outbox_action_id: outbox.id });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.w.p.tenantId, f.raw.commandId])).rows).toEqual([{ n: 1 }]);
});

it.each(["membership revoked", "membership expired", "grant revoked"])("%s cannot gain effects through replay", async loss => {
  const f = await fixture(true), actor = f.w.members.surveyor.member;
  const ctx = await testActorContext(c.admin, f.ctx, actor);
  await f.repo.issueClientApproval(ctx, actor, f.raw);
  if (loss === "membership expired") await c.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [f.w.p.tenantId, actor.membershipId]);
  else await command(c, f.w, loss === "membership revoked" ? { kind: "membership.revoke", membershipId: actor.membershipId }
    : { kind: "grant.revoke", grantId: f.w.members.surveyor.grant });
  const before = await effects(f.w);
  for (const requestId of [f.s.requestId, randomUUID(), f.unpricedId]) {
    await expect(f.repo.issueClientApproval(ctx, actor, { ...f.raw, requestId })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await effects(f.w)).toEqual(before);
  }
});

it("refuses uncovered jobs, foreign tenants, spoofed actors, absent binding and expired credentials without effects", async () => {
  const f = await fixture(), foreign = await chainWorld(c), actor = f.w.members.surveyor.member;
  const bound = await testActorContext(c.admin, f.ctx, actor);
  const expired = await testActorContext(c.admin, f.ctx, f.w.members.commercial_manager.member);
  await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1", [f.w.members.commercial_manager.member.identityUserId]);
  const before = await effects(f.w), foreignBefore = await effects(foreign);
  const unbound = testTenantContext(f.w.p.tenantId, { membershipId: actor.membershipId, bindRequest: false });
  const attempts = [
    () => f.repo.issueClientApproval(bound, actor, { ...f.raw, jobId: f.w.otherJob }),
    () => f.repo.issueClientApproval(bound, actor, { ...f.raw, jobId: foreign.jobId }),
    () => f.repo.issueClientApproval(bound, foreign.members.surveyor.member, f.raw),
    () => f.repo.issueClientApproval(unbound, actor, f.raw),
    () => f.repo.issueClientApproval(bound, f.w.members.commercial_manager.member, f.raw),
    () => f.repo.issueClientApproval(expired, f.w.members.commercial_manager.member, f.raw),
  ];
  for (const attempt of attempts) {
    await expect(attempt()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await effects(f.w)).toEqual(before);
    expect(await effects(foreign)).toEqual(foreignBefore);
  }
  // A covered sender cannot read a request belonging to a different job, even in its own tenant.
  const other = await submitted(c, f.w, 150000), beforeWrongJob = await effects(f.w);
  for (const requestId of [other.requestId, (await submitted(c, foreign, 150000)).requestId]) {
    await expect(f.repo.issueClientApproval(bound, actor, { ...f.raw, requestId }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await effects(f.w)).toEqual(beforeWrongJob);
  }
});
