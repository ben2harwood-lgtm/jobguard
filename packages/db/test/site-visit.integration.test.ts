// Written before the repository. Real PostgreSQL (embedded) through merged cluster(); the runtime role is the application login.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SiteVisitError, siteAssignedJobsV1, siteOrderLinesV1, siteVisitFailureV1, siteVisitHttpStatus } from "@jobguard/core";
import { JobSchedulingRepository, SiteVisitRepository, WorkOrderRepository, appendAuditBatch, demoFile, demoRow, derivedUuid, withTenant } from "../src/index.js";
import { fixture } from "./extra-fixtures.js";
import { ObservedPool, analyseLockOrder, mutableTables } from "./lock-observer.js";
import {
 cluster, visitFixture, snapshot, refusalEvents, auditHead, serverTime, startInput, completeInput, ownerVisit, moveOffLive, extraOrder, secondJob, reviseOrder, cancelOrder, forbiddenRoles,
 chain, command, invite, smallTrack, smallJob, ownerTx, type Cluster, type VisitFixture, type Actor,
} from "./site-visit-fixtures.js";
vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });
let c: Cluster, repo: SiteVisitRepository;
beforeAll(async () => { c = await cluster(); repo = new SiteVisitRepository(c.runtime); }, 120_000);
afterAll(async () => { await c?.close(); });
afterEach(() => vi.restoreAllMocks());
const errorOf = (run: () => Promise<unknown>) => run().then(() => { throw new Error("unexpected success"); }, (error: unknown) => error as SiteVisitError);
const plain = (error: SiteVisitError) => ({ name: error.name, message: error.message, code: error.code });
const start = (f: VisitFixture, a: Actor, fields: Record<string, unknown> = {}) => repo.startVisit(f.ctx, a.member, startInput(f, fields));
const complete = (f: VisitFixture, a: Actor, visitId: string, answer: unknown = "yes", fields: Record<string, unknown> = {}) => repo.completeVisit(f.ctx, a.member, completeInput(f, visitId, answer, fields));
/** The command is refused with this code and writes nothing (receipts, visits, answers, started/completed events, every other audit event, audit chain). */
async function refused(f: VisitFixture, run: () => Promise<unknown>, code: string): Promise<SiteVisitError> {
 const before = await snapshot(c, f.p.tenantId), head = await auditHead(c, f.p.tenantId);
 const error = await errorOf(run);
 expect(error).toBeInstanceOf(SiteVisitError); expect(error.code).toBe(code); expect(error.message).toBe(code);
 expect(await snapshot(c, f.p.tenantId)).toEqual(before);
 // A refusal may add its own refusal record, never anything else; the chain still verifies.
 await chain(c, f); void head;
 return error;
}
async function visitRow(id: string, tenant: string) { return (await c.admin.query("SELECT completed_at::text completed,started_at::text started,row_to_json(v)::text whole FROM app.site_visit v WHERE tenant_id=$1 AND id=$2", [tenant, id])).rows[0]; }
const answers = async (tenant: string, visit: string) => (await c.admin.query("SELECT a.*,a.server_recorded_at::text recorded FROM app.closeout_answer a WHERE tenant_id=$1 AND site_visit_id=$2", [tenant, visit])).rows;
/** Waits (by observing the lock table, not by guessing a delay) until some backend is waiting for an advisory lock. */
async function waitForBlockedLock() {
 for (let attempt = 0; attempt < 600; attempt++) {
  if ((await c.admin.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rowCount) return;
  await new Promise(resolve => setTimeout(resolve, 20));
 }
 throw new Error("no backend started waiting for an advisory lock");
}

describe("ENT-3b success paths", () => {
 for (const [label, who, answer] of [["operative", "operative", "yes"], ["supervisor", "named", "no"]] as const) it(`[B2] the named ${label} starts and completes a visit with server times, an answer, two audit events and two receipts`, async () => {
  const f = await visitFixture(c), a = who === "operative" ? f.members.operative : f.named;
  const before = await serverTime(c);
  const started = await start(f, a);
  const middle = await serverTime(c);
  const done = await complete(f, a, started.visitId, answer);
  const after = await serverTime(c);
  expect(done).toEqual({ visitId: started.visitId, completedAt: expect.any(String), closeoutAnswer: answer });
  const row = (await c.admin.query("SELECT started_at BETWEEN $2::timestamptz AND $3::timestamptz started_ok, completed_at BETWEEN $3::timestamptz AND $4::timestamptz completed_ok, job_id,work_order_id,membership_id FROM app.site_visit WHERE tenant_id=$1 AND id=$5", [f.p.tenantId, before, middle, after, started.visitId])).rows[0];
  expect(row).toEqual({ started_ok: true, completed_ok: true, job_id: f.jobId, work_order_id: f.orderId, membership_id: a.member.membershipId });
  const stored = await answers(f.p.tenantId, started.visitId);
  expect(stored).toHaveLength(1);
  const visit = await visitRow(started.visitId, f.p.tenantId);
  expect(stored[0]).toMatchObject({ question_version: "closeout-question.v1", answer, membership_id: a.member.membershipId, job_id: f.jobId, work_order_id: f.orderId, tenant_id: f.p.tenantId });
  expect(stored[0]!.recorded).toBe(visit.completed);
  expect(done.completedAt).toBe((await c.admin.query("SELECT to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') t FROM app.site_visit WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, started.visitId])).rows[0]!.t);
  const events = (await c.admin.query("SELECT id,event_type,subject_type,subject_ref,actor_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'contractor.visit.%' ORDER BY sequence", [f.p.tenantId])).rows;
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ id: started.visitId, event_type: "contractor.visit.started", subject_type: "site-visit", subject_ref: started.visitId, actor_ref: `membership:${a.member.membershipId}` });
  expect(events[0]!.payload).toEqual({ references: { command: expect.any(String), job: f.jobId, visit: started.visitId, environment: "synthetic_demo" } });
  expect(events[1]).toMatchObject({ id: stored[0]!.id, event_type: "contractor.visit.completed", subject_type: "site-visit", subject_ref: started.visitId, actor_ref: `membership:${a.member.membershipId}` });
  expect(events[1]!.payload).toEqual({ references: { command: stored[0]!.command_id, job: f.jobId, visit: started.visitId, closeoutAnswer: stored[0]!.id, environment: "synthetic_demo" } });
  expect(JSON.stringify(events[1]!.payload)).not.toContain(`"${answer}"`);
  const receipts = (await c.admin.query("SELECT command_type,status FROM app.command_receipt WHERE tenant_id=$1 AND command_type IN('StartSiteVisit','CompleteSiteVisit') ORDER BY command_type", [f.p.tenantId])).rows;
  expect(receipts).toEqual([{ command_type: "CompleteSiteVisit", status: "succeeded" }, { command_type: "StartSiteVisit", status: "succeeded" }]);
  await chain(c, f);
  const shown = (await new JobSchedulingRepository(c.runtime).siteVisits(f.members.supervisor.member, f.jobId)).visits.find(v => v.id === started.visitId);
  expect(shown).toMatchObject({ membershipId: a.member.membershipId, startedAt: expect.any(String), completedAt: expect.any(String) });
  expect(Date.parse(shown!.completedAt!)).toBeGreaterThanOrEqual(Date.parse(shown!.startedAt));
  // A "yes" with no extra logged is accepted (the prompt for it belongs to a later piece).
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n).toBe(0);
 });
});

describe("ENT-3b refusals by role and by job", () => {
 it("[B3] every role that may not visit: VISIT_FORBIDDEN for both commands, identical for four job ids, nothing written", async () => {
  const f = await visitFixture(c), foreign = await fixture(c), open = await ownerVisit(c, f, f.members.operative.member.membershipId);
  for (const role of forbiddenRoles) {
   const a = f.members[role];
   for (const kind of ["start", "complete"] as const) {
    const errors: SiteVisitError[] = [];
    for (const job of [f.jobId, f.otherJob, foreign.jobId, randomUUID()]) errors.push(await refused(f, () => kind === "start" ? repo.startVisit(f.ctx, a.member, startInput(f, { jobId: job })) : repo.completeVisit(f.ctx, a.member, completeInput(f, open, "yes", { jobId: job })), "VISIT_FORBIDDEN"));
    for (const error of errors) expect(plain(error), `${role} ${kind}`).toEqual(plain(errors[0]!));
   }
  }
 });
 it("[B4] every job refusal is the same NOT_FOUND for start and for completion; the open visit stays open", async () => {
  const f = await visitFixture(c), operative = f.members.operative;
  const mine = await start(f, operative), theirs = await start(f, f.named);
  const small = await smallJob(c, f), cases: Array<[string, Actor, string, string]> = [
   ["operative on the team who is not named", f.unassigned, f.jobId, mine.visitId], ["supervisor whose grant covers the team but is not named", f.members.supervisor, f.jobId, mine.visitId],
   ["supervisor of another branch", f.otherSupervisor, f.jobId, mine.visitId], ["a random job id", operative, randomUUID(), mine.visitId], ["a small-builder job", operative, small, mine.visitId],
   ["a random visit id", operative, f.jobId, randomUUID()], ["another member's visit on the same job", operative, f.jobId, theirs.visitId], ["the caller's own visit named under a different job id", operative, f.otherJob, mine.visitId],
  ];
  const errors: SiteVisitError[] = [];
  for (const [label, who, job, visit] of cases) {
   if (!label.includes("visit")) errors.push(await refused(f, () => repo.startVisit(f.ctx, who.member, startInput(f, { jobId: job })), "NOT_FOUND"));
   errors.push(await refused(f, () => repo.completeVisit(f.ctx, who.member, completeInput(f, visit, "yes", { jobId: job })), "NOT_FOUND"));
  }
  for (const error of errors) expect(plain(error)).toEqual(plain(errors[0]!));
  expect((await visitRow(mine.visitId, f.p.tenantId)).completed).toBeNull(); expect((await visitRow(theirs.visitId, f.p.tenantId)).completed).toBeNull();
 });
 it("[B4] a named supervisor whose only covering grant is revoked, an operative moved off the team, and a cancelled order are refused as NOT_FOUND", async () => {
  const f = await visitFixture(c), moved = await visitFixture(c), cancelled = await visitFixture(c);
  const open = await start(f, f.named);
  await command(c, f, { kind: "grant.revoke", grantId: f.named.grant });
  const revoked = await refused(f, () => start(f, f.named), "NOT_FOUND");
  expect(plain(await refused(f, () => complete(f, f.named, open.visitId), "NOT_FOUND"))).toEqual(plain(revoked));
  await command(c, moved, { kind: "team.move", membershipId: moved.members.operative.member.membershipId, fromTeamId: moved.demo.teamId, toTeamId: moved.otherDemo.teamId });
  expect(plain(await refused(moved, () => start(moved, moved.members.operative), "NOT_FOUND"))).toEqual(plain(revoked));
  const visit = await start(cancelled, cancelled.named);
  await cancelOrder(c, cancelled);
  expect(plain(await refused(cancelled, () => start(cancelled, cancelled.named), "NOT_FOUND"))).toEqual(plain(revoked));
  expect(plain(await refused(cancelled, () => complete(cancelled, cancelled.named, visit.visitId), "NOT_FOUND"))).toEqual(plain(revoked));
 });
 it("[B4] after membership.revoke both commands answer VISIT_FORBIDDEN", async () => {
  const f = await visitFixture(c), extra = await invite(c, f, "supervisor", { kind: "team", id: f.demo.teamId });
  await command(c, f, { kind: "membership.revoke", membershipId: f.members.operative.member.membershipId });
  const open = await ownerVisit(c, f, extra.member.membershipId);
  await refused(f, () => start(f, f.members.operative), "VISIT_FORBIDDEN");
  await refused(f, () => complete(f, f.members.operative, open), "VISIT_FORBIDDEN");
 });
 it("[B5] another tenant: tenant A's member with tenant B's job or visit, a mismatched actor, an unstamped context, a small-builder tenant", async () => {
  const a = await visitFixture(c), b = await visitFixture(c);
  const theirs = await start(b, b.members.operative); await complete(b, b.members.operative, theirs.visitId, "no");
  const openB = await start(b, b.named);
  const otherBefore = await snapshot(c, b.p.tenantId), otherHead = await auditHead(c, b.p.tenantId);
  await refused(a, () => repo.startVisit(a.ctx, a.members.operative.member, startInput(a, { jobId: b.jobId })), "NOT_FOUND");
  await refused(a, () => repo.completeVisit(a.ctx, a.members.operative.member, completeInput(a, openB.visitId, "yes", { jobId: b.jobId })), "NOT_FOUND");
  await refused(a, () => repo.startVisit(a.ctx, b.members.operative.member, startInput(a)), "VISIT_FORBIDDEN");
  await refused(a, () => repo.completeVisit(a.ctx, b.named.member, completeInput(a, openB.visitId)), "VISIT_FORBIDDEN");
  const connect = vi.spyOn(c.runtime, "connect");
  for (const context of [{ tenantId: a.p.tenantId }, undefined]) {
   expect((await errorOf(() => repo.startVisit(context as never, a.members.operative.member, startInput(a)))).code).toBe("NOT_FOUND");
   expect((await errorOf(() => repo.completeVisit(context as never, a.members.operative.member, completeInput(a, randomUUID())))).code).toBe("NOT_FOUND");
  }
  expect(connect).not.toHaveBeenCalled(); connect.mockRestore();
  const small = await visitFixture(c); await smallTrack(c, small);
  await refused(small, () => start(small, small.members.operative), "TRACK_FORBIDDEN");
  await refused(small, () => complete(small, small.members.operative, randomUUID()), "TRACK_FORBIDDEN");
  expect(await snapshot(c, b.p.tenantId)).toEqual(otherBefore); expect(await auditHead(c, b.p.tenantId)).toBe(otherHead);
  await withTenant(c.runtime, a.ctx, async db => {
   expect((await db.$client.query("SELECT count(*)::int n FROM app.closeout_answer")).rows[0].n).toBe(0);
   expect((await db.$client.query("SELECT count(*)::int n FROM app.closeout_answer WHERE tenant_id=$1", [b.p.tenantId])).rows[0].n).toBe(0);
  });
  await withTenant(c.runtime, b.ctx, async db => { expect((await db.$client.query("SELECT count(*)::int n FROM app.closeout_answer")).rows[0].n).toBe(1); });
 });
});

describe("ENT-3b the close-out answer", () => {
 it("[B6] routine 3 called directly as the runtime role with a NULL or an invalid answer raises CLOSEOUT_ANSWER_REQUIRED and writes nothing", async () => {
  const f = await visitFixture(c), operative = f.members.operative.member, visit = await ownerVisit(c, f, operative.membershipId);
  const before = await snapshot(c, f.p.tenantId);
  for (const answer of [null, "maybe", "", "Yes"]) {
   await expect(withTenant(c.runtime, f.ctx, async db => {
    const command = randomUUID();
    await db.$client.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'CompleteSiteVisit',$3,$4,'processing',$5)", [f.p.tenantId, command, `direct:${command}`, "a".repeat(64), operative.membershipId]);
    await db.$client.query("SELECT app.ent3b_complete_visit($1,$2,$3,$4,$5)", [operative.membershipId, command, f.jobId, visit, answer]);
   })).rejects.toMatchObject({ message: "CLOSEOUT_ANSWER_REQUIRED", code: "23514" });
  }
  expect(await snapshot(c, f.p.tenantId)).toEqual(before); expect((await visitRow(visit, f.p.tenantId)).completed).toBeNull();
 });
 it("[B6] as the table owner, completing an open visit with no answer row fails at commit and leaves the visit open", async () => {
  const f = await visitFixture(c), visit = await ownerVisit(c, f, f.members.operative.member.membershipId);
  await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("UPDATE app.site_visit SET completed_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, visit]))).rejects.toMatchObject({ message: "CLOSEOUT_ANSWER_REQUIRED", code: "23514" });
  expect((await visitRow(visit, f.p.tenantId)).completed).toBeNull();
 });
 it("[B6] a body with no closeoutAnswer, or a null one, is CLOSEOUT_ANSWER_REQUIRED before anything is read", async () => {
  const f = await visitFixture(c), connect = vi.spyOn(c.runtime, "connect");
  for (const body of [{ commandId: randomUUID(), jobId: f.jobId, visitId: randomUUID() }, { commandId: randomUUID(), jobId: f.jobId, visitId: randomUUID(), closeoutAnswer: null }]) expect((await errorOf(() => repo.completeVisit(f.ctx, f.members.operative.member, body))).code).toBe("CLOSEOUT_ANSWER_REQUIRED");
  for (const body of [{ commandId: randomUUID(), jobId: f.jobId, visitId: randomUUID(), closeoutAnswer: "maybe" }, { commandId: "x", jobId: f.jobId, visitId: randomUUID(), closeoutAnswer: "yes" }, { commandId: randomUUID(), jobId: f.jobId, visitId: randomUUID(), closeoutAnswer: "yes", extra: 1 }]) expect((await errorOf(() => repo.completeVisit(f.ctx, f.members.operative.member, body))).code).toBe("INVALID_COMMAND");
  expect(connect).not.toHaveBeenCalled();
 });
 it("[B7] a second completion with a new command id, with either answer, is VISIT_ALREADY_COMPLETED and changes nothing", async () => {
  const f = await visitFixture(c), a = f.members.operative, started = await start(f, a);
  await complete(f, a, started.visitId, "yes");
  const first = (await answers(f.p.tenantId, started.visitId))[0]!, visit = await visitRow(started.visitId, f.p.tenantId);
  for (const answer of ["yes", "no"]) await refused(f, () => complete(f, a, started.visitId, answer), "VISIT_ALREADY_COMPLETED");
  expect((await answers(f.p.tenantId, started.visitId))[0]).toEqual(first); expect(await visitRow(started.visitId, f.p.tenantId)).toEqual(visit);
  const receipt = randomUUID();
  await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("INSERT INTO app.closeout_answer(tenant_id,id,job_id,work_order_id,site_visit_id,membership_id,question_version,answer,command_id,server_recorded_at) VALUES($1,$2,$3,$4,$5,$6,'closeout-question.v1','no',$7,clock_timestamp())", [f.p.tenantId, randomUUID(), f.jobId, f.orderId, started.visitId, a.member.membershipId, receipt]))).rejects.toMatchObject({ code: "42501" });
  await expect(ownerTx(c, f.p.tenantId, async db => {
   await db.$client.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'CompleteSiteVisit',$3,$4,'processing',$5)", [f.p.tenantId, receipt, `owner:${receipt}`, "b".repeat(64), a.member.membershipId]);
   await db.$client.query("INSERT INTO app.closeout_answer(tenant_id,id,job_id,work_order_id,site_visit_id,membership_id,question_version,answer,command_id,server_recorded_at) VALUES($1,$2,$3,$4,$5,$6,'closeout-question.v1','no',$7,$8)", [f.p.tenantId, randomUUID(), f.jobId, f.orderId, started.visitId, a.member.membershipId, receipt, first.recorded]);
  })).rejects.toMatchObject({ code: expect.stringMatching(/^(23505|23514)$/u) });
  expect((await answers(f.p.tenantId, started.visitId))).toHaveLength(1);
 });
 it("[B8] an answer can be neither changed nor removed: the runtime role has no privilege, the owner meets the immutable trigger, and a completed visit cannot be reopened or moved", async () => {
  const f = await visitFixture(c), a = f.members.operative, started = await start(f, a);
  await complete(f, a, started.visitId, "yes");
  const first = (await answers(f.p.tenantId, started.visitId))[0]!, visit = await visitRow(started.visitId, f.p.tenantId);
  const columns = ["tenant_id", "id", "job_id", "work_order_id", "site_visit_id", "membership_id", "question_version", "answer", "command_id", "server_recorded_at"];
  for (const sql of [...columns.map(column => `UPDATE app.closeout_answer SET ${column}=${column}`), "UPDATE app.closeout_answer SET answer='no'", "DELETE FROM app.closeout_answer"]) {
   await expect(withTenant(c.runtime, f.ctx, db => db.$client.query(sql)), sql).rejects.toMatchObject({ code: "42501" });
   await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql)), sql).rejects.toMatchObject({ code: "55000" });
  }
  await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("TRUNCATE app.closeout_answer"))).rejects.toMatchObject({ code: "42501" });
  const changes: Array<[string, unknown[]]> = [["completed_at=NULL", []], ["completed_at=completed_at+interval '1 second'", []], ["membership_id=$2", [f.named.member.membershipId]]];
  for (const [change, params] of changes) await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(`UPDATE app.site_visit SET ${change} WHERE tenant_id=$1 AND id='${started.visitId}'`, [f.p.tenantId, ...params])), change).rejects.toMatchObject({ message: "CLOSEOUT_ANSWER_REQUIRED" });
  expect((await answers(f.p.tenantId, started.visitId))[0]).toEqual(first); expect(await visitRow(started.visitId, f.p.tenantId)).toEqual(visit);
 });
});

describe("ENT-3b replay, conflict, one open visit", () => {
 it("[B9] start: the same command id and payload returns the same result with one visit, one audit event and one receipt; another job or another member conflicts", async () => {
  const f = await visitFixture(c), second = await secondJob(c, f), raw = startInput(f);
  const first = await repo.startVisit(f.ctx, f.members.operative.member, raw);
  expect(await repo.startVisit(f.ctx, f.members.operative.member, raw)).toEqual(first);
  const counts = await snapshot(c, f.p.tenantId);
  expect(counts.visits).toHaveLength(1); expect(counts.events).toHaveLength(1); expect(counts.receipts).toHaveLength(1);
  await refused(f, () => repo.startVisit(f.ctx, f.members.operative.member, { ...raw, jobId: second.jobId }), "IDEMPOTENCY_CONFLICT");
  await refused(f, () => repo.startVisit(f.ctx, f.named.member, raw), "IDEMPOTENCY_CONFLICT");
 });
 it("[B9] complete: the same command id and payload returns one answer and the same result; the other answer conflicts and the stored answer is unchanged", async () => {
  const f = await visitFixture(c), a = f.members.operative, started = await start(f, a), raw = completeInput(f, started.visitId, "no");
  const first = await repo.completeVisit(f.ctx, a.member, raw);
  expect(await repo.completeVisit(f.ctx, a.member, raw)).toEqual(first);
  const counts = await snapshot(c, f.p.tenantId);
  expect(counts.answers).toHaveLength(1); expect(counts.events.filter((e: { event_type: string }) => e.event_type === "contractor.visit.completed")).toHaveLength(1);
  await refused(f, () => repo.completeVisit(f.ctx, a.member, { ...raw, closeoutAnswer: "yes" }), "IDEMPOTENCY_CONFLICT");
  expect((await answers(f.p.tenantId, started.visitId))[0]).toMatchObject({ answer: "no" });
 });
 it("[B9] a replay by a member who has since been revoked or taken off the job is refused before the stored result is read", async () => {
  const f = await visitFixture(c), g = await visitFixture(c);
  const raw = startInput(f), first = await repo.startVisit(f.ctx, f.members.operative.member, raw);
  await command(c, f, { kind: "team.move", membershipId: f.members.operative.member.membershipId, fromTeamId: f.demo.teamId, toTeamId: f.otherDemo.teamId });
  expect((await errorOf(() => repo.startVisit(f.ctx, f.members.operative.member, raw))).code).toBe("NOT_FOUND");
  const again = startInput(g), stored = await repo.startVisit(g.ctx, g.members.operative.member, again);
  expect(stored.visitId).toBeTruthy(); expect(first.visitId).toBeTruthy();
  await command(c, g, { kind: "membership.revoke", membershipId: g.members.operative.member.membershipId });
  expect((await errorOf(() => repo.startVisit(g.ctx, g.members.operative.member, again))).code).toBe("VISIT_FORBIDDEN");
 });
 it("[B10] one open visit per member per job; a new start works after completion; two named members may each hold one", async () => {
  const f = await visitFixture(c), a = f.members.operative;
  const open = await start(f, a);
  await refused(f, () => start(f, a), "VISIT_ALREADY_OPEN");
  const other = await start(f, f.named);
  expect(other.visitId).not.toBe(open.visitId);
  await complete(f, a, open.visitId, "no");
  const next = await start(f, a);
  expect(next.visitId).not.toBe(open.visitId);
 });
});

// The coordinator's ruling "B-prime": these routes are pre_live_allowed in the registry, carry their own live guard and prove their own replay properties here.
for (const kind of ["start", "complete"] as const) describe(`B-prime replay and live-guard properties: ${kind}`, () => {
 /** An open or completed visit, the command under test, and a callable that replays or varies it. */
 async function setup() {
  const f = await visitFixture(c), second = await secondJob(c, f), a = f.members.operative;
  const open = kind === "complete" ? await start(f, a) : undefined;
  return { f, second, a, open };
 }
 const run = (f: VisitFixture, a: Actor, raw: Record<string, unknown>) => kind === "start" ? repo.startVisit(f.ctx, a.member, raw) : repo.completeVisit(f.ctx, a.member, raw);
 const input = (f: VisitFixture, open: { visitId: string } | undefined, fields: Record<string, unknown> = {}) => kind === "start" ? startInput(f, fields) : completeInput(f, open!.visitId, "yes", fields);
 it(`[BP-a] ${kind}: replaying a command id returns the first result, never the job's current state`, async () => {
  const { f, a, open } = await setup(), raw = input(f, open);
  const first = await run(f, a, raw);
  // Move the job on: a started visit is completed (and a new one opened), a completed visit is followed by a new start.
  if (kind === "start") await complete(f, a, (first as { visitId: string }).visitId, "no"); else await start(f, a);
  const before = await snapshot(c, f.p.tenantId);
  expect(await run(f, a, raw)).toEqual(first);
  expect(await snapshot(c, f.p.tenantId)).toEqual(before);
 });
 it(`[BP-b] ${kind}: the same command id with a changed payload conflicts`, async () => {
  const { f, second, a, open } = await setup(), raw = input(f, open);
  await run(f, a, raw);
  if (kind === "start") await refused(f, () => run(f, a, { ...raw, jobId: second.jobId }), "IDEMPOTENCY_CONFLICT");
  else await refused(f, () => run(f, a, { ...raw, closeoutAnswer: "no" }), "IDEMPOTENCY_CONFLICT");
 });
 it(`[BP-c] ${kind}: the same command id on another job conflicts`, async () => {
  const { f, second, a, open } = await setup(), raw = input(f, open);
  await run(f, a, raw);
  const there = kind === "start" ? { ...raw, jobId: second.jobId } : { ...raw, jobId: second.jobId, visitId: (await repo.startVisit(f.ctx, a.member, startInput(f, { jobId: second.jobId }))).visitId };
  await refused(f, () => run(f, a, there), "IDEMPOTENCY_CONFLICT");
 });
 it(`[BP-d] ${kind}: a successful no-op keeps its identity`, async () => {
  // The first successful call is never a no-op here (it writes the visit or the answer); the property applies to the replay of that same id and body:
  // it returns the same visit id (and the same answer id) and writes nothing new.
  const { f, a, open } = await setup(), raw = input(f, open);
  const first = await run(f, a, raw);
  const ids = async () => ({ visits: (await c.admin.query("SELECT id FROM app.site_visit WHERE tenant_id=$1 ORDER BY id", [f.p.tenantId])).rows, answers: (await c.admin.query("SELECT id FROM app.closeout_answer WHERE tenant_id=$1 ORDER BY id", [f.p.tenantId])).rows, events: (await c.admin.query("SELECT id FROM app.audit_event WHERE tenant_id=$1 ORDER BY id", [f.p.tenantId])).rows });
  const before = await ids();
  const replay = await run(f, a, raw);
  expect(replay).toEqual(first); expect((replay as { visitId: string }).visitId).toBe((first as { visitId: string }).visitId);
  expect(await ids()).toEqual(before);
 });
 it(`[BP-e] ${kind}: a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written`, async () => {
  const { f, a, open } = await setup(), raw = input(f, open);
  await moveOffLive(c, f);
  const before = await snapshot(c, f.p.tenantId), refusals = (await refusalEvents(c, f.p.tenantId)).length;
  const error = await errorOf(() => run(f, a, raw));
  expect(error).toBeInstanceOf(SiteVisitError); expect(error.code).toBe("JOB_NOT_LIVE");
  expect(await snapshot(c, f.p.tenantId)).toEqual(before);
  expect((await refusalEvents(c, f.p.tenantId)).length).toBe(refusals);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows[0]!.n).toBe(0);
 });
 it(`[BP-f] ${kind}: an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job`, async () => {
  const f = await visitFixture(c), foreign = await fixture(c), gone = await secondJob(c, f);
  await moveOffLive(c, f, "invoiced", gone.jobId);
  const open = kind === "complete" ? await ownerVisit(c, f, f.members.operative.member.membershipId) : undefined;
  const callers: Array<[string, Actor, string]> = [["a role that may not visit at all", f.members.finance, "VISIT_FORBIDDEN"], ["a role that may visit but is not named on the job", f.unassigned, "NOT_FOUND"]];
  for (const [label, who, code] of callers) {
   const errors: SiteVisitError[] = [];
   for (const job of [randomUUID(), foreign.jobId, gone.jobId, f.jobId]) {
    const raw = kind === "start" ? startInput(f, { jobId: job }) : completeInput(f, open ?? randomUUID(), "yes", { jobId: job });
    errors.push(await refused(f, () => run(f, who, raw), code));
   }
   for (const error of errors) expect(plain(error), label).toEqual(plain(errors[0]!));
  }
 });
});

describe("ENT-3b repair round 2 authority races (real PostgreSQL)", () => {
 for (const kind of ["start", "complete"] as const) it(`[R2] ${kind}: replay holds the shared authority lock and rechecks authority and ownership after reading the receipt`, async () => {
  const f = await visitFixture(c), a = f.members.operative;
  const open = kind === "complete" ? await start(f, a) : undefined;
  const raw = kind === "start" ? startInput(f) : completeInput(f, open!.visitId, "yes");
  const first = kind === "start" ? await repo.startVisit(f.ctx, a.member, raw) : await repo.completeVisit(f.ctx, a.member, raw);
  const before = await snapshot(c, f.p.tenantId), head = await auditHead(c, f.p.tenantId);
  const observed = new ObservedPool(c.runtime, c.admin), watched = new SiteVisitRepository(observed.pool);
  const { value, transactions } = await observed.record(() => kind === "start" ? watched.startVisit(f.ctx, a.member, raw) : watched.completeVisit(f.ctx, a.member, raw));
  expect(value).toEqual(first);
  const replay = transactions.find(t => t.statements.some(s => /SELECT request_hash,status,result FROM app.command_receipt/u.test(s.sql)));
  expect(replay).toBeDefined(); expect(replay!.outcome).toBe("commit");
  const analysis = analyseLockOrder(replay!, { mutable: await mutableTables(c.admin) });
  expect(analysis.firstStatement).toMatch(/pg_advisory_xact_lock_shared\(hashtextextended\(\$1,54\)\)/u);
  expect(analysis.auditIndex).toBeUndefined(); expect(analysis.strongTableLocks).toEqual([]);
  const statements = replay!.statements, receiptIndex = statements.findIndex(s => /SELECT request_hash,status,result FROM app.command_receipt/u.test(s.sql));
  const checks = statements.flatMap((s, index) => /SELECT decision,reason_code FROM app.ent3b_visit_authority/u.test(s.sql) ? [index] : []);
  expect(checks).toHaveLength(2); expect(checks[0]).toBeLessThan(receiptIndex); expect(checks[1]).toBeGreaterThan(receiptIndex);
  const held = statements[statements.findIndex(s => s.sql === analysis.firstStatement)]!.footprint.advisory;
  expect(held.size).toBe(1);
  for (const statement of statements.slice(receiptIndex)) expect([...statement.footprint.advisory]).toEqual([...held]);
  if (kind === "complete") expect(statements.slice(receiptIndex).some(s => /SELECT 1 FROM app.site_visit .*membership_id=\$4/u.test(s.sql))).toBe(true);
  expect(await snapshot(c, f.p.tenantId)).toEqual(before); expect(await auditHead(c, f.p.tenantId)).toBe(head);
 });
 for (const kind of ["start", "complete"] as const) for (const path of ["live-guard", "replay"] as const) for (const change of ["membership-revocation", "job-removal"] as const) {
  it(`[R2] ${kind} ${path}: ${change} after the pre-check receives the same authority refusal, with no writes or cached result`, async () => {
   const f = await visitFixture(c), a = f.members.operative;
   const open = kind === "complete" ? await start(f, a) : undefined;
   const raw = kind === "start" ? startInput(f) : completeInput(f, open!.visitId, "yes");
   const run = () => kind === "start" ? repo.startVisit(f.ctx, a.member, raw) : repo.completeVisit(f.ctx, a.member, raw);
   const first = path === "replay" ? await run() : undefined;
   if (path === "live-guard") await moveOffLive(c, f);
   const original = (repo as any).precheck.bind(repo);
   let reached = 0, before: Awaited<ReturnType<typeof snapshot>> | undefined;
   const spy = vi.spyOn(repo as any, "precheck").mockImplementation(async (...args: unknown[]) => {
    const authority = await original(...args);
    if (reached === 0) {
     expect(authority, "the real pre-check must allow the caller before the race").toBeNull();
     reached++;
     // The pre-check has COMMITted and released its connection. This is a separate real PostgreSQL command/COMMIT before the visit transaction starts.
     if (change === "membership-revocation") await command(c, f, { kind: "membership.revoke", membershipId: a.member.membershipId });
     else await reviseOrder(c, f, f.revision, [f.named.member.membershipId]);
     const decision = await withTenant(c.runtime, f.ctx, async db => (await db.$client.query("SELECT decision,reason_code FROM app.ent3b_visit_authority($1,$2)", [a.member.membershipId, f.jobId])).rows);
     expect(decision).toEqual(change === "membership-revocation" ? [{ decision: "forbidden", reason_code: "member_inactive" }] : [{ decision: "not_found", reason_code: "job_out_of_scope" }]);
     before = await snapshot(c, f.p.tenantId);
    }
    return authority;
   });
   let error: SiteVisitError;
   try { error = await errorOf(run); } finally { spy.mockRestore(); }
   expect(reached).toBe(1); expect(before).toBeDefined();
   expect(error).toBeInstanceOf(SiteVisitError);
   const code = change === "membership-revocation" ? "VISIT_FORBIDDEN" : "NOT_FOUND";
   expect(plain(error)).toEqual({ name: "SiteVisitError", message: code, code });
   const response = { status: siteVisitHttpStatus(error.code), body: siteVisitFailureV1.parse({ version: "site-visit-error.v1", code: error.code }) };
   expect(response).toEqual({ status: change === "membership-revocation" ? 403 : 404, body: { version: "site-visit-error.v1", code } });
   expect(error).not.toHaveProperty("result"); expect(error).not.toHaveProperty("closeoutAnswer"); expect(error).not.toHaveProperty("visitId");
   expect(JSON.stringify(response)).not.toMatch(/visitId|startedAt|completedAt|closeoutAnswer|JOB_NOT_LIVE/u);
   expect(await snapshot(c, f.p.tenantId)).toEqual(before);
   const receipt = (await c.admin.query("SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows;
   expect(receipt).toEqual(path === "replay" ? [{ status: "succeeded", result: first }] : []);
   // The same request after the revoke (before its pre-check) must expose exactly the same error, status and body.
   const head = await auditHead(c, f.p.tenantId), preRevoked = await errorOf(run);
   expect(plain(preRevoked)).toEqual(plain(error));
   expect({ status: siteVisitHttpStatus(preRevoked.code), body: siteVisitFailureV1.parse({ version: "site-visit-error.v1", code: preRevoked.code }) }).toEqual(response);
   expect(await snapshot(c, f.p.tenantId)).toEqual(before); expect(await auditHead(c, f.p.tenantId)).toBe(head);
   expect((await refusalEvents(c, f.p.tenantId)).filter(e => e.subject_ref === raw.commandId)).toHaveLength(1);
   await chain(c, f);
  });
 }
 for (const kind of ["start", "complete"] as const) it(`[R2] ${kind}: a live-guard refusal rolls back before rechecking authority and conceals job state if membership is then revoked`, async () => {
  const f = await visitFixture(c), a = f.members.operative;
  const open = kind === "complete" ? await start(f, a) : undefined;
  const raw = kind === "start" ? startInput(f) : completeInput(f, open!.visitId, "yes");
  await moveOffLive(c, f);
  const original = (repo as any).precheck.bind(repo);
  let checks = 0, before: Awaited<ReturnType<typeof snapshot>> | undefined;
  const spy = vi.spyOn(repo as any, "precheck").mockImplementation(async (...args: unknown[]) => {
   checks++;
   if (checks === 2) {
    // This command needs the exclusive tenant lock. It can commit here only after the refused visit transaction has rolled back its shared lock.
    await command(c, f, { kind: "membership.revoke", membershipId: a.member.membershipId });
    before = await snapshot(c, f.p.tenantId);
   }
   const authority = await original(...args);
   if (checks === 1) expect(authority).toBeNull();
   return authority;
  });
  let error: SiteVisitError;
  try { error = await errorOf(() => kind === "start" ? repo.startVisit(f.ctx, a.member, raw) : repo.completeVisit(f.ctx, a.member, raw)); } finally { spy.mockRestore(); }
  expect(checks).toBe(2); expect(before).toBeDefined();
  expect(plain(error)).toEqual({ name: "SiteVisitError", message: "VISIT_FORBIDDEN", code: "VISIT_FORBIDDEN" });
  expect({ status: siteVisitHttpStatus(error.code), body: siteVisitFailureV1.parse({ version: "site-visit-error.v1", code: error.code }) }).toEqual({ status: 403, body: { version: "site-visit-error.v1", code: "VISIT_FORBIDDEN" } });
  expect(await snapshot(c, f.p.tenantId)).toEqual(before);
  expect((await c.admin.query("SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([]);
  await chain(c, f);
 });
});

describe("ENT-3b live only", () => {
 it("[B14] a named member on a not-live job gets JOB_NOT_LIVE for both commands; a member who may not visit it never learns that", async () => {
  const f = await visitFixture(c), a = f.members.operative, open = await start(f, a);
  await moveOffLive(c, f);
  await refused(f, () => start(f, f.named), "JOB_NOT_LIVE");
  await refused(f, () => complete(f, a, open.visitId), "JOB_NOT_LIVE");
  await refused(f, () => start(f, f.members.finance), "VISIT_FORBIDDEN");
  await refused(f, () => start(f, f.unassigned), "NOT_FOUND");
  await refused(f, () => complete(f, f.unassigned, open.visitId), "NOT_FOUND");
 });
});

describe("ENT-3b races on independent connections", () => {
 it("[B11] the same start sent twice at once is one visit and two equal answers", async () => {
  const f = await visitFixture(c), raw = startInput(f);
  const [one, two] = await Promise.all([repo.startVisit(f.ctx, f.members.operative.member, raw), repo.startVisit(f.ctx, f.members.operative.member, raw)]);
  expect(one).toEqual(two); expect((await snapshot(c, f.p.tenantId)).visits).toHaveLength(1);
 });
 it("[B11] two different start commands by the same member at once: exactly one succeeds", async () => {
  const f = await visitFixture(c), a = f.members.operative;
  const results = await Promise.allSettled([start(f, a), start(f, a)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ code: "VISIT_ALREADY_OPEN" }); expect((await snapshot(c, f.p.tenantId)).visits).toHaveLength(1);
 });
 it("[B11] the same completion sent twice at once is one answer; two different completions at once: exactly one succeeds", async () => {
  const f = await visitFixture(c), g = await visitFixture(c), a = f.members.operative, b = g.members.operative;
  const open = await start(f, a), raw = completeInput(f, open.visitId, "yes");
  const [one, two] = await Promise.all([repo.completeVisit(f.ctx, a.member, raw), repo.completeVisit(f.ctx, a.member, raw)]);
  expect(one).toEqual(two); expect((await snapshot(c, f.p.tenantId)).answers).toHaveLength(1);
  const gOpen = await start(g, b);
  const results = await Promise.allSettled([complete(g, b, gOpen.visitId, "yes"), complete(g, b, gOpen.visitId, "no")]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "VISIT_ALREADY_COMPLETED" }); expect((await snapshot(c, g.p.tenantId)).answers).toHaveLength(1);
 });
 it("[B11] a revoke holding the tenant lock while a start is in flight: the start waits and is refused with nothing written once the revoke commits", async () => {
  const f = await visitFixture(c), before = await snapshot(c, f.p.tenantId);
  const holder = await c.admin.connect();
  try {
   await holder.query("BEGIN"); await holder.query("SET LOCAL ROLE jobguard_migration"); await holder.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
   // The merged administration key: the same exclusive tenant lock a grant, membership or team command takes.
   await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [f.p.tenantId]);
   await holder.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) VALUES($1,$2,$3)", [f.p.tenantId, randomUUID(), f.named.grant]);
   const pending = errorOf(() => start(f, f.named));
   await waitForBlockedLock();
   await holder.query("COMMIT");
   expect((await pending).code).toBe("NOT_FOUND");
  } finally { holder.release(); }
  const after = await snapshot(c, f.p.tenantId);
  expect(after).toEqual(before);
 });
});

describe("ENT-3b the audit event is in the same transaction", () => {
 for (const kind of ["start", "complete"] as const) it(`[B12] ${kind}: a failure at the receipt insert, the routine call, the audit insert or the commit leaves nothing written`, async () => {
  const f = await visitFixture(c), a = f.members.operative;
  const open = kind === "complete" ? await start(f, a) : undefined;
  const fragments = ["INSERT INTO app.command_receipt", kind === "start" ? "app.ent3b_start_visit" : "app.ent3b_complete_visit", "INSERT INTO app.audit_event", "COMMIT"];
  for (const fragment of fragments) {
   const before = await snapshot(c, f.p.tenantId), head = await auditHead(c, f.p.tenantId);
   const raw = kind === "start" ? startInput(f) : completeInput(f, open!.visitId, "yes");
   const connect = c.runtime.connect.bind(c.runtime), wrapped = new WeakSet<object>(), spy = vi.spyOn(c.runtime, "connect");
   const failureText = "ENT-3b injected PostgreSQL failure";
   let reached = 0;
   spy.mockImplementation((async () => {
    const client = await connect();
    // The pre-check releases its client before the command borrows it again.
    // Capture the real query once, following the merged ENT-3a/ENT-4c pattern.
    if (wrapped.has(client)) return client;
    wrapped.add(client);
    const original = client.query.bind(client);
    let commandTransaction = false;
    vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => {
     if (sql === "BEGIN") commandTransaction = false;
     if (String(sql).includes("require_watchdog_live")) commandTransaction = true;
     if (String(sql).includes(fragment) && (fragment !== "COMMIT" || commandTransaction)) {
      // Exercise the deferred checks, but never execute COMMIT before failing.
      if (fragment === "COMMIT") await original("SET CONSTRAINTS ALL IMMEDIATE");
      reached++;
      throw Object.assign(new Error(failureText), { code: "23514", detail: failureText, table: "site_visit" });
     }
     return original(sql, params);
    }) as any);
    return client;
   }) as any);
   try {
    const pending = kind === "start" ? repo.startVisit(f.ctx, a.member, raw) : repo.completeVisit(f.ctx, a.member, raw);
    await expect(pending).rejects.toMatchObject({ code: "SITE_VISIT_UNAVAILABLE", message: "SITE_VISIT_UNAVAILABLE" });
    expect(reached, `${kind}: ${fragment} must be reached`).toBe(1);
    const error = await errorOf(() => pending);
    expect(error).toBeInstanceOf(SiteVisitError);
    expect(plain(error)).toEqual({ name: "SiteVisitError", message: "SITE_VISIT_UNAVAILABLE", code: "SITE_VISIT_UNAVAILABLE" });
    expect(JSON.stringify(error)).not.toContain(failureText);
    expect(error).not.toHaveProperty("detail"); expect(error).not.toHaveProperty("table");
   } finally { vi.restoreAllMocks(); }
   expect(await snapshot(c, f.p.tenantId), fragment).toEqual(before); expect(await auditHead(c, f.p.tenantId), fragment).toBe(head);
   expect((await c.admin.query("SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows, fragment).toEqual([]);
   expect((await snapshot(c, f.p.tenantId)).answers, fragment).toEqual([]);
   if (kind === "start") expect((await snapshot(c, f.p.tenantId)).visits, fragment).toEqual([]);
   else expect((await visitRow(open!.visitId, f.p.tenantId)).completed, fragment).toBeNull();
  }
 });
 it("[B12] the visit update, the answer row and the completion audit event carry the same transaction id", async () => {
  const f = await visitFixture(c), a = f.members.operative, open = await start(f, a);
  // Read the start's tuple version before completion updates the visit's xmin.
  const started = (await c.admin.query("SELECT v.xmin::text visit_x, e.xmin::text event_x FROM app.site_visit v JOIN app.audit_event e ON(e.tenant_id,e.id)=(v.tenant_id,v.id) WHERE v.tenant_id=$1 AND v.id=$2 AND e.event_type='contractor.visit.started'", [f.p.tenantId, open.visitId])).rows;
  expect(started).toHaveLength(1);
  expect(started[0].visit_x).toBe(started[0].event_x);
  await complete(f, a, open.visitId, "yes");
  const rows = (await c.admin.query(`SELECT v.xmin::text visit_x, a.xmin::text answer_x, e.xmin::text event_x FROM app.site_visit v JOIN app.closeout_answer a ON(a.tenant_id,a.site_visit_id)=(v.tenant_id,v.id)
   JOIN app.audit_event e ON(e.tenant_id,e.id)=(a.tenant_id,a.id) WHERE v.tenant_id=$1 AND v.id=$2`, [f.p.tenantId, open.visitId])).rows;
  expect(rows).toHaveLength(1); expect(rows[0].visit_x).toBe(rows[0].answer_x); expect(rows[0].answer_x).toBe(rows[0].event_x);
 });
 it("[B12] an answer row inserted by the owner with no matching audit event fails at commit with CLOSEOUT_AUDIT_REQUIRED, also when another company has an event with the same id", async () => {
  const f = await visitFixture(c), other = await visitFixture(c), a = f.members.operative, visit = await ownerVisit(c, f, a.member.membershipId);
  const answer = randomUUID(), command = randomUUID();
  const attempt = () => ownerTx(c, f.p.tenantId, async db => {
   await db.$client.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'CompleteSiteVisit',$3,$4,'processing',$5)", [f.p.tenantId, command, `owner:${command}`, "c".repeat(64), a.member.membershipId]);
   await db.$client.query("UPDATE app.site_visit SET completed_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, visit]);
   await db.$client.query("INSERT INTO app.closeout_answer(tenant_id,id,job_id,work_order_id,site_visit_id,membership_id,question_version,answer,command_id,server_recorded_at) SELECT tenant_id,$3,job_id,work_order_id,id,membership_id,'closeout-question.v1','yes',$4,completed_at FROM app.site_visit WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, visit, answer, command]);
  });
  await expect(attempt()).rejects.toMatchObject({ message: "CLOSEOUT_AUDIT_REQUIRED", code: "23514" });
  // The decoy: another company's completion event with the very same id, subject and type. The table owner sees it; the check must not.
  await ownerTx(c, other.p.tenantId, async db => {
   await appendAuditBatch(db, [{ id: answer, version: "audit.v1", actorRef: `membership:${other.p.membershipId}`, eventType: "contractor.visit.completed", subjectType: "site-visit", subjectRef: visit, payload: { references: { environment: "synthetic_demo" } } }]);
  });
  await expect(attempt()).rejects.toMatchObject({ message: "CLOSEOUT_AUDIT_REQUIRED", code: "23514" });
  expect((await visitRow(visit, f.p.tenantId)).completed).toBeNull(); expect(await answers(f.p.tenantId, visit)).toEqual([]);
 });
 for (const kind of ["start", "complete"] as const) it(`[B12] ${kind}: observed with the lock observer, the shared tenant-authority lock is first and no lock is taken after the audit append`, async () => {
  const f = await visitFixture(c), a = f.members.operative, observed = new ObservedPool(c.runtime, c.admin), watched = new SiteVisitRepository(observed.pool);
  const open = kind === "complete" ? await start(f, a) : undefined;
  const { transactions } = await observed.record(() => kind === "start" ? watched.startVisit(f.ctx, a.member, startInput(f)) : watched.completeVisit(f.ctx, a.member, completeInput(f, open!.visitId, "yes")));
  const command = transactions.find(t => t.statements.some(s => /require_watchdog_live/u.test(s.sql)));
  expect(command, "the command transaction").toBeTruthy();
  const analysis = analyseLockOrder(command!, { mutable: await mutableTables(c.admin) });
  expect(analysis.firstStatement).toMatch(/pg_advisory_xact_lock_shared\(hashtextextended\(\$1,54\)\)/u);
  const statements = command!.statements.map(s => s.sql);
  const authorityIndex = statements.findIndex(sql => /SELECT decision,reason_code FROM app.ent3b_visit_authority/u.test(sql));
  const liveIndex = statements.findIndex(sql => /require_watchdog_live/u.test(sql));
  const receiptIndex = statements.findIndex(sql => /INSERT INTO app.command_receipt/u.test(sql));
  expect(authorityIndex).toBeGreaterThan(statements.indexOf(analysis.firstStatement!));
  expect(liveIndex).toBeGreaterThan(authorityIndex); expect(receiptIndex).toBeGreaterThan(liveIndex);
  expect(analysis.auditIndex).toBeDefined();
  expect(analysis.afterAudit.map(v => `${v.statement} => ${v.locks.join(", ")}`)).toEqual([]);
  expect(analysis.strongTableLocks).toEqual([]);
 });
});

describe("ENT-3b the refusal record", () => {
 it("[B13] one refusal event of the right shape for each reason; the same refused command sent three times leaves one; the job is named only when it is in this company", async () => {
  const f = await visitFixture(c), foreign = await fixture(c), small = await visitFixture(c), revoked = await visitFixture(c);
  await smallTrack(c, small); await command(c, revoked, { kind: "membership.revoke", membershipId: revoked.members.operative.member.membershipId });
  const cases: Array<[string, VisitFixture, Actor, string, string]> = [
   ["role_not_permitted", f, f.members.finance, f.jobId, "VISIT_FORBIDDEN"], ["job_out_of_scope", f, f.unassigned, f.jobId, "NOT_FOUND"],
   ["track_not_contractor", small, small.members.operative, small.jobId, "TRACK_FORBIDDEN"], ["member_inactive", revoked, revoked.members.operative, revoked.jobId, "VISIT_FORBIDDEN"],
  ];
  for (const [reason, fx, who, job, code] of cases) {
   const raw = startInput(fx, { jobId: job });
   for (let attempt = 0; attempt < 3; attempt++) expect((await errorOf(() => repo.startVisit(fx.ctx, who.member, raw))).code).toBe(code);
   const events = await refusalEvents(c, fx.p.tenantId), mine = events.filter(e => e.subject_ref === raw.commandId);
   expect(mine, reason).toHaveLength(1);
   expect(mine[0]).toMatchObject({ id: derivedUuid(`visit-refusal:${fx.p.tenantId}:${raw.commandId}:${reason}`), actor_ref: `membership:${who.member.membershipId}`, subject_type: "visit-command" });
   expect(mine[0]!.payload).toEqual({ references: { command: raw.commandId, command_type: "StartSiteVisit", reason, environment: "synthetic_demo", job }, classifications: { action: "security" } });
  }
  for (const job of [foreign.jobId, randomUUID()]) {
   const raw = startInput(f, { jobId: job });
   expect((await errorOf(() => repo.startVisit(f.ctx, f.unassigned.member, raw))).code).toBe("NOT_FOUND");
   const mine = (await refusalEvents(c, f.p.tenantId)).filter(e => e.subject_ref === raw.commandId);
   expect(mine).toHaveLength(1); expect(mine[0]!.payload.references).not.toHaveProperty("job");
  }
  const complete3 = completeInput(f, randomUUID());
  expect((await errorOf(() => repo.completeVisit(f.ctx, f.unassigned.member, complete3))).code).toBe("NOT_FOUND");
  expect((await refusalEvents(c, f.p.tenantId)).find(e => e.subject_ref === complete3.commandId)!.payload.references.command_type).toBe("CompleteSiteVisit");
 });
 it("[B13] with the audit append made to fail the caller still receives the same typed refusal", async () => {
  const f = await visitFixture(c), raw = startInput(f), connect = c.runtime.connect.bind(c.runtime), spy = vi.spyOn(c.runtime, "connect");
  const wrapped = new WeakSet<object>(), before = await snapshot(c, f.p.tenantId), head = await auditHead(c, f.p.tenantId);
  let reached = 0;
  spy.mockImplementation((async () => {
   const client = await connect();
   if (wrapped.has(client)) return client;
   wrapped.add(client);
   const original = client.query.bind(client);
   vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => {
    if (String(sql).includes("INSERT INTO app.audit_event")) { reached++; throw new Error("injected failure"); }
    return original(sql, params);
   }) as any);
   return client;
  }) as any);
  try {
   const error = await errorOf(() => repo.startVisit(f.ctx, f.unassigned.member, raw));
   expect(plain(error)).toEqual({ name: "SiteVisitError", message: "NOT_FOUND", code: "NOT_FOUND" });
   expect(error).toBeInstanceOf(SiteVisitError);
   expect(JSON.stringify(error)).not.toContain("injected failure");
  } finally { vi.restoreAllMocks(); }
  expect(reached, "the refusal audit append must be reached").toBe(1);
  expect(await snapshot(c, f.p.tenantId)).toEqual(before); expect(await auditHead(c, f.p.tenantId)).toBe(head);
  expect((await refusalEvents(c, f.p.tenantId)).filter(e => e.subject_ref === raw.commandId)).toEqual([]);
  expect((await errorOf(() => repo.startVisit(f.ctx, f.unassigned.member, raw))).code).toBe("NOT_FOUND");
  expect((await refusalEvents(c, f.p.tenantId)).filter(e => e.subject_ref === raw.commandId)).toHaveLength(1);
 });
 it("[B13] validation errors, conflicts, replays, not-live refusals and the 422 codes write no refusal record", async () => {
  const f = await visitFixture(c), a = f.members.operative, before = (await refusalEvents(c, f.p.tenantId)).length;
  const first = await start(f, a);
  await errorOf(() => repo.startVisit(f.ctx, a.member, { jobId: f.jobId })); await errorOf(() => start(f, a));
  await errorOf(() => repo.startVisit(f.ctx, a.member, { commandId: first.visitId, jobId: f.jobId })); await complete(f, a, first.visitId, "yes");
  await errorOf(() => complete(f, a, first.visitId, "no"));
  await moveOffLive(c, f); await errorOf(() => start(f, f.named));
  expect((await refusalEvents(c, f.p.tenantId)).length).toBe(before);
 });
});

describe("ENT-3b the site worker's reads", () => {
 it("[B15] assigned jobs: exactly the jobs the caller is named on, with their own open visit, nothing else", async () => {
  const f = await visitFixture(c);
  const op = f.members.operative.member.membershipId, named = f.named.member.membershipId;
  const earlier = await secondJob(c, f, { dueOn: "2026-10-15" });
  const undated = await extraOrder(c, f, 3, [op, named], { dueOn: null });
  await extraOrder(c, f, 4, [named]);
  await extraOrder(c, f, 5, [op, named]);
  // Order 5 is then cancelled by a later revision; order 6 names nobody; the foreign tenant has its own order.
  await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "cancel-five.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 5, { expectedRevision: 1, status: "cancelled", lines: [], assignedMembershipIds: [] })]) });
  await extraOrder(c, f, 6, []);
  const reference = async (job: string) => (await c.admin.query("SELECT reference FROM app.work_order WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId, job])).rows[0]!.reference as string;
  const view = async (who: Actor) => { const result = await repo.assignedJobs(f.ctx, who.member); return { ...result, refs: await Promise.all(result.jobs.map(j => reference(j.jobId))) }; };
  const operativeView = await view(f.members.operative);
  expect(operativeView.refs).toEqual(["WO-DEMO-0002", "WO-DEMO-0001", "WO-DEMO-0003"]);
  expect(operativeView.truncated).toBe(false);
  expect(operativeView.jobs.map(j => j.jobId)).toEqual([earlier.jobId, f.jobId, undated.jobId]);
  expect(operativeView.jobs.every(j => j.openVisitId === null)).toBe(true);
  expect((await view(f.named)).refs).toEqual(["WO-DEMO-0002", "WO-DEMO-0001", "WO-DEMO-0004", "WO-DEMO-0003"]);
  const open = await start(f, f.members.operative);
  expect((await repo.assignedJobs(f.ctx, f.members.operative.member)).jobs.find(j => j.jobId === f.jobId)!.openVisitId).toBe(open.visitId);
  expect((await repo.assignedJobs(f.ctx, f.named.member)).jobs.find(j => j.jobId === f.jobId)!.openVisitId).toBeNull();
  await complete(f, f.members.operative, open.visitId, "no");
  expect((await repo.assignedJobs(f.ctx, f.members.operative.member)).jobs.find(j => j.jobId === f.jobId)!.openVisitId).toBeNull();
  const parsed = siteAssignedJobsV1.parse({ version: "site-assigned-jobs.v1", environment: "synthetic_demo", realExternalActions: 0, ...(await repo.assignedJobs(f.ctx, f.members.operative.member)) });
  expect(JSON.stringify(parsed)).not.toMatch(/pence|rate|net|resident|contact|address/iu);
  for (const role of forbiddenRoles) expect((await errorOf(() => repo.assignedJobs(f.ctx, f.members[role].member))).code, role).toBe("VISIT_FORBIDDEN");
  expect(await repo.assignedJobs(f.ctx, f.members.supervisor.member)).toEqual({ jobs: [], truncated: false });
  expect(await repo.assignedJobs(f.ctx, f.unassigned.member)).toEqual({ jobs: [], truncated: false });
 });
 it("[B15] order lines: the current revision's lines in position order, only the new revision's after a revised import, and every refusal applies", async () => {
  const f = await visitFixture(c), foreign = await fixture(c), a = f.members.operative;
  const first = await repo.orderLines(f.ctx, a.member, f.jobId);
  expect(first).toMatchObject({ jobId: f.jobId, workOrderId: f.orderId, revision: 2 });
  expect(first.lines.map(l => l.position)).toEqual([0, 1]); expect(first.lines.map(l => l.clientLineReference)).toEqual(["L1", "L2"]);
  expect(first.lines[0]).toMatchObject({ sorCode: "REPAIR-DOOR", description: "Repair internal door", unit: "each", quantity: "1" });
  await reviseOrder(c, f, 2, [f.demo.operativeMembershipId, f.named.member.membershipId], { lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "5" }, { clientLineReference: "EXTRA", sorCode: "FIT-LOCK", quantity: "1" }] });
  const second = await repo.orderLines(f.ctx, a.member, f.jobId);
  expect(second.revision).toBe(3); expect(second.lines.map(l => l.clientLineReference)).toEqual(["L1", "EXTRA"]); expect(second.lines[0]!.quantity).toBe("5");
  expect(JSON.stringify(siteOrderLinesV1.parse({ version: "site-order-lines.v1", environment: "synthetic_demo", realExternalActions: 0, ...second }))).not.toMatch(/pence|rate|net|resident|contact|address/iu);
  const before = await snapshot(c, f.p.tenantId), refusals = (await refusalEvents(c, f.p.tenantId)).length;
  for (const role of forbiddenRoles) for (const job of [f.jobId, f.otherJob, foreign.jobId, randomUUID()]) expect((await errorOf(() => repo.orderLines(f.ctx, f.members[role].member, job))).code, role).toBe("VISIT_FORBIDDEN");
  const refusals404: SiteVisitError[] = [];
  for (const [who, job] of [[f.unassigned, f.jobId], [f.members.supervisor, f.jobId], [f.otherSupervisor, f.jobId], [a, randomUUID()], [a, foreign.jobId], [a, f.otherJob], [a, await smallJob(c, f)]] as Array<[Actor, string]>) refusals404.push(await errorOf(() => repo.orderLines(f.ctx, who.member, job)));
  for (const error of refusals404) expect(plain(error)).toEqual({ name: "SiteVisitError", message: "NOT_FOUND", code: "NOT_FOUND" });
  expect((await errorOf(() => repo.orderLines(f.ctx, a.member, "not-a-uuid"))).code).toBe("NOT_FOUND");
  expect(await snapshot(c, f.p.tenantId)).toEqual(before); expect((await refusalEvents(c, f.p.tenantId)).length).toBe(refusals);
  await cancelOrder(c, { ...f, revision: 3 } as VisitFixture);
  expect((await errorOf(() => repo.orderLines(f.ctx, a.member, f.jobId))).code).toBe("NOT_FOUND");
 });
});
