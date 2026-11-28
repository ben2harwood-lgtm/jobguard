import { reviseV2 } from "./extra-price-v2-fixtures.js";
// Synthetic PostgreSQL regressions; run in the database-capable check environment.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, verifiedTenantContextForQueuedJob, withTenant, type AuthenticatedMembership } from "../src/index.js";
import { testActorContext } from "./tenant-context-test-utils.js";
import { approveInput, chainWorld, cluster, command, demoRules, reviseRules, submitted, type ChainWorld, type Cluster } from "./extra-approval-chain-fixtures.js";
import { ownerTx, receipt, terminalizeFixtureReceipt } from "./extra-fixtures.js";

let c: Cluster;
let repo: ExtraApprovalRepository;
type Request = Awaited<ReturnType<typeof submitted>>;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster(); repo = new ExtraApprovalRepository(c.runtime);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const context = async (w: ChainWorld, actor: AuthenticatedMembership) => testActorContext(c.admin, await w.ctx, actor);
async function queue(w: ChainWorld, actor: AuthenticatedMembership, s: Request) {
  return (await repo.queue(await context(w, actor), actor.membershipId)).filter(row => row.request_id === s.requestId);
}
async function approve(w: ChainWorld, actor: AuthenticatedMembership, s: Request, slot: number) {
  return repo.approveExtraStep(await context(w, actor), actor, approveInput(s, slot));
}
async function revise(w: ChainWorld, s: Request) {
  const actor = w.members.surveyor.member;
  const result = await repo.reviseExtra(await context(w, actor), actor, await reviseV2(c, { commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, netPence: 60001, }));
  return { ...s, requestId: result.requestId as string, hash: result.revisionHash as string, net: 60001 };
}

it("hides a covered supervisor's own extra but keeps another eligible supervisor's mandatory item", async () => {
  const w = await chainWorld(c), s = await submitted(c, w, 60000, "supervisor");
  const a = w.members.supervisor.member, b = w.supervisor2.member;
  expect(await queue(w, a, s)).toEqual([]);
  expect(await queue(w, b, s)).toMatchObject([{ lane: "mandatory", step_index: 0, escalated: false, overdue: false }]);
  await expect(approve(w, a, s, 0)).rejects.toMatchObject({ code: "SELF_APPROVAL" });
});

it("hides step 1 from the actor who filled step 0, while preserving the next approver", async () => {
  const w = await chainWorld(c), s = await submitted(c, w, 60000);
  const a = w.members.supervisor.member, b = w.supervisor2.member;
  await approve(w, a, s, 0);
  expect(await queue(w, a, s)).toEqual([]);
  expect(await queue(w, b, s)).toMatchObject([{ lane: "mandatory", step_index: 1 }]);
  await expect(approve(w, a, s, 1)).rejects.toMatchObject({ code: "REUSED_APPROVER" });
});

it("Q04 keeps the same slot visible and approvable on a new revision, but excludes a prior different slot", async () => {
  const w = await chainWorld(c), s = await submitted(c, w, 60000);
  const a = w.members.supervisor.member, b = w.supervisor2.member;
  await approve(w, a, s, 0); await approve(w, b, s, 1);
  const next = await revise(w, s);
  expect(await queue(w, b, next)).toEqual([]); // historical step 1 cannot fill new step 0
  expect(await queue(w, a, next)).toMatchObject([{ step_index: 0 }]);
  await approve(w, a, next, 0);
  expect(await queue(w, a, next)).toEqual([]);
  expect(await queue(w, b, next)).toMatchObject([{ step_index: 1 }]);
  await approve(w, b, next, 1);
});

it("a succeeded rejection reserves its slot across revisions without banning same-slot participation", async () => {
  const w = await chainWorld(c), s = await submitted(c, w, 60000);
  const a = w.members.supervisor.member, b = w.supervisor2.member;
  await repo.rejectExtra(await context(w, a), a, { ...approveInput(s, 0), version: "reject-extra.v1", reasonCode: "price_not_agreed" });
  const next = await revise(w, s);
  expect(await queue(w, a, next)).toMatchObject([{ step_index: 0 }]);
  await approve(w, b, next, 0);
  expect(await queue(w, a, next)).toEqual([]);
  await expect(approve(w, a, next, 1)).rejects.toMatchObject({ code: "REUSED_APPROVER" });
});

it("LATER-SAFETY-49 legacy unknown rejection slots stay ineligible, with every fixture guard enabled", async () => {
  const w = await chainWorld(c), s = await submitted(c, w, 60000);
  const a = w.members.supervisor.member, b = w.supervisor2.member, id = randomUUID();
  // Same historical lifecycle fixture as LATER-SAFETY-49: real outcome, event and
  // Decision resolution, then terminalize its receipt. No fabricated approval.
  await ownerTx(c, w.p.tenantId, async db => {
    await receipt(db, w.p.tenantId, s.jobId, s.extraId, a.membershipId, "RejectExtra", id,
      { semanticKey: `extra-step:${s.requestId}:0:${id}` });
    await db.$client.query("INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id) VALUES($1,$2,$3,$4,$5,'rejected','price_not_agreed','member',$6,$7)",
      [w.p.tenantId, randomUUID(), s.jobId, s.extraId, s.requestId, a.membershipId, id]);
    await db.$client.query("SELECT app.xa_event($1,$2,$3,'rejected',b.variation_revision_id,'price_not_agreed',$5,$6) FROM app.extra_approval_request q JOIN app.extra_approval_revision_binding b ON(b.tenant_id,b.id)=(q.tenant_id,q.binding_id) WHERE q.tenant_id=$1 AND q.id=$4",
      [w.p.tenantId, s.jobId, s.extraId, s.requestId, id, a.membershipId]);
    await db.$client.query("SELECT app.xa_resolve_decision($1,$2,0,'rejected',$3)", [w.p.tenantId, s.requestId, a.membershipId]);
    await terminalizeFixtureReceipt(db, w.p.tenantId, id, { requestId: s.requestId, state: "rejected" });
  });
  expect((await c.admin.query("SELECT status,result->>'stepIndex' slot FROM app.command_receipt WHERE command_id=$1", [id])).rows).toEqual([{ status: "succeeded", slot: null }]);
  const next = await revise(w, s);
  expect(await queue(w, a, next)).toEqual([]);
  await expect(approve(w, a, next, 0)).rejects.toMatchObject({ code: "REUSED_APPROVER" });
  await approve(w, b, next, 0);
  expect(await queue(w, a, next)).toEqual([]);
  await expect(approve(w, a, next, 1)).rejects.toMatchObject({ code: "REUSED_APPROVER" });
});

it("preserves scope, tenant, revoked-grant and revoked-member exclusions", async () => {
  const w = await chainWorld(c), other = await chainWorld(c), s = await submitted(c, w, 60000);
  expect(await queue(w, w.otherSupervisor.member, s)).toEqual([]);
  expect(await queue(other, other.members.supervisor.member, s)).toEqual([]);
  await expect(queue(w, other.members.supervisor.member, s)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  const a = w.members.supervisor.member;
  expect(await queue(w, a, s)).toHaveLength(1);
  await command(c, w, { kind: "grant.revoke", grantId: w.members.supervisor.grant });
  expect(await queue(w, a, s)).toEqual([]);
  expect(await queue(w, w.supervisor2.member, s)).toHaveLength(1);
  const b = w.supervisor2.member, bound = await context(w, b);
  await command(c, w, { kind: "membership.revoke", membershipId: b.membershipId });
  await expect(repo.queue(bound, b.membershipId)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
});

it("preserves London deadlines, overdue state and the listed escalation alternates", async () => {
  const w = await chainWorld(c), rules = structuredClone(demoRules);
  for (const band of rules.bands) for (const step of band.steps) step.waitWorkingDays = 2;
  await reviseRules(c, w, rules);
  const s = await submitted(c, w, 60000, "supervisor"), bound = await context(w, w.supervisor2.member);
  const deadline = async () => withTenant(c.runtime, bound, async db =>
    (await db.$client.query("SELECT app.xa_wait_deadline(server_recorded_at,requirement->'steps'->0) deadline FROM app.extra_approval_request WHERE id=$1", [s.requestId])).rows);
  const before = await deadline();
  expect(await queue(w, w.members.surveyor.member, s)).toEqual([]);
  // Owner-only clock fixture, transactionally restored on error; no fact/receipt guard changes.
  const owner = await c.admin.connect();
  try {
    await owner.query("BEGIN");
    await owner.query("ALTER TABLE app.extra_approval_request DISABLE TRIGGER immutable");
    await owner.query("UPDATE app.extra_approval_request SET server_recorded_at='2020-11-06T14:00:00Z' WHERE id=$1", [s.requestId]);
    await owner.query("ALTER TABLE app.extra_approval_request ENABLE TRIGGER immutable");
    await owner.query("COMMIT");
  } catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }
  const due = await deadline(); expect(due).not.toEqual(before);
  expect(due[0]!.deadline.toISOString()).toBe("2020-11-10T14:00:00.000Z");
  expect(await queue(w, w.supervisor2.member, s)).toMatchObject([{ overdue: true, escalated: false }]);
  await repo.escalateOverdue(verifiedTenantContextForQueuedJob(w.p.tenantId));
  for (const actor of [w.members.surveyor.member, w.members.commercial_manager.member, w.supervisor2.member]) {
    expect(await queue(w, actor, s)).toMatchObject([{ lane: "mandatory", step_index: 0, overdue: true, escalated: true }]);
  }
  expect(await queue(w, w.members.supervisor.member, s)).toEqual([]);
  expect(await queue(w, w.members.finance.member, s)).toEqual([]);
  expect(await deadline()).toEqual(due);
});

it.each(["SELF_APPROVAL", "REUSED_APPROVER"])("mutation probe: removing only %s makes its queue regression fail", async exclusion => {
  const w = await chainWorld(c), s = await submitted(c, w, 60000, exclusion === "SELF_APPROVAL" ? "supervisor" : "operative");
  const a = w.members.supervisor.member;
  if (exclusion === "REUSED_APPROVER") await approve(w, a, s, 0);
  const assertExcluded = async () => expect(await queue(w, a, s)).toEqual([]);
  await assertExcluded();
  // This cluster is a disposable scratch database. Replace and restore the one
  // function in owner transactions; never mutate a merged migration or a guard.
  const original = (await c.admin.query("SELECT pg_get_functiondef('app.xa_queue(uuid)'::regprocedure) body")).rows[0].body as string;
  const start = original.indexOf(`  -- ${exclusion} exclusion:`);
  const end = original.indexOf(exclusion === "SELF_APPROVAL" ? "  -- REUSED_APPROVER exclusion:" : "  lane:='mandatory';", start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const replace = async (body: string) => {
    const owner = await c.admin.connect();
    try { await owner.query("BEGIN"); await owner.query(body); await owner.query("COMMIT"); }
    catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }
  };
  try {
    await replace(original.slice(0, start) + original.slice(end));
    await expect(assertExcluded()).rejects.toThrow();
    expect(await queue(w, a, s)).toHaveLength(1);
  } finally { await replace(original); }
  await assertExcluded();
});
