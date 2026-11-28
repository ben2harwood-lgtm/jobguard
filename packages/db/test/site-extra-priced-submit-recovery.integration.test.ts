import { reviseV2 } from "./extra-price-v2-fixtures.js";
// LATER-SAFETY-184: real PostgreSQL composition; run by CI, never the builder sandbox.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { siteExtraContentSha256V1 } from "@jobguard/core";
import { SiteExtraApplication } from "../../../apps/api/src/contractor/site-extra.application.js";
import { ContractorRepository, ExtraApprovalRepository, SiteExtraRepository, contractorSessionContext, withTenant } from "../src/index.js";
import { cluster, siteFixture, photo } from "./site-extra-evidence-fixtures.js";
import { command, ownerTx, written, type Cluster } from "./site-extra-pricing-fixtures.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";
import { status } from "./contractor-entitlement-fixtures.js";
import { testActorContext } from "./tenant-context-test-utils.js";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 120_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

async function setup() {
 const f = await siteFixture(c), actor = f.members.operative.member, sessionId = randomUUID();
 await c.admin.query(`INSERT INTO control_plane.contractor_practice_session
  (session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
  VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`,
  [sessionId, actor.tenantId, actor.membershipId, actor.identityUserId, digestOf(sessionId)]);
 expect(await new ContractorRepository(c.runtime).resolveSession(sessionId)).toMatchObject(actor);
 const image = await photo(c, { ctx: f.ctx, jobId: f.jobId });
 const description = "Fictional recovery extra", note = "Fictional reviewed note";
 const raw = { version: "log-sor-site-extra.v2", commandId: randomUUID(), sorCode: "CLEAR-GUTTER", quantity: "100", workStatus: "finished", description, note,
  photoEvidenceId: image.id, residentConfirmation: { shownContentSha256: siteExtraContentSha256V1({ jobId: f.jobId, description, note, photoSha256: image.sha256 }) } };
 const app = new SiteExtraApplication(c.runtime), principal = { version: "contractor-principal.v1", sessionId };
 return { f, actor, sessionId, raw, app, principal, run: () => app.logSor(principal, f.jobId, raw) };
}
async function counts(tenant: string): Promise<Record<string, number> & { requests: number }> {
 return { ...await written(c, tenant), requests: (await c.admin.query("SELECT count(*)::int n FROM app.extra_approval_request WHERE tenant_id=$1", [tenant])).rows[0].n };
}

it("refuses a missing approval feature before new capture, while site capture remains available", async () => {
 const h = await setup(), before = await counts(h.actor.tenantId);
 // Current reference agreements enable contractor features together. Model a
 // feature-specific hold in this isolated database's real entitlement guard;
 // retain its original checks for every other feature/actor. No repository is mocked.
 const definition = (await c.admin.query("SELECT pg_get_functiondef('app.mon8_require_feature(uuid,text)'::regprocedure) sql")).rows[0].sql as string;
 const held = definition.replace(/BEGIN/u, `BEGIN IF actor='${h.actor.membershipId}'::uuid AND feature='approval_chains' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;`);
 expect(held).not.toBe(definition);
 try {
  await c.admin.query(held);
  const context = await contractorSessionContext(c.runtime, h.sessionId);
  await withTenant(c.runtime, context, db => db.$client.query("SELECT app.mon8_require_feature($1,'site_origin_capture')", [h.actor.membershipId]));
  await expect(h.run()).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
  expect(await counts(h.actor.tenantId)).toEqual(before);
 } finally { await c.admin.query(definition); }
});

it("rechecks revocation after preflight before capture", async () => {
 const h = await setup(), before = await counts(h.actor.tenantId);
 const log = SiteExtraRepository.prototype.logSorSiteExtra;
 vi.spyOn(SiteExtraRepository.prototype, "logSorSiteExtra").mockImplementationOnce(async function(this: SiteExtraRepository, context, actor, raw) {
  await status(c, { p: h.f.p, context: h.f.ctx }, "suspended");
  return log.call(this, context, actor, raw);
 });
 await expect(h.run()).rejects.toMatchObject({ code: "TRACK_FORBIDDEN" });
 expect(await counts(h.actor.tenantId)).toEqual(before);
});

it("recovers the operative's exact retry after log commit, competing supervisor submit and lost response", async () => {
 const h = await setup(), before = await counts(h.actor.tenantId), approvals = new ExtraApprovalRepository(c.runtime);
 const realSubmit = ExtraApprovalRepository.prototype.submitExtra;
 let supervisorResult: Record<string, unknown> | undefined;
 vi.spyOn(ExtraApprovalRepository.prototype, "submitExtra").mockImplementationOnce(async (_context, _actor, raw) => {
  const i = raw as { jobId: string; extraId: string };
  // logSor has really committed; the supervisor wins the race before the
  // operative's separate submit transaction. Simulate its unavailable response.
  expect((await counts(h.actor.tenantId)).extra_origin).toBe(before.extra_origin! + 1);
  supervisorResult = await realSubmit.call(approvals, await testActorContext(c.admin, h.f.ctx, h.f.members.supervisor.member), h.f.members.supervisor.member,
   { version: "submit-extra.v1", commandId: randomUUID(), jobId: i.jobId, extraId: i.extraId });
  throw new Error("Fictional lost response");
 });
 await expect(h.run()).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
 const saved = await counts(h.actor.tenantId);
 expect(saved.requests).toBe(before.requests + 1);
 const answer = await h.run();
 expect(answer).toMatchObject({ requestId: supervisorResult!.requestId, state: supervisorResult!.state });
 expect(await h.run()).toEqual(answer);
 expect(await counts(h.actor.tenantId)).toEqual(saved);
 for (const change of [{ quantity: "101" }, { note: "Changed fictional note" }, { workStatus: "under_way" }]) {
  await expect(h.app.logSor(h.principal, h.f.jobId, { ...h.raw, ...change })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
 }
 await expect(h.app.logSor(h.principal, h.f.otherJob, h.raw)).rejects.toThrow();
 const other = await setup();
 await expect(other.app.logSor(other.principal, h.f.jobId, h.raw)).rejects.toThrow();
 expect(await counts(h.actor.tenantId)).toEqual(saved);
 // A still-live session cannot recover after its job permission is revoked.
 await command(c, h.f, { kind: "grant.revoke", grantId: h.f.members.operative.grant });
 const afterRevocation = await counts(h.actor.tenantId);
 await expect(h.run()).rejects.toThrow();
 expect(await counts(h.actor.tenantId)).toEqual(afterRevocation);
 // Even the original raiser loses read/recovery when the session expires.
 // Like lp6a-practice-restore, let a short-lived session expire on the PG clock.
 const expiringSessionId = randomUUID();
 await c.admin.query(`INSERT INTO control_plane.contractor_practice_session
  (session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
  VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '150ms')`,
  [expiringSessionId, h.actor.tenantId, h.actor.membershipId, h.actor.identityUserId, digestOf(expiringSessionId)]);
 await c.admin.query("SELECT pg_sleep(0.2)");
 await expect(new ContractorRepository(c.runtime).resolveSession(expiringSessionId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 await expect(h.app.logSor({ ...h.principal, sessionId: expiringSessionId }, h.f.jobId, h.raw)).rejects.toThrow();
 expect(await counts(h.actor.tenantId)).toEqual(afterRevocation);
});

it("transient submission failure keeps the log and deterministic submit identity, then completes once", async () => {
 const h = await setup(), before = await counts(h.actor.tenantId);
 const submit = vi.spyOn(ExtraApprovalRepository.prototype, "submitExtra").mockRejectedValueOnce(new Error("Fictional transient failure"));
 await expect(h.run()).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
 expect((await counts(h.actor.tenantId)).requests).toBe(before.requests);
 const answer = await h.run(), saved = await counts(h.actor.tenantId);
 expect(answer).toMatchObject({ version: "sor-site-extra-submitted.v2", requestId: expect.any(String) });
 expect(await h.run()).toEqual(answer);
 expect(submit.mock.calls[0]![2]).toEqual(submit.mock.calls[1]![2]);
 expect(submit.mock.calls[1]![2]).toEqual(submit.mock.calls[2]![2]);
 expect(saved.extra_origin).toBe(before.extra_origin! + 1); expect(saved.requests).toBe(before.requests + 1);
 expect(await counts(h.actor.tenantId)).toEqual(saved);
});

it("the recovery SELECT itself excludes a raiser revoked after priced submission", async () => {
 const h = await setup(), answer = await h.run();
 const extraId = (await c.admin.query("SELECT variation_id FROM app.extra_sor_revision WHERE tenant_id=$1 AND command_id=$2",
  [h.actor.tenantId, h.raw.commandId])).rows[0].variation_id as string;
 // Execute the repository's actual SELECT, not a copy of its predicates. The
 // owner fixture deliberately bypasses session/replay/feature and runtime RLS
 // gates, so those earlier checks cannot hide a missing active-member filter.
 const source = readFileSync(new URL("../src/extra-approval-chain-repository.ts", import.meta.url), "utf8");
 const sql = source.match(/`(\s*SELECT q\.id "requestId",e\.kind state[^`]*)`/u)?.[1];
 expect(sql).toBeDefined();
 const recover = () => ownerTx(c, h.actor.tenantId, async db => (await db.$client.query(sql!,
  [h.actor.tenantId, h.f.jobId, extraId, h.raw.commandId, h.actor.membershipId])).rows);
 const expected = [{ requestId: answer.requestId, state: answer.state }];
 expect(await recover()).toEqual(expected);
 await command(c, h.f, { kind: "membership.revoke", membershipId: h.actor.membershipId });
 const before = await counts(h.actor.tenantId);
 // Revocation leaves the operative's job assignment in place. The assignment
 // branch must still pass, leaving membership activity as the refusal reason.
 expect(await ownerTx(c, h.actor.tenantId, async db => (await db.$client.query(
  "SELECT app.contractor_member_active($1) active, app.contractor_job_assigned($1,$2) assigned",
  [h.actor.membershipId, h.f.jobId])).rows[0])).toEqual({ active: false, assigned: true });
 expect(await recover()).toEqual([]);
 expect(await counts(h.actor.tenantId)).toEqual(before);
});

it("scoped recovery refuses wrong bindings and withdrawn state", async () => {
 const h = await setup(), repo = new ExtraApprovalRepository(c.runtime);
 vi.spyOn(ExtraApprovalRepository.prototype, "submitExtra").mockRejectedValueOnce(new Error("Fictional lost submit"));
 await expect(h.run()).rejects.toThrow();
 const logged = (await c.admin.query("SELECT variation_id FROM app.extra_sor_revision WHERE tenant_id=$1 AND command_id=$2", [h.actor.tenantId, h.raw.commandId])).rows[0];
 const supervisorActor = h.f.members.supervisor.member;
 const submission = await repo.submitExtra(await testActorContext(c.admin, h.f.ctx, supervisorActor), supervisorActor,
  { version: "submit-extra.v1", commandId: randomUUID(), jobId: h.f.jobId, extraId: logged.variation_id });
 const answer = { extraId: logged.variation_id as string, requestId: submission.requestId, state: submission.state };
 const context = await contractorSessionContext(c.runtime, h.sessionId);
 const input = { ...h.raw, jobId: h.f.jobId };
 expect(await repo.recoverPricedSubmission(context, h.actor, input)).toEqual({ requestId: answer.requestId, state: answer.state });
 for (const change of [{ jobId: h.f.otherJob }, { quantity: "101" }]) {
  await expect(repo.recoverPricedSubmission(context, h.actor, { ...input, ...change })).rejects.toThrow();
 }
 await expect(repo.recoverPricedSubmission(context, h.f.unassigned.member, input)).rejects.toThrow();
 const supervisor = h.f.members.supervisor.member;
 await repo.withdrawExtra(await testActorContext(c.admin, h.f.ctx, supervisor), supervisor,
  { version: "withdraw-extra.v1", commandId: randomUUID(), jobId: h.f.jobId, extraId: answer.extraId, reasonCode: "not_done" });
 const saved = await counts(h.actor.tenantId);
 await expect(h.run()).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
 expect(await counts(h.actor.tenantId)).toEqual(saved);
});


it("recovery refuses missing requests, superseded prices and rejected requests without writing", async () => {
 for (const target of ["missing", "superseded", "rejected"] as const) {
  const h = await setup(), repo = new ExtraApprovalRepository(c.runtime);
  vi.spyOn(ExtraApprovalRepository.prototype, "submitExtra").mockRejectedValueOnce(new Error("Fictional transient submit"));
  await expect(h.run()).rejects.toThrow();
  const extraId = (await c.admin.query("SELECT variation_id FROM app.extra_sor_revision WHERE tenant_id=$1 AND command_id=$2", [h.actor.tenantId, h.raw.commandId])).rows[0].variation_id as string;
  if (target !== "missing") {
   const supervisor = h.f.members.supervisor.member;
   const request = await repo.submitExtra(await testActorContext(c.admin, h.f.ctx, supervisor), supervisor,
    { version: "submit-extra.v1", commandId: randomUUID(), jobId: h.f.jobId, extraId });
   if (target === "superseded") {
    const manager = h.f.members.commercial_manager.member;
    await repo.approveExtraStep(await testActorContext(c.admin, h.f.ctx, manager), manager,
     { version: "approve-extra-step.v1", commandId: randomUUID(), jobId: h.f.jobId, requestId: request.requestId,
      stepIndex: 0, revisionHash: request.revisionHash, netPence: request.netPence });
    const context = await contractorSessionContext(c.runtime, h.sessionId);
    expect(await repo.recoverPricedSubmission(context, h.actor, { ...h.raw, jobId: h.f.jobId })).toEqual({ requestId: request.requestId, state: "approved" });
    const surveyor = h.f.members.surveyor.member;
    await repo.reviseExtra(await testActorContext(c.admin, h.f.ctx, surveyor), surveyor,
     await reviseV2(c, { commandId: randomUUID(), jobId: h.f.jobId, extraId, netPence: 40000 }));
   } else {
    const manager = h.f.members.commercial_manager.member;
    await repo.rejectExtra(await testActorContext(c.admin, h.f.ctx, manager), manager,
     { version: "reject-extra.v1", commandId: randomUUID(), jobId: h.f.jobId, requestId: request.requestId,
      stepIndex: 0, revisionHash: request.revisionHash, netPence: request.netPence, reasonCode: "fictional_review" });
   }
  }
  const before = await counts(h.actor.tenantId), context = await contractorSessionContext(c.runtime, h.sessionId);
  await expect(repo.recoverPricedSubmission(context, h.actor, { ...h.raw, jobId: h.f.jobId })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  if (target !== "missing") await expect(h.run()).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
  expect(await counts(h.actor.tenantId)).toEqual(before);
  vi.restoreAllMocks();
 }
});
