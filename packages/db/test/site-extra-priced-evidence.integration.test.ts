import { testActorContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { siteExtraContentSha256V1 } from "@jobguard/core";
import { northsideExtras } from "../src/northside-demo.js";
import { SiteExtraRepository } from "../src/site-extra-repository.js";
import { cluster, siteFixture, photo, pendingPhoto } from "./site-extra-evidence-fixtures.js";
import { written, type Cluster } from "./site-extra-pricing-fixtures.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 90_000);
afterAll(async () => { await c?.close(); });
it("priced v2 preserves evidence, origin, replay and cross-customer boundaries", async () => {
  const f = await siteFixture(c), other = await siteFixture(c), actor = f.members.operative.member;
  const repo = new SiteExtraRepository(c.runtime), where = { ctx: f.ctx, jobId: f.jobId };
  const image = await photo(c, where), pending = await pendingPhoto(c, where), foreign = await photo(c, { ctx: other.ctx, jobId: other.jobId });
  const description = "Fictional extra", note = "Reviewed fictional note";
  const raw = { version: "log-sor-site-extra.v2", workStatus: "finished", commandId: randomUUID(), jobId: f.jobId, sorCode: "CLEAR-GUTTER", quantity: "100", description, note, photoEvidenceId: image.id, residentConfirmation: { shownContentSha256: siteExtraContentSha256V1({ jobId: f.jobId, description, note, photoSha256: image.sha256 }) } };
  const before = await written(c, f.p.tenantId);
  for (const photoEvidenceId of [pending.id, foreign.id, randomUUID()]) {
    await expect(repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, { ...raw, commandId: randomUUID(), photoEvidenceId })).rejects.toMatchObject({ code: "PHOTO_NOT_ACCEPTED" });
    expect(await written(c, f.p.tenantId)).toEqual(before);
  }
  await expect(repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, { ...raw, residentConfirmation: { shownContentSha256: "a".repeat(64) } })).rejects.toMatchObject({ code: "CONFIRMATION_MISMATCH" });
  await expect(repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, other.members.operative.member), other.members.operative.member, raw)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
  await expect(repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, f.unassigned.member), f.unassigned.member, raw)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, { ...raw, jobId: other.jobId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const [first, retry] = await Promise.all([repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, raw), repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, raw)]);
  expect(retry).toEqual(first);
  const after = await written(c, f.p.tenantId);
  expect(after.extra_origin).toBe(before.extra_origin! + 1);
  expect(after.extra_sor_revision).toBe(before.extra_sor_revision! + 1);
  expect(await repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, raw)).toEqual(first);
  expect(await written(c, f.p.tenantId)).toEqual(after);
  await expect(repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, f.members.supervisor.member), f.members.supervisor.member, raw)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  for (const change of [{ quantity: "101" }, { note: "Changed" }, { description: "Changed" }, { photoEvidenceId: pending.id }, { siteVisitId: randomUUID() }]) {
    await expect(repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, { ...raw, ...change })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  }
  const origin = (await c.admin.query("SELECT evidence_id,resident_confirmation_evidence_id,raising_membership_id FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, first.variationId])).rows[0]!;
  expect(origin).toMatchObject({ evidence_id: image.id, resident_confirmation_evidence_id: expect.any(String), raising_membership_id: actor.membershipId });
  const second = await repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, { ...raw, commandId: randomUUID() });
  expect(second.variationId).not.toBe(first.variationId);
  expect((await written(c, f.p.tenantId)).extra_duplicate_link).toBe(before.extra_duplicate_link);
});

it("a committed priced log survives submission failure; concurrent submit replay makes one request", async () => {
 const { ExtraApprovalRepository } = await import("../src/extra-approval-chain-repository.js");
 const f = await siteFixture(c), actor = f.members.operative.member;
 const image = await photo(c, { ctx: f.ctx, jobId: f.jobId });
 const description = "Fictional priced submission", note = "Fictional note";
 const raw = { version: "log-sor-site-extra.v2", workStatus: "finished", commandId: randomUUID(), jobId: f.jobId, sorCode: "CLEAR-GUTTER", quantity: "100", description, note, photoEvidenceId: image.id, residentConfirmation: { shownContentSha256: siteExtraContentSha256V1({ jobId: f.jobId, description, note, photoSha256: image.sha256 }) } };
 const logs = new SiteExtraRepository(c.runtime), chain = new ExtraApprovalRepository(c.runtime);
 const logged = await logs.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, raw);
 const submit = { version: "submit-extra.v1", commandId: randomUUID(), jobId: f.jobId, extraId: logged.variationId };
 // A real checked refusal after the successful log cannot roll that earlier transaction back.
 await expect(chain.submitExtra(await testActorContext(c.admin, f.ctx, f.unassigned.member), f.unassigned.member, submit)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
 expect(await logs.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, raw)).toEqual(logged);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_approval_request WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, logged.variationId])).rows[0].n).toBe(0);
 const [first, second] = await Promise.all([chain.submitExtra(await testActorContext(c.admin, f.ctx, actor), actor, submit), chain.submitExtra(await testActorContext(c.admin, f.ctx, actor), actor, submit)]);
 expect(second).toEqual(first);
 const source = (await c.admin.query("SELECT net_pence FROM app.extra_sor_revision WHERE tenant_id=$1 AND job_id=$2 AND variation_id=$3", [f.p.tenantId, f.jobId, logged.variationId])).rows[0]!;
 const extras = await northsideExtras(c.runtime, actor, "operative", await f.ctx);
 expect(extras.find(extra => extra.extraId === logged.variationId)).toMatchObject({ quotedPence: Number(source.net_pence), state: "awaiting_approval" });
 expect(await northsideExtras(c.runtime, f.unassigned.member, "operative", await f.ctx)).toEqual([]);

 expect(await chain.submitExtra(await testActorContext(c.admin, f.ctx, actor), actor, submit)).toEqual(first);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_approval_request WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, logged.variationId])).rows[0].n).toBe(1);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2 AND command_type='SubmitExtra' AND status='succeeded'", [f.p.tenantId, submit.commandId])).rows[0].n).toBe(1);
 await expect(chain.submitExtra(await testActorContext(c.admin, f.ctx, actor), actor, { ...submit, commandId: randomUUID() })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
 await expect(chain.submitExtra(await testActorContext(c.admin, f.ctx, actor), actor, { ...submit, extraId: randomUUID() })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
});

it("work statements do not alter price, requirement, origin or timing; finished above the limit survives later approval", async () => {
 const { chainWorld, newJob, approveInput } = await import("./extra-approval-chain-fixtures.js");
 const { ExtraApprovalRepository } = await import("../src/extra-approval-chain-repository.js");
 const { withTenant } = await import("../src/tenant-context.js");
 const w = await chainWorld(c), jobId = await newJob(c, w), actor = w.members.operative.member;
 const repo = new SiteExtraRepository(c.runtime), approvals = new ExtraApprovalRepository(c.runtime);
 const image = await photo(c, { ctx: w.ctx, jobId });
 const description = "Fictional extra work", note = "Fictional reviewed note";
 const body = { version: "log-sor-site-extra.v2", commandId: randomUUID(), jobId, sorCode: "CLEAR-GUTTER", quantity: "100", description, note, photoEvidenceId: image.id, residentConfirmation: { shownContentSha256: siteExtraContentSha256V1({ jobId, description, note, photoSha256: image.sha256 }) }, workStatus: "finished" };
 const rows: Array<Record<string, unknown>> = [];
 const requirements: unknown[] = [];
 let finished: Awaited<ReturnType<typeof repo.logSorSiteExtra>> | undefined;
 for (const workStatus of ["finished", "not_started", "under_way"]) {
  const input = { ...body, commandId: randomUUID(), workStatus };
  const logged = await repo.logSorSiteExtra(await testActorContext(c.admin, w.ctx, actor), actor, input);
  expect(await repo.logSorSiteExtra(await testActorContext(c.admin, w.ctx, actor), actor, input)).toEqual(logged);
  await expect(repo.logSorSiteExtra(await testActorContext(c.admin, w.ctx, actor), actor, { ...input, workStatus: workStatus === "finished" ? "not_started" : "finished" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const stored = (await c.admin.query(`SELECT s.work_status,s.operative_membership_id,s.recorded_at,o.raising_membership_id,o.kind,o.site_visit_id,(s.recorded_at>=o.server_recorded_at AND s.recorded_at<=clock_timestamp()) server_time,
   r.net_pence,r.quantity,r.rate_pence,r.adjustment_numerator,r.adjustment_denominator,r.coverage
   FROM app.site_extra_work_status s JOIN app.extra_origin o ON(o.tenant_id,o.variation_id)=(s.tenant_id,s.variation_id)
   JOIN app.extra_sor_revision r ON(r.tenant_id,r.variation_id)=(s.tenant_id,s.variation_id) WHERE s.tenant_id=$1 AND s.variation_id=$2`, [w.p.tenantId, logged.variationId])).rows[0]!;
  expect(stored).toMatchObject({ work_status: workStatus, operative_membership_id: actor.membershipId, raising_membership_id: actor.membershipId, kind: "site_user", site_visit_id: null, server_time: true });
  expect(stored.recorded_at).toBeInstanceOf(Date);
  const { work_status: _status, recorded_at: _time, ...unchanged } = stored; rows.push(unchanged);
  const request = await approvals.submitExtra(await testActorContext(c.admin, w.ctx, actor), actor, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId: logged.variationId });
  const snapshot = (await c.admin.query("SELECT requirement,comparisons FROM app.extra_approval_request WHERE tenant_id=$1 AND id=$2", [w.p.tenantId, request.requestId])).rows[0]!;
  requirements.push(snapshot);
  expect(snapshot.comparisons.withinProceedLimit).toBe(false);
  if (workStatus === "finished") {
   finished = logged;
   await approvals.approveExtraStep(await testActorContext(c.admin, w.ctx, w.members.supervisor.member), w.members.supervisor.member, approveInput({ jobId, requestId: request.requestId as string, hash: request.revisionHash as string, net: Number(stored.net_pence) }, 0));
   expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE tenant_id=$1 AND request_id=$2", [w.p.tenantId, request.requestId])).rows[0].kind).toBe("approved");
   expect((await c.admin.query("SELECT work_status FROM app.site_extra_work_status WHERE tenant_id=$1 AND variation_id=$2", [w.p.tenantId, logged.variationId])).rows[0].work_status).toBe("finished");
   expect((await c.admin.query("SELECT comparisons FROM app.extra_approval_request WHERE tenant_id=$1 AND id=$2", [w.p.tenantId, request.requestId])).rows[0].comparisons).toEqual(snapshot.comparisons);
  }
 }
 expect(rows[1]).toEqual(rows[0]); expect(rows[2]).toEqual(rows[0]);
 expect(requirements[1]).toEqual(requirements[0]); expect(requirements[2]).toEqual(requirements[0]);
 // LP-6d: each supervisor reads in its own bound request.
 const read = await repo.supervisorQueries(await testActorContext(c.admin, w.ctx, w.members.supervisor.member), w.members.supervisor.member, jobId);
 expect(read.workStatuses).toEqual(expect.arrayContaining([expect.objectContaining({ extraId: finished!.variationId, workStatus: "finished", source: "operative_statement", operativeMembershipId: actor.membershipId })]));
 await expect(repo.supervisorQueries(await testActorContext(c.admin, w.ctx, w.otherSupervisor.member), w.otherSupervisor.member, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
 const owner = await c.admin.connect();
 try {
  await owner.query("BEGIN"); await owner.query("SET LOCAL ROLE jobguard_migration");
  await owner.query("SELECT set_config('app.tenant_id',$1,true)", [w.p.tenantId]);
  await expect(owner.query("UPDATE app.site_extra_work_status SET work_status='not_started' WHERE tenant_id=$1 AND variation_id=$2", [w.p.tenantId, finished!.variationId])).rejects.toMatchObject({ code: "55000" });
 } finally { await owner.query("ROLLBACK"); owner.release(); }
 await expect(withTenant(c.runtime, await testActorContext(c.admin, w.ctx, actor), db => db.$client.query("SELECT app.ent3_work_status($1,$2,$3,$4)", [jobId, actor.membershipId, finished!.variationId, "not_started"])) ).rejects.toMatchObject({ message: "INVALID_COMMAND" });
});

it("server proceed comparison uses the bound rules: within, above and unpriced; cancelled logs remain not found", async () => {
 const { withTenant } = await import("../src/tenant-context.js");
 const { cancel } = await import("./site-extra-fixtures.js");
 const f = await siteFixture(c), actor = f.members.operative.member, repo = new SiteExtraRepository(c.runtime);
 // LP-6d: the operative compares in its own bound request.
 const comparison = async (quantity: string | null) => withTenant(c.runtime, await testActorContext(c.admin, f.ctx, actor), async db => (await db.$client.query("SELECT app.ent3_proceed_comparison($1,$2,$3,$4) v", [f.jobId, actor.membershipId, "CLEAR-GUTTER", quantity])).rows[0].v);
 expect(await comparison("1")).toBe("within"); expect(await comparison("1000")).toBe("above"); expect(await comparison(null)).toBe("above");
 const checked = await repo.orderCheck(await testActorContext(c.admin, f.ctx, actor), actor, f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "1000" });
 expect(checked.proceedComparison).toBe("above");
 await cancel(c, f);
 await expect(repo.logSorSiteExtra(await testActorContext(c.admin, f.ctx, actor), actor, { version: "log-sor-site-extra.v2", commandId: randomUUID(), jobId: f.jobId, sorCode: "CLEAR-GUTTER", quantity: "100", workStatus: "finished", description: "Fictional", note: "Fictional", photoEvidenceId: randomUUID(), residentConfirmation: { shownContentSha256: "a".repeat(64) } })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("work statement storage is forced-RLS and runtime EXECUTE only, with tenant-qualified foreign keys", async () => {
 const f = await siteFixture(c);
 const catalog = (await c.admin.query("SELECT pg_get_userbyid(relowner) owner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.site_extra_work_status'::regclass")).rows[0];
 expect(catalog).toEqual({ owner: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true });
 for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
  expect((await c.admin.query("SELECT has_table_privilege('jobguard_runtime','app.site_extra_work_status',$1) ok", [privilege])).rows[0].ok).toBe(false);
 }
 const fks = (await c.admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.site_extra_work_status'::regclass AND contype='f'")).rows;
 expect(fks).toHaveLength(3);
 for (const fk of fks) expect(fk.definition).toMatch(/^FOREIGN KEY \(tenant_id,/);
 const funcs = (await c.admin.query(`SELECT proname,prosecdef,proconfig,pg_get_userbyid(proowner) owner,
  has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,
  has_function_privilege('jobguard_identity',oid,'EXECUTE') identity,
  has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure
  FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN('ent3_work_status','ent3_proceed_comparison') ORDER BY proname`)).rows;
 expect(funcs).toHaveLength(2);
 for (const fn of funcs) expect(fn).toMatchObject({ owner: "jobguard_migration", prosecdef: true, proconfig: ["search_path=pg_catalog, pg_temp"], runtime: true, identity: false, infrastructure: false });
 const { withTenant } = await import("../src/tenant-context.js");
 await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT * FROM app.site_extra_work_status"))).rejects.toMatchObject({ code: "42501" });
});
