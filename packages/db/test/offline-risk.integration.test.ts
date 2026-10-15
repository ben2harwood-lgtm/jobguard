// PostgreSQL execution NOT RUN in the socket-restricted builder; CI must execute these assertions.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { SiteExtraError, siteAssignedJobsV1, siteExtraFailureV1, siteExtraHttpStatus, ExtraPersistenceError } from "@jobguard/core";
import { ExtraRepository, SiteExtraRepository, SiteVisitRepository, withTenant } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { cluster, siteFixture, invite, command, ownerTx, chain, counts, intent, submit, freshRuntime, facts, committed, revise, type Cluster, type SiteFixture } from "./offline-risk-test-utils.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 60_000);
afterAll(async () => { await c?.close(); });
afterEach(() => vi.restoreAllMocks());
const notLive = (f: SiteFixture, job = f.jobId) => ownerTx(c, f.p.tenantId, db => db.$client.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, job]));

it("M31-S09 minimal authorized repository read", async () => {
 const f = await siteFixture(c), foreign = await siteFixture(c), repo = new SiteVisitRepository(c.runtime);
 const supervisor = await invite(c, f, "supervisor", { kind: "team", id: f.demo.teamId });
 await revise(c, f, [f.members.operative.member.membershipId, supervisor.member.membershipId]);
 for (const actor of [f.members.operative, supervisor]) {
  const read = await repo.assignedJobs(f.ctx, actor.member);
  expect(read.jobs.map(j => j.jobId)).toEqual([f.jobId]); expect(read.truncated).toBe(false);
  expect(read.jobs.map(j => j.jobId)).not.toContain(f.otherJob); expect(read.jobs.map(j => j.jobId)).not.toContain(foreign.jobId);
  const parsed = siteAssignedJobsV1.parse({ version: "site-assigned-jobs.v1", environment: "synthetic_demo", realExternalActions: 0, ...read });
  expect(Object.keys(parsed.jobs[0]!).sort()).toEqual(["jobId", "workOrderId", "reference", "priority", "issuedOn", "dueOn", "openVisitId"].sort());
 }
 expect(await repo.assignedJobs(f.ctx, f.unassigned.member)).toEqual({ jobs: [], truncated: false });
 for (const role of ["owner", "admin", "surveyor", "commercial_manager", "finance", "read_only", "client_approver"] as const) await expect(repo.assignedJobs(f.ctx, f.members[role].member)).rejects.toMatchObject({ code: "VISIT_FORBIDDEN" });
});
it("M31-S10 queued intent commits existing facts", async () => {
 const f = await siteFixture(c), actor = f.members.operative.member, raw = intent(f.jobId, 1), before = await counts(c, f);
 const start = (await c.admin.query("SELECT clock_timestamp()::text value")).rows[0]!.value;
 const first = await submit(c.runtime, f, actor, raw);
 const end = (await c.admin.query("SELECT clock_timestamp()::text value")).rows[0]!.value;
 const origin = await committed(c, f, actor, raw, first);
 expect(origin.work_order_revision_id).toBe(f.revisionId);
 expect((await c.admin.query("SELECT server_recorded_at BETWEEN $3::timestamptz AND $4::timestamptz ok FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, first.variationId, start, end])).rows).toEqual([{ ok: true }]);
 const after = await counts(c, f);
 for (const table of ["command_receipt", "scope_identity", "variation", "extra_origin", "extra_event", "raised"]) expect(after[table]! - before[table]!, table).toBe(1);
 await chain(c, f);
});
it("M31-S11 fresh-instance persistence", async () => {
 const f = await siteFixture(c), actor = f.members.operative.member, raw = intent(f.jobId);
 const first = await freshRuntime(c, pool => submit(pool, f, actor, raw));
 const before = await facts(c, f), head = await chain(c, f);
 expect(await freshRuntime(c, pool => submit(pool, f, actor, raw))).toEqual(first);
 await committed(c, f, actor, raw, first); expect(await facts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
});
it("M31-S12 current authority on replay", async () => {
 for (const loss of ["membership", "grant", "assignment"] as const) {
  const f = await siteFixture(c), actor = f.members.operative, raw = intent(f.jobId);
  await submit(c.runtime, f, actor.member, raw);
  if (loss === "assignment") await revise(c, f, []);
  else await command(c, f, loss === "membership" ? { kind: "membership.revoke", membershipId: actor.member.membershipId } : { kind: "grant.revoke", grantId: actor.grant });
  const before = await facts(c, f);
  for (const request of [raw, intent(f.jobId)]) await expect(submit(c.runtime, f, actor.member, request)).rejects.toMatchObject({ code: loss === "membership" ? "EXTRA_FORBIDDEN" : "NOT_FOUND" });
  expect(await facts(c, f)).toEqual(before); await chain(c, f); // Existing refusal audit may append.
 }
});
it("M31-S13 tenant actor and resource boundaries", async () => {
 const f = await siteFixture(c), foreign = await siteFixture(c), actor = f.members.operative.member, raw = intent(f.jobId);
 const first = await submit(c.runtime, f, actor, raw), before = await facts(c, f), foreignBefore = await facts(c, foreign);
 for (const job of [foreign.jobId, f.otherJob, randomUUID()]) await expect(submit(c.runtime, f, actor, { ...raw, jobId: job })).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(submit(c.runtime, f, f.unassigned.member, raw)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(submit(c.runtime, f, f.members.supervisor.member, raw)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 await expect(submit(c.runtime, f, foreign.members.operative.member, raw)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
 const repo = new SiteExtraRepository(c.runtime), body = { commandId: raw.body.commandId, jobId: raw.jobId, note: raw.body.note, description: raw.body.description };
 await expect(repo.logSiteExtra(testTenantContext(foreign.p.tenantId), actor, body)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
 for (const invalid of [undefined, { tenantId: f.p.tenantId }]) {
  // Deliberately invalid values test the real stamp check; no alternative context constructor.
  await expect(withTenant(c.runtime, invalid as never, async () => undefined)).rejects.toMatchObject({ code: "INVALID_TENANT_CONTEXT" });
  await expect(repo.logSiteExtra(invalid as never, actor, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 }
 expect(await facts(c, f)).toEqual(before); expect(await facts(c, foreign)).toEqual(foreignBefore);
 await committed(c, f, actor, raw, first); await chain(c, f); await chain(c, foreign);
});
it("M31-S16 ambiguous response and rollback", async () => {
 const f = await siteFixture(c), actor = f.members.operative.member, raw = intent(f.jobId);
 let stored: { variationId: string } | undefined;
 await expect((async () => { stored = await submit(c.runtime, f, actor, raw); throw new Error("simulated lost response after commit"); })()).rejects.toThrow("simulated lost response after commit");
 expect(stored).toBeDefined(); const before = await facts(c, f), head = await chain(c, f);
 expect(await freshRuntime(c, pool => submit(pool, f, actor, raw))).toEqual(stored);
 expect(await facts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
 const failing = intent(f.jobId, 1), original = ExtraRepository.prototype.raiseExtra;
 let reached = false;
 vi.spyOn(ExtraRepository.prototype, "raiseExtra").mockImplementationOnce(function(this: ExtraRepository, context, input, seam) {
  return original.call(this, context, input, async (db, fact) => { await seam?.(db, fact); reached = true; throw new ExtraPersistenceError("DATABASE_UNAVAILABLE"); });
 });
 await expect(submit(c.runtime, f, actor, failing)).rejects.toMatchObject({ code: "SITE_EXTRA_UNAVAILABLE" });
 expect(reached).toBe(true); expect(await facts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
});
it("M31-S17 compatibility", async () => {
 const f = await siteFixture(c), actor = f.members.supervisor.member, raw = intent(f.jobId), first = await submit(c.runtime, f, actor, raw);
 const receipt = (await c.admin.query("SELECT request_hash,result::text FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.body.commandId])).rows;
 const changedMetadata = { ...raw, clientMetadata: { capturedAt: "2099-01-01T00:00:00Z", hlc: { wallTimeMs: Number.MAX_SAFE_INTEGER, logical: 5, nodeId: "different" } } };
 expect(await submit(c.runtime, f, actor, changedMetadata)).toEqual(first);
 // Direct old body has no transport metadata; it reads the same receipt and request hash.
 expect(await new SiteExtraRepository(c.runtime).logSiteExtra(f.ctx, actor, { commandId: raw.body.commandId, jobId: raw.jobId, note: raw.body.note, description: raw.body.description })).toEqual(first);
 expect((await c.admin.query("SELECT request_hash,result::text FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.body.commandId])).rows).toEqual(receipt);
 await committed(c, f, actor, raw, first);
});

it("replaying a command id returns the first result, never the job's current state", async () => {
 const f = await siteFixture(c), actor = f.members.supervisor.member, raw = intent(f.jobId), first = await submit(c.runtime, f, actor, raw);
 await revise(c, f, [f.members.operative.member.membershipId]);
 const laterRaw = intent(f.jobId, 1), later = await submit(c.runtime, f, actor, laterRaw);
 const oldOrigin = await committed(c, f, actor, raw, first), newOrigin = await committed(c, f, actor, laterRaw, later);
 expect(oldOrigin.work_order_revision_id).toBe(f.revisionId); expect(newOrigin.work_order_revision_id).not.toBe(f.revisionId);
 const before = await facts(c, f), head = await chain(c, f);
 expect(await freshRuntime(c, pool => submit(pool, f, actor, raw))).toEqual(first);
 expect(await facts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
});
it("the same command id with a changed payload conflicts", async () => {
 const f = await siteFixture(c), actor = f.members.supervisor.member, raw = intent(f.jobId), first = await submit(c.runtime, f, actor, raw), before = await facts(c, f), head = await chain(c, f);
 for (const field of ["note", "description"]) await expect(submit(c.runtime, f, actor, { ...raw, body: { ...raw.body, [field]: "Fictional changed input" } })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 expect(await facts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head); await committed(c, f, actor, raw, first);
});
it("the same command id on another job conflicts", async () => {
 const f = await siteFixture(c), actor = (await invite(c, f, "supervisor", { kind: "tenant", id: f.p.tenantId })).member;
 // A new command on either job succeeds, proving both selectors are permitted before checking identity conflict.
 await submit(c.runtime, f, actor, intent(f.otherJob));
 const raw = intent(f.jobId), first = await submit(c.runtime, f, actor, raw), before = await facts(c, f), head = await chain(c, f);
 await expect(submit(c.runtime, f, actor, { ...raw, jobId: f.otherJob })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 expect(await facts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head); await committed(c, f, actor, raw, first);
});
it("a successful no-op keeps its identity", async () => {
 const f = await siteFixture(c), actor = f.members.supervisor.member, raw = intent(f.jobId), first = await submit(c.runtime, f, actor, raw), before = await facts(c, f), head = await chain(c, f);
 for (let i = 0; i < 3; i++) expect(await submit(c.runtime, f, actor, raw)).toEqual(first);
 expect(await facts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
});
it("a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written", async () => {
 for (const when of ["before precheck", "after precheck"] as const) {
  const f = await siteFixture(c), actor = f.members.supervisor.member, raw = intent(f.jobId);
  if (when === "before precheck") await notLive(f);
  else {
   const original = ExtraRepository.prototype.raiseExtra;
   vi.spyOn(ExtraRepository.prototype, "raiseExtra").mockImplementationOnce(async function(this: ExtraRepository, context, input, seam) { await notLive(f); return original.call(this, context, input, seam); });
  }
  const before = await facts(c, f), head = await chain(c, f);
  await expect(submit(c.runtime, f, actor, raw)).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
  expect(await facts(c, f), when).toEqual(before); expect(await chain(c, f), when).toBe(head);
  vi.restoreAllMocks();
 }
});
it("an unauthorised caller gets the identical EXTRA_FORBIDDEN for unknown, foreign, not-live and live jobs", async () => {
 const f = await siteFixture(c), foreign = await siteFixture(c); await notLive(f, f.otherJob);
 const before = await facts(c, f);
 for (const role of ["owner", "admin", "commercial_manager", "finance", "read_only", "client_approver"] as const) {
  for (const job of [randomUUID(), foreign.jobId, f.otherJob, f.jobId]) {
   const error: unknown = await submit(c.runtime, f, f.members[role].member, intent(job)).then(() => { throw new Error("unexpected success"); }, error => error);
   expect(error).toBeInstanceOf(SiteExtraError);
   if (!(error instanceof SiteExtraError)) throw error;
   expect({ status: siteExtraHttpStatus(error.code), body: siteExtraFailureV1.parse({ version: "site-extra-error.v1", code: error.code }), code: error.code }).toEqual({ status: 403, body: { version: "site-extra-error.v1", code: "EXTRA_FORBIDDEN" }, code: "EXTRA_FORBIDDEN" });
  }
 }
 expect(await facts(c, f)).toEqual(before); await chain(c, f);
});
