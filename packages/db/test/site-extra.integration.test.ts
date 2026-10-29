// Written before the repository. NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { extraOriginHashV1, SiteExtraError, siteExtraFailureV1, siteExtraHttpStatus } from "@jobguard/core";
import { SiteExtraRepository, siteExtraAuthoritySeam, WatchdogError, withTenant, ExtraRepository, WorkOrderRepository, demoFile, demoRow, derivedUuid, type VerifiedTenantContext } from "../src/index.js";
import { cluster, siteFixture, input, counts, chain, command, invite, direct, decision, smallJob, smallTrack, cancel, ownerTx, originSql, originHashInput, note, description, type SiteFixture } from "./site-extra-fixtures.js";
import { fixture, type Cluster } from "./extra-fixtures.js";
let c: Cluster, repo: SiteExtraRepository;
beforeAll(async () => { c = await cluster(); repo = new SiteExtraRepository(c.runtime); }, 60_000);
afterAll(async () => { await c?.close(); });
afterEach(() => vi.restoreAllMocks());
async function refused(f: SiteFixture, member: SiteFixture["p"], raw: { commandId: string; jobId: string; note: string; description: string } = input(f), code = "NOT_FOUND") {
 const before = await counts(c, f);
 const error = await repo.logSiteExtra(f.ctx, member, raw).then(() => { throw new Error("unexpected success"); }, e => e as SiteExtraError);
 expect(error).toBeInstanceOf(SiteExtraError); expect(error.code).toBe(code); expect(error.message).toBe(code); expect(JSON.stringify(error)).not.toContain(note); expect(JSON.stringify(error)).not.toContain(description);
 expect(await counts(c, f)).toEqual(before); await chain(c, f); return error;
}
describe("ENT-3a governed path", () => {
 for (const role of ["operative", "supervisor", "surveyor"] as const) it(`[A2] ${role} logs only server-derived facts atomically`, async () => {
  const f = await siteFixture(c), a = f.members[role], raw = input(f), grant = (await decision(c, f, a.member, "LogSiteExtra"))[0]!.raising_grant;
  const before = (await c.admin.query("SELECT clock_timestamp()::text value")).rows[0]!.value;
  const result = await repo.logSiteExtra(f.ctx, a.member, raw);
  const after = (await c.admin.query("SELECT clock_timestamp()::text value")).rows[0]!.value;
  const rows = (await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, result.variationId])).rows;
  expect(rows).toHaveLength(1); const row = rows[0]!;
  expect(row).toMatchObject({ job_id: f.jobId, kind: "site_user", command_type: "LogSiteExtra", raising_membership_id: a.member.membershipId, raising_role: role, raising_grant_id: grant, work_order_revision_id: f.revisionId, ...(role === "operative" ? { raiser_assigned: true } : {}) });
  expect((await c.admin.query("SELECT server_recorded_at BETWEEN $3::timestamptz AND $4::timestamptz ok FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, result.variationId, before, after])).rows[0]!.ok).toBe(true);
  expect(row.origin_hash).toBe(extraOriginHashV1(originHashInput(row)));
  for (const [table, col] of [["variation", "id"], ["extra_origin", "variation_id"], ["extra_event", "variation_id"]]) expect((await c.admin.query(`SELECT 1 FROM app.${table} WHERE tenant_id=$1 AND ${col}=$2`, [f.p.tenantId, result.variationId])).rowCount).toBe(1);
  expect((await c.admin.query("SELECT kind FROM app.extra_event WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, result.variationId])).rows).toEqual([{ kind: "logged" }]);
  expect((await c.admin.query("SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([{ status: "succeeded" }]);
  expect((await c.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.raised'", [f.p.tenantId, result.variationId])).rowCount).toBe(1); await chain(c, f);
 });
 it("[A3] an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job", async () => {
  const f = await siteFixture(c), foreign = await fixture(c);
  await ownerTx(c, f.p.tenantId, db => db.$client.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.otherJob]));
  const targets = [{ kind: "unknown", jobId: randomUUID() }, { kind: "foreign", jobId: foreign.jobId }, { kind: "not-live", jobId: f.otherJob }, { kind: "live", jobId: f.jobId }];
  expect((await c.admin.query("SELECT id,status FROM app.job WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id", [f.p.tenantId, [f.jobId, f.otherJob]])).rows).toEqual([{ id: f.jobId, status: "live" }, { id: f.otherJob, status: "invoiced" }].sort((a, b) => a.id.localeCompare(b.id)));
  for (const role of ["owner", "admin", "commercial_manager", "finance", "read_only", "client_approver"] as const) {
   const raw = input(f), errors = [];
   for (const target of targets) {
    const error = await refused(f, f.members[role].member, { ...raw, jobId: target.jobId }, "EXTRA_FORBIDDEN");
    expect({ status: siteExtraHttpStatus(error.code), body: siteExtraFailureV1.parse({ version: "site-extra-error.v1", code: error.code }), code: error.code }, `${role}: ${target.kind}`).toEqual({ status: 403, body: { version: "site-extra-error.v1", code: "EXTRA_FORBIDDEN" }, code: "EXTRA_FORBIDDEN" });
    errors.push(error);
   }
   // The not-live target must not answer JOB_NOT_LIVE before caller authority is checked.
   for (const error of errors) expect(error).toEqual(errors[0]);
  }
 });
 it("[A4] every inaccessible job cause has identical NOT_FOUND and no business effect", async () => {
  const f = await siteFixture(c), foreign = await fixture(c), different = await invite(c, f, "surveyor", { kind: "branch", id: f.otherDemo.branchId });
  await command(c, f, { kind: "grant.create", membershipId: different.member.membershipId, role: "supervisor", scope: { kind: "team", id: f.demo.teamId }, contractId: null });
  const errors = [];
  for (const [member, jobId] of [[f.members.supervisor.member, randomUUID()], [f.members.supervisor.member, foreign.jobId], [f.members.supervisor.member, await smallJob(c, f)], [f.otherSupervisor.member, f.jobId], [f.otherSurveyor.member, f.jobId], [f.unassigned.member, f.jobId], [different.member, f.jobId]] as const) errors.push(await refused(f, member, { ...input(f), jobId }));
  await command(c, f, { kind: "team.move", membershipId: f.members.operative.member.membershipId, fromTeamId: f.demo.teamId, toTeamId: f.otherDemo.teamId });
  errors.push(await refused(f, f.members.operative.member));
  await cancel(c, f); errors.push(await refused(f, f.members.supervisor.member));
  for (const error of errors) expect(error).toEqual(errors[0]);
 });
 for (const kind of ["grant", "membership"] as const) it(`[A5] ${kind} revocation refuses new work and earlier replay`, async () => {
  const f = await siteFixture(c), a = f.members.supervisor, raw = input(f); await repo.logSiteExtra(f.ctx, a.member, raw);
  await command(c, f, kind === "grant" ? { kind: "grant.revoke", grantId: a.grant } : { kind: "membership.revoke", membershipId: a.member.membershipId });
  for (const request of [input(f), raw]) await refused(f, a.member, request, kind === "grant" ? "NOT_FOUND" : "EXTRA_FORBIDDEN");
 });
 it("[A6] seam alone refuses owner, permits supervisor and refuses an unchosen covering grant", async () => {
  const f = await siteFixture(c), extras = new ExtraRepository(c.runtime), before = await counts(c, f), head = await chain(c, f);
  await expect(extras.raiseExtra(f.ctx, direct(f, f.members.owner), siteExtraAuthoritySeam)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await counts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
  await extras.raiseExtra(f.ctx, direct(f, f.members.supervisor), siteExtraAuthoritySeam);
  const second = (await command(c, f, { kind: "grant.create", membershipId: f.members.supervisor.member.membershipId, role: "supervisor", scope: { kind: "branch", id: f.demo.branchId }, contractId: null })).id;
  const chosen = (await decision(c, f, f.members.supervisor.member, "LogSiteExtra"))[0]!.raising_grant;
  const unchosen = [f.members.supervisor.grant, second].find(id => id !== chosen)!;
  const now = await counts(c, f), currentHead = await chain(c, f);
  await expect(extras.raiseExtra(f.ctx, direct(f, f.members.supervisor, { grantId: unchosen }), siteExtraAuthoritySeam)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await counts(c, f)).toEqual(now); expect(await chain(c, f)).toBe(currentHead);
 });
 it("[A7] two concurrent commands on independent pooled connections have one effect", async () => {
  const f = await siteFixture(c), raw = input(f), before = await counts(c, f);
  const [a, b] = await Promise.all([repo.logSiteExtra(f.ctx, f.members.supervisor.member, raw), repo.logSiteExtra(f.ctx, f.members.supervisor.member, raw)]);
  expect(a).toEqual(b); const after = await counts(c, f);
  for (const t of ["command_receipt", "scope_identity", "variation", "extra_origin", "extra_event", "raised"]) expect(after[t]! - before[t]!).toBe(1); await chain(c, f);
 });
 for (const first of ["revoke", "log"] as const) it(`[A7] ${first} commits first under the shared administration lock, without sleeps`, async () => {
  const f = await siteFixture(c), a = f.members.supervisor, raw = input(f);
  const originalConnect = c.runtime.connect.bind(c.runtime), wrapped = new WeakSet<object>();
  let resume!: () => void, notify!: (pid: number) => void;
  const held = new Promise<void>(r => { resume = r; }), reached = new Promise<number>(r => { notify = r; }); let intercepted = false;
  const fragment = first === "revoke" ? "SELECT app.contractor_admin_command" : "SELECT app.ent3a_require_extra_authority";
  vi.spyOn(c.runtime, "connect").mockImplementation((async () => {
   const client = await originalConnect(); if (wrapped.has(client)) return client; wrapped.add(client); const original = client.query.bind(client);
   vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => {
    const value = await original(sql, params);
    if (!intercepted && String(sql).includes(fragment)) { intercepted = true; notify((client as unknown as { processID: number }).processID); await held; }
    return value;
   }) as any); return client;
  }) as any);
  const revocation = () => command(c, f, { kind: "grant.revoke", grantId: a.grant });
  const logging = () => repo.logSiteExtra(f.ctx, a.member, raw).then(v => ({ value: v }), e => ({ error: e as SiteExtraError }));
  const leading = first === "revoke" ? revocation() : logging();
  const pid = await reached;
  const trailing = first === "revoke" ? logging() : revocation();
  try {
   let blocked = false;
   for (let i = 0; i < 1000; i++) {
    const rows = (await c.admin.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))", [pid])).rows;
    if (rows.length) { blocked = true; break; }
   }
   expect(blocked).toBe(true);
  } finally { resume(); }
  const [one, two] = await Promise.all([leading, trailing]); vi.restoreAllMocks();
  const outcome = (first === "revoke" ? two : one) as { value?: { variationId: string }; error?: SiteExtraError };
  if (first === "revoke") { expect(outcome.error).toMatchObject({ code: "NOT_FOUND" }); expect((await c.admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rowCount).toBe(0); expect((await counts(c, f)).raised).toBe(0); }
  else { expect(outcome.value?.variationId).toBeDefined(); expect((await counts(c, f)).raised).toBe(1); }
  expect((await c.admin.query("SELECT 1 FROM app.role_grant_revocation WHERE tenant_id=$1 AND grant_id=$2", [f.p.tenantId, a.grant])).rowCount).toBe(1); await chain(c, f);
 });
 it("[A9] exact replay, conflicting note/member/grant and equal text with separate IDs", async () => {
  const f = await siteFixture(c), raw = input(f), a = f.members.supervisor.member, b = f.members.surveyor.member;
  const result = await repo.logSiteExtra(f.ctx, a, raw), before = await counts(c, f), head = await chain(c, f);
  expect(await repo.logSiteExtra(f.ctx, a, raw)).toEqual(result); expect(await counts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
  for (const [member, request] of [[a, { ...raw, note: "Fictional different note" }], [b, raw]] as const) await expect(repo.logSiteExtra(f.ctx, member, request)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  const another = await repo.logSiteExtra(f.ctx, b, { ...raw, commandId: randomUUID() }); expect(another).not.toEqual(result);
  expect((await counts(c, f)).extra_duplicate_link).toBe(0);
  await command(c, f, { kind: "grant.revoke", grantId: f.members.supervisor.grant });
  await command(c, f, { kind: "grant.create", membershipId: a.membershipId, role: "supervisor", scope: { kind: "team", id: f.demo.teamId }, contractId: null });
  const last = await counts(c, f); await expect(repo.logSiteExtra(f.ctx, a, raw)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" }); expect(await counts(c, f)).toEqual(last);
  for (const t of ["variation", "extra_origin", "extra_event"]) expect(last[t]).toBe(2); expect(last.raised).toBe(2);
 });
 it("[A10] tenant mismatch, foreign job, missing/unstamped contexts cannot touch tenant B", async () => {
  const f = await siteFixture(c), b = await siteFixture(c), small = await siteFixture(c); await smallTrack(c, small);
  const foreignCounts = await counts(c, b), foreignHead = await chain(c, b);
  await refused(f, f.members.supervisor.member, { ...input(f), jobId: b.jobId });
  await refused(f, b.members.supervisor.member, input(f), "EXTRA_FORBIDDEN");
  const connect = vi.spyOn(c.runtime, "connect");
  for (const bad of [undefined, { tenantId: f.p.tenantId }]) {
   connect.mockClear(); await expect(repo.logSiteExtra(bad as VerifiedTenantContext, f.members.supervisor.member, input(f))).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(connect).not.toHaveBeenCalled();
  }
  await refused(f, f.members.supervisor.member, { ...input(f), jobId: await smallJob(c, small) });
  expect(await counts(c, b)).toEqual(foreignCounts); expect(await chain(c, b)).toBe(foreignHead);
 });
 it("[A11] latest small-builder tenant assignment is TRACK_FORBIDDEN", async () => {
  const f = await siteFixture(c); await smallTrack(c, f); await refused(f, f.members.supervisor.member, input(f), "TRACK_FORBIDDEN");
 });
 it("[A12] every refusal reason is durable once, scoped, attributable and contains no free text", async () => {
  const f = await siteFixture(c), foreign = await siteFixture(c), supervisor = f.members.supervisor.member;
  const samples = [{ member: f.members.owner.member, raw: input(f), code: "EXTRA_FORBIDDEN", reason: "role_not_permitted" }, { member: foreign.members.supervisor.member, raw: input(f), code: "EXTRA_FORBIDDEN", reason: "member_inactive" }, { member: supervisor, raw: { ...input(f), jobId: foreign.jobId }, code: "NOT_FOUND", reason: "job_out_of_scope" }, { member: supervisor, raw: { ...input(f), jobId: randomUUID() }, code: "NOT_FOUND", reason: "job_out_of_scope" }];
  for (const sample of samples) {
   for (let i = 0; i < 3; i++) await refused(f, sample.member, sample.raw, sample.code);
   await refused(f, sample.member, { ...sample.raw, commandId: sample.raw.commandId.toUpperCase() }, sample.code);
   const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.refused' AND subject_ref=$2", [f.p.tenantId, sample.raw.commandId])).rows;
   expect(rows).toHaveLength(1); expect(rows[0]!.id).toBe(derivedUuid(`extra-refusal:${f.p.tenantId}:${sample.raw.commandId}:${sample.reason}`));
   expect(rows[0]).toMatchObject({ actor_ref: sample.member === foreign.members.supervisor.member ? "security:unverified-member" : `membership:${sample.member.membershipId}`, subject_type: "extra-command", payload: { references: { command: sample.raw.commandId, command_type: "LogSiteExtra", reason: sample.reason, environment: "synthetic_demo", ...(sample.raw.jobId === f.jobId ? { job: f.jobId } : {}) }, classifications: { action: "security" } } });
   expect(Object.keys(rows[0]!.payload.references).sort()).toEqual(["command", "command_type", "environment", "reason", ...(sample.raw.jobId === f.jobId ? ["job"] : [])].sort());
  }
  await smallTrack(c, f); const raw = input(f); for (let i = 0; i < 3; i++) await refused(f, supervisor, raw, "TRACK_FORBIDDEN");
  expect((await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.refused'", [f.p.tenantId, raw.commandId])).rows).toEqual([{ payload: { references: { command: raw.commandId, command_type: "LogSiteExtra", reason: "track_not_contractor", environment: "synthetic_demo", job: f.jobId }, classifications: { action: "security" } } }]);
  const all = JSON.stringify((await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows); expect(all).not.toContain(note); expect(all).not.toContain(description);
 });
 it("[A12] concurrent refusal writers coalesce; audit append failure retains identical typed refusal", async () => {
  const f = await siteFixture(c), raw = input(f), member = f.members.owner.member;
  const errors = await Promise.all([refused(f, member, raw, "EXTRA_FORBIDDEN"), refused(f, member, raw, "EXTRA_FORBIDDEN")]); expect(errors[0]).toEqual(errors[1]);
  expect((await c.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.refused'", [f.p.tenantId, raw.commandId])).rowCount).toBe(1);
  const connect = c.runtime.connect.bind(c.runtime), wrapped = new WeakSet<object>();
  let reached = 0;
  vi.spyOn(c.runtime, "connect").mockImplementation((async () => { const client = await connect(); if (wrapped.has(client)) return client; wrapped.add(client); const original = client.query.bind(client); vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => { if (String(sql).includes("FROM app.append_audit(")) { reached++; throw new Error(note); } return original(sql, params); }) as any); return client; }) as any);
  const failed = input(f), error = await refused(f, member, failed, "EXTRA_FORBIDDEN"); expect(error).toEqual(errors[0]); expect(JSON.stringify(error)).not.toContain(note);
  expect(reached, "the refusal audit append must be reached").toBe(1);
  expect((await c.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.refused'", [f.p.tenantId, failed.commandId])).rowCount).toBe(0);
 });
});

// Real PostgreSQL acceptance; NOT RUN in this socket-restricted sandbox.
async function leaveLive(f: SiteFixture) {
 await withTenant(c.admin, f.ctx, db => db.$client.query("SELECT app.transition_job($1,$2,(SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2),'invoiced','issue_invoice',NULL,NULL,NULL,NULL)", [f.p.tenantId, f.jobId]));
}
for (const when of ["before precheck", "between precheck and raiseExtra"] as const) it(when === "before precheck" ? "[R2] a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written" : `[R2] not-live ${when} refuses and leaves no extra, audit or command row`, async () => {
 const f = await siteFixture(c), raw = input(f);
 // Owner-only fixture setup, like the legacy status fixtures in watchdog.integration.test.ts.
 if (when === "before precheck") await ownerTx(c, f.p.tenantId, db => db.$client.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.jobId]));
 else {
  const raise = ExtraRepository.prototype.raiseExtra;
  vi.spyOn(ExtraRepository.prototype, "raiseExtra").mockImplementationOnce(async function(this: ExtraRepository, context, input, seam) { await leaveLive(f); return raise.call(this, context, input, seam); });
 }
 const before = await counts(c, f), head = await chain(c, f);
 const auditCount = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n;
 const error = await repo.logSiteExtra(f.ctx, f.members.supervisor.member, raw).catch(error => error);
 expect(error).toBeInstanceOf(WatchdogError); expect(error).toMatchObject({ code: "JOB_NOT_LIVE" });
 expect(await counts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n).toBe(auditCount);
 expect((await c.admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rowCount).toBe(0);
});
it("[R3] the same command id with a changed payload conflicts", async () => {
 const f = await siteFixture(c), raw = input(f), actor = f.members.supervisor.member, initial = await counts(c, f);
 const first = await repo.logSiteExtra(f.ctx, actor, raw), before = await counts(c, f), head = await chain(c, f);
 expect(await repo.logSiteExtra(f.ctx, actor, raw)).toEqual(first);
 await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, note: "Fictional changed request" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 expect(await counts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
 expect((await c.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([{ result: first }]);
 for (const table of ["variation", "extra_origin", "extra_event", "command_receipt"]) expect(before[table]! - initial[table]!).toBe(1);
});

it("a successful no-op keeps its identity", async () => {
 // LogSiteExtra has no distinct no-op: this property applies to an identical successful retry,
 // which keeps the first extra id and creates no new business, command or audit rows.
 const f = await siteFixture(c), raw = input(f), actor = f.members.supervisor.member;
 const first = await repo.logSiteExtra(f.ctx, actor, raw), before = await counts(c, f), head = await chain(c, f);
 const replay = await repo.logSiteExtra(f.ctx, actor, raw);
 expect(replay).toEqual(first); expect(replay.variationId).toBe(first.variationId); expect(await counts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
 expect((await c.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([{ result: first }]);
});

it("replaying a command id returns the first result, never the job's current state", async () => {
 const f = await siteFixture(c), raw = input(f), actor = f.members.supervisor.member;
 const first = await repo.logSiteExtra(f.ctx, actor, raw);
 // Move the live job's work-order baseline on through the real import command.
 await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-later.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 1, { expectedRevision: 1, priority: "emergency" })]) });
 const current = (await c.admin.query("SELECT r.id,r.revision,j.status FROM app.work_order_current k JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(k.tenant_id,k.work_order_id,k.revision_id) JOIN app.work_order w ON(w.tenant_id,w.id)=(k.tenant_id,k.work_order_id) JOIN app.job j ON(j.tenant_id,j.id)=(w.tenant_id,w.job_id) WHERE k.tenant_id=$1 AND k.work_order_id=$2", [f.p.tenantId, f.orderId])).rows[0]!;
 expect(current).toMatchObject({ revision: 2, status: "live" }); expect(current.id).not.toBe(f.revisionId);
 const later = await repo.logSiteExtra(f.ctx, actor, input(f)); expect(later.variationId).not.toBe(first.variationId);
 expect((await c.admin.query("SELECT variation_id,work_order_revision_id FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=ANY($2::uuid[])", [f.p.tenantId, [first.variationId, later.variationId]])).rows).toEqual(expect.arrayContaining([{ variation_id: first.variationId, work_order_revision_id: f.revisionId }, { variation_id: later.variationId, work_order_revision_id: current.id }]));
 const before = await counts(c, f), head = await chain(c, f);
 expect(await repo.logSiteExtra(f.ctx, actor, raw)).toEqual(first);
 expect(await counts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
 expect((await c.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([{ result: first }]);
});

it("the same command id on another job conflicts", async () => {
 const f = await siteFixture(c), actor = (await invite(c, f, "supervisor", { kind: "tenant", id: f.p.tenantId })).member, raw = input(f);
 // Both jobs are in scope: this must reach the command conflict rather than an authority refusal.
 for (const jobId of [f.jobId, f.otherJob]) expect((await decision(c, f, actor, "LogSiteExtra", jobId))[0]!.decision).toBe("allowed");
 const initial = await counts(c, f), first = await repo.logSiteExtra(f.ctx, actor, raw), before = await counts(c, f), head = await chain(c, f);
 await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, jobId: f.otherJob })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 expect(await counts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
 expect((await c.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([{ result: first }]);
 for (const table of ["variation", "extra_origin", "extra_event", "command_receipt"]) expect(before[table]! - initial[table]!).toBe(1);
 expect(await repo.logSiteExtra(f.ctx, actor, raw)).toEqual(first); expect(await counts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
});
