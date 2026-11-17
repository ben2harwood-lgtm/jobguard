// Written before the change to the site-extra repository. Real PostgreSQL (embedded) through merged cluster().
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { extraOriginHashV1 } from "@jobguard/core";
import { ExtraRepository, SiteExtraRepository, SiteVisitRepository, siteExtraAuthoritySeam, type TenantTransaction } from "../src/index.js";
import { fixture } from "./extra-fixtures.js";
import { counts, direct, input, originSql, originHashInput } from "./site-extra-fixtures.js";
import { cluster, visitFixture, snapshot, refusalEvents, startInput, completeInput, ownerVisit, secondJob, chain, type Cluster, type VisitFixture } from "./site-visit-fixtures.js";
vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });
let c: Cluster, extras: SiteExtraRepository, visits: SiteVisitRepository;
beforeAll(async () => { c = await cluster(); extras = new SiteExtraRepository(c.runtime); visits = new SiteVisitRepository(c.runtime); }, 120_000);
afterAll(async () => { await c?.close(); });
const v2 = (f: VisitFixture, visitId: string, fields: Record<string, unknown> = {}) => ({ ...input(f), siteVisitId: visitId, ...fields });
const errorOf = (run: () => Promise<unknown>) => run().then(() => { throw new Error("unexpected success"); }, (error: unknown) => error as { code: string });
/** Waits (by observing the lock table, not by guessing a delay) until some backend is waiting for a lock held by another transaction. */
async function waitForBlockedLock() {
 for (let attempt = 0; attempt < 600; attempt++) {
  if ((await c.admin.query("SELECT 1 FROM pg_locks WHERE NOT granted")).rowCount) return;
  await new Promise(resolve => setTimeout(resolve, 20));
 }
 throw new Error("no backend started waiting for a lock");
}
describe("ENT-3b the visit reference on a site extra (version 2)", () => {
 it("[B16] a version 2 log naming the caller's own open visit stores the visit and its origin hash matches the stored row", async () => {
  const f = await visitFixture(c), a = f.members.operative, open = await visits.startVisit(f.ctx, a.member, startInput(f));
  const result = await extras.logSiteExtra(f.ctx, a.member, v2(f, open.visitId));
  const rows = (await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, result.variationId])).rows;
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ site_visit_id: open.visitId, raising_membership_id: a.member.membershipId, job_id: f.jobId });
  expect(rows[0]!.origin_hash).toBe(extraOriginHashV1(originHashInput(rows[0]!)));
  await chain(c, f);
 });
 it("[B16] a version 1 log still writes no visit and its call to the repository is still exactly four fields", async () => {
  const f = await visitFixture(c), a = f.members.operative, raw = input(f);
  expect(Object.keys(raw).sort()).toEqual(["commandId", "description", "jobId", "note"]);
  const result = await extras.logSiteExtra(f.ctx, a.member, raw);
  expect((await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, result.variationId])).rows[0]).toMatchObject({ site_visit_id: null });
  expect(await extras.logSiteExtra(f.ctx, a.member, raw)).toEqual(result);
 });
 it("[B16] a completed visit, another member's visit, a visit of another job, another tenant's visit and a random id are each NOT_FOUND with nothing written", async () => {
  const f = await visitFixture(c), other = await visitFixture(c), a = f.members.operative;
  const done = await visits.startVisit(f.ctx, a.member, startInput(f)); await visits.completeVisit(f.ctx, a.member, completeInput(f, done.visitId, "no"));
  const theirs = await visits.startVisit(f.ctx, f.named.member, startInput(f));
  const second = await secondJob(c, f);
  const elsewhere = await ownerVisit(c, f, a.member.membershipId, second.jobId, second.orderId);
  const foreignVisit = await visits.startVisit(other.ctx, other.members.operative.member, startInput(other));
  for (const visitId of [done.visitId, theirs.visitId, elsewhere, foreignVisit.visitId, randomUUID()]) {
   const before = await counts(c, f), snap = await snapshot(c, f.p.tenantId), otherBefore = await snapshot(c, other.p.tenantId), refusals = (await refusalEvents(c, f.p.tenantId)).length;
   const raw = v2(f, visitId);
   expect((await errorOf(() => extras.logSiteExtra(f.ctx, a.member, raw))).code).toBe("NOT_FOUND");
   // The refused extra may add its own refusal record (one other audit event) and nothing else.
   const after = await snapshot(c, f.p.tenantId);
   expect(await counts(c, f)).toEqual({ ...before, raised: before.raised }); expect({ ...after, otherAudit: 0 }).toEqual({ ...snap, otherAudit: 0 }); expect(after.otherAudit[0]!.n).toBe(snap.otherAudit[0]!.n + 1); expect(await snapshot(c, other.p.tenantId)).toEqual(otherBefore);
   const events = (await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.refused' AND subject_ref=$2", [f.p.tenantId, raw.commandId])).rows;
   expect(events).toHaveLength(1); expect(events[0]!.payload.references.reason).toBe("visit_out_of_scope");
   expect((await refusalEvents(c, f.p.tenantId)).length).toBe(refusals);
  }
  await chain(c, f);
 });
 it("[B16] raiseExtra called directly with the seam and a completed visit is refused by the new guard alone", async () => {
  const f = await visitFixture(c), a = f.members.operative, done = await visits.startVisit(f.ctx, a.member, startInput(f));
  await visits.completeVisit(f.ctx, a.member, completeInput(f, done.visitId, "yes"));
  const before = await counts(c, f);
  // The merged origin trigger accepts a completed visit of the same job and member; only the new routine in the seam refuses it.
  await expect(new ExtraRepository(c.runtime).raiseExtra(f.ctx, direct(f, a, { siteVisitId: done.visitId }), siteExtraAuthoritySeam)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await counts(c, f)).toEqual(before);
  const open = await visits.startVisit(f.ctx, a.member, startInput(f));
  await expect(new ExtraRepository(c.runtime).raiseExtra(f.ctx, direct(f, a, { siteVisitId: open.visitId }), siteExtraAuthoritySeam)).resolves.toMatchObject({ variationId: expect.any(String) });
 });
 it("[B16] a completion that commits after the pre-check allowed a version 2 log makes the log fail with nothing written", async () => {
  const f = await visitFixture(c), a = f.members.operative, open = await visits.startVisit(f.ctx, a.member, startInput(f));
  const before = await counts(c, f), original = (SiteExtraRepository.prototype as any).precheck;
  let done = false;
  vi.spyOn(SiteExtraRepository.prototype as any, "precheck").mockImplementation(async function (this: unknown, ...args: unknown[]) {
   const answer = await original.apply(this, args);
   // The first pre-check has allowed the log; now the completion commits, before the log's own transaction starts.
   if (!done) { done = true; await visits.completeVisit(f.ctx, a.member, completeInput(f, open.visitId, "no")); }
   return answer;
  });
  try { expect((await errorOf(() => extras.logSiteExtra(f.ctx, a.member, v2(f, open.visitId)))).code).toBe("NOT_FOUND"); } finally { vi.restoreAllMocks(); }
  // Only the completion's own receipt is new: the log wrote no extra, origin, event, scope row or audit event.
  expect(done).toBe(true); expect(await counts(c, f)).toEqual({ ...before, command_receipt: before.command_receipt! + 1 });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND site_visit_id=$2", [f.p.tenantId, open.visitId])).rows[0]!.n).toBe(0);
 });
 it("[B16] a log that commits first leaves the extra, and the completion that was waiting then succeeds", async () => {
  const f = await visitFixture(c), a = f.members.operative, open = await visits.startVisit(f.ctx, a.member, startInput(f));
  let afterSeam!: () => void, release!: () => void;
  const held = new Promise<void>(resolve => { afterSeam = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const log = new ExtraRepository(c.runtime).raiseExtra(f.ctx, direct(f, a, { siteVisitId: open.visitId }), async (db: TenantTransaction, fact) => { await siteExtraAuthoritySeam(db, fact); afterSeam(); await gate; });
  await held;
  const completion = visits.completeVisit(f.ctx, a.member, completeInput(f, open.visitId, "yes"));
  await waitForBlockedLock();
  release();
  const raised = await log;
  expect((await completion).closeoutAnswer).toBe("yes");
  const row = (await c.admin.query("SELECT site_visit_id FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, raised.variationId])).rows[0];
  expect(row).toEqual({ site_visit_id: open.visitId });
  await chain(c, f);
 });
 it("[B16] the other ENT-3a refusals are unchanged for a version 2 body: an unauthorised caller, a foreign job and a not-named member", async () => {
  const f = await visitFixture(c), foreign = await fixture(c), open = await visits.startVisit(f.ctx, f.members.operative.member, startInput(f));
  for (const [who, job] of [[f.members.finance, f.jobId], [f.unassigned, f.jobId], [f.members.operative, foreign.jobId]] as const) {
   const before = await counts(c, f);
   const error = await errorOf(() => extras.logSiteExtra(f.ctx, who.member, v2(f, open.visitId, { jobId: job })));
   expect(["EXTRA_FORBIDDEN", "NOT_FOUND"]).toContain(error.code); expect(await counts(c, f)).toEqual(before);
  }
 });
});
