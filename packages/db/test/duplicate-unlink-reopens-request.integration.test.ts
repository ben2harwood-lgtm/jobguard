import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, ExtraRepository } from "../src/index.js";
import { snapshotRows } from "./upgrade-proof-utils.js";
import { chainWorld, cluster, submitted, raiseOn, approveInput, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";

let c: Cluster, w: ChainWorld, approvals: ExtraApprovalRepository, extras: ExtraRepository;
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 // A fresh PostgreSQL database applies every main migration and the new migration.
 c = await cluster(); w = await chainWorld(c);
 approvals = new ExtraApprovalRepository(c.runtime); extras = new ExtraRepository(c.runtime);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

async function linked(approved = false, net = 40000, partial = false) {
 const s = await submitted(c, w, net), ctx = await w.ctx, actor = w.members.supervisor.member;
 if (approved || partial) await approvals.approveExtraStep(ctx, actor, approveInput(s, 0));
 const canonicalId = await raiseOn(c, w, s.jobId);
 // An approved duplicate must point at an approved canonical extra (LS-111).
 await approvals.priceExtra(ctx, w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: canonicalId, netPence: 40000 });
 const canonical = await approvals.submitExtra(ctx, actor, { version: "submit-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: canonicalId });
 await approvals.approveExtraStep(ctx, actor, approveInput({ jobId: s.jobId, requestId: String(canonical.requestId), hash: String(canonical.revisionHash), net: 40000 }, 0));
 const link = await approvals.markDuplicate(ctx, actor, {
  version: "mark-duplicate.v1", commandId: randomUUID(), jobId: s.jobId, duplicateId: s.extraId, canonicalId,
 });
 const unlink = { version: "extra-duplicate-unlink.v1", commandId: randomUUID(), jobId: s.jobId,
  actorMembershipId: actor.membershipId, linkId: String(link.linkId),
  expectedRevision: (await extras.readDuplicateLinks(ctx, s.jobId)).revision, reasonCode: "not_same_work" };
 return { s, ctx, actor, unlink };
}
async function requests(extra: string) {
 return (await c.admin.query("SELECT * FROM app.extra_approval_request WHERE tenant_id=$1 AND variation_id=$2 ORDER BY request_revision", [w.p.tenantId, extra])).rows;
}
async function history(request: string) {
 return (await c.admin.query(`SELECT row_to_json(q) request,
  (SELECT jsonb_agg(o ORDER BY o.id) FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(q.tenant_id,q.id)) outcomes,
  (SELECT jsonb_agg(f ORDER BY f.step_index) FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(q.tenant_id,q.id)) steps,
  (SELECT jsonb_agg(r ORDER BY r.id) FROM app.decision d JOIN app.decision_resolution r ON(r.tenant_id,r.decision_id)=(d.tenant_id,d.id)
   WHERE d.tenant_id=q.tenant_id AND d.subject_ref LIKE q.id::text||':%') resolutions
  FROM app.extra_approval_request q WHERE q.tenant_id=$1 AND q.id=$2`, [w.p.tenantId, request])).rows;
}

it("reopens a duplicate-closed request, preserves history and approves the restored extra; replay writes nothing", async () => {
 const { s, ctx, actor, unlink } = await linked(), before = await history(s.requestId);
 const failedSnapshot = await snapshotRows(c.admin);
 await expect(extras.unlinkDuplicate(ctx, unlink, async () => { throw new Error("synthetic rollback"); })).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
 expect(await snapshotRows(c.admin)).toEqual(failedSnapshot);
 const result = await extras.unlinkDuplicate(ctx, unlink);
 const rows = await requests(s.extraId);
 expect(rows).toHaveLength(2);
 const fresh = rows[1]!;
 expect(fresh).toMatchObject({ request_revision: 2, binding_id: rows[0]!.binding_id,
  net_pence: rows[0]!.net_pence, revision_hash: s.hash, requirement: rows[0]!.requirement, command_id: unlink.commandId });
 expect(await history(s.requestId)).toEqual(before);
 expect((await approvals.queue(ctx, actor.membershipId)).filter(q => q.request_id === fresh.id)).toHaveLength(1);
 await expect(approvals.approveExtraStep(ctx, actor, approveInput(s, 0))).rejects.toMatchObject({ code: "STALE_REVISION" });
 const snapshot = await snapshotRows(c.admin);
 expect(await extras.unlinkDuplicate(ctx, unlink)).toEqual(result);
 expect(await snapshotRows(c.admin)).toEqual(snapshot);
 await expect(approvals.approveExtraStep(ctx, actor, approveInput({ ...s, requestId: fresh.id }, 0))).resolves.toMatchObject({ state: "approved" });
 expect((await c.admin.query("SELECT kind FROM app.extra_event WHERE tenant_id=$1 AND variation_id=$2 ORDER BY sequence DESC LIMIT 1", [w.p.tenantId, s.extraId])).rows).toEqual([{ kind: "approved" }]);
 // Replay remains stable even after the new request has reached a terminal state.
 const approvedSnapshot = await snapshotRows(c.admin);
 expect(await extras.unlinkDuplicate(ctx, unlink)).toEqual(result);
 expect(await snapshotRows(c.admin)).toEqual(approvedSnapshot);
});

it("leaves an already-approved request intact when its duplicate link is reversed", async () => {
 const { s, ctx, unlink } = await linked(true), before = await history(s.requestId);
 await extras.unlinkDuplicate(ctx, unlink);
 expect(await requests(s.extraId)).toHaveLength(1);
 expect(await history(s.requestId)).toEqual(before);
 expect((await c.admin.query("SELECT app.xa_latest_kind($1,$2,$3) kind", [w.p.tenantId, s.jobId, s.extraId])).rows).toEqual([{ kind: "approved" }]);
});

it("restarts a partially approved chain without copying earlier approvals", async () => {
 const { s, ctx, actor, unlink } = await linked(false, 75000, true), before = await history(s.requestId);
 await extras.unlinkDuplicate(ctx, unlink);
 const fresh = (await requests(s.extraId))[1]!;
 expect(await history(s.requestId)).toEqual(before);
 await expect(approvals.approveExtraStep(ctx, w.supervisor2.member, approveInput({ ...s, requestId: fresh.id }, 1))).rejects.toMatchObject({ code: "STEP_OUT_OF_ORDER" });
 await approvals.approveExtraStep(ctx, actor, approveInput({ ...s, requestId: fresh.id }, 0));
 await expect(approvals.approveExtraStep(ctx, w.supervisor2.member, approveInput({ ...s, requestId: fresh.id }, 1))).resolves.toMatchObject({ state: "approved" });
});

it("scratch mutation: disabling the fix reproduces ALREADY_DECIDED; the trigger is restored in finally", async () => {
 await c.admin.query("ALTER TABLE app.extra_duplicate_link DISABLE TRIGGER reopen_unlinked_request");
 try {
  const { s, ctx, actor, unlink } = await linked();
  await extras.unlinkDuplicate(ctx, unlink);
  expect(await requests(s.extraId)).toHaveLength(1);
  await expect(approvals.approveExtraStep(ctx, actor, approveInput(s, 0))).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
 } finally {
  await c.admin.query("ALTER TABLE app.extra_duplicate_link ENABLE TRIGGER reopen_unlinked_request");
 }
 // The same journey succeeds again after restoring the fix.
 const { s, ctx, actor, unlink } = await linked();
 await extras.unlinkDuplicate(ctx, unlink);
 const fresh = (await requests(s.extraId))[1]!;
 await expect(approvals.approveExtraStep(ctx, actor, approveInput({ ...s, requestId: fresh.id }, 0))).resolves.toMatchObject({ state: "approved" });
});
