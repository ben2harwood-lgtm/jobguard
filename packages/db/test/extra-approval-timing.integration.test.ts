import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, ExtraRepository, SiteExtraRepository, SiteVisitRepository, siteExtraAuthoritySeam, withTenant } from "../src/index.js";
import { readExtraApprovalTiming } from "../src/extra-approval-timing.js";
import { chainWorld, cluster, approveInput, newToken, emailOf, newJob, type ChainWorld, type Cluster } from "./extra-approval-chain-fixtures.js";
import { direct } from "./site-extra-fixtures.js";

let c: Cluster, w: ChainWorld;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await chainWorld(c); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it.each(["not_started", undefined, "under_way", "finished"] as const)("ENT-5 shared visit with statement %s: real client timing and later approval", async workStatus => {
  const context = await w.ctx, approvals = new ExtraApprovalRepository(c.runtime), visits = new SiteVisitRepository(c.runtime);
  const jobId = await newJob(c, w);
  const expected = workStatus === "under_way" || workStatus === "finished" ? true : "uncertain";
  const operative = w.members.operative.member;
  const visit = await visits.startVisit(context, operative, { commandId: randomUUID(), jobId });
  const raise = () => workStatus
    ? new SiteExtraRepository(c.runtime).logSiteExtra(context, operative, { version: "log-site-extra.v4", commandId: randomUUID(), jobId, siteVisitId: visit.visitId,
        note: "Fictional timing evidence", description: "Fictional extra", workStatus })
    : new ExtraRepository(c.runtime).raiseExtra(context, direct(w, w.members.operative, { jobId, siteVisitId: visit.visitId }), siteExtraAuthoritySeam);
  const extra = await raise(); await raise(); // Several extras share these bounds; neither has an exact work time.
  await approvals.priceExtra(context, w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId: extra.variationId, netPence: 150000 });
  const request = await approvals.submitExtra(context, w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId: extra.variationId });
  const s = { jobId, requestId: request.requestId as string, hash: request.revisionHash as string, net: 150000 };
  await approvals.approveExtraStep(context, w.members.supervisor.member, approveInput(s, 0));
  await approvals.approveExtraStep(context, w.supervisor2.member, approveInput(s, 1));
  const token = newToken(), email = await emailOf(c, w, w.members.client_approver.member.membershipId);
  await approvals.issueClientApproval(context, w.members.owner.member, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId, requestId: s.requestId,
    approverMembershipId: w.members.client_approver.member.membershipId, recipient: email, linkToken: token, expiresAt: new Date(Date.now() + 3600_000) });
  const view = () => approvals.clientApprovalView(context, w.members.client_approver.member, { version: "client-approval-view.v1", jobId, requestId: s.requestId, linkToken: token, email });
  expect(await view()).toMatchObject({ doneWithoutRequiredPreapproval: "uncertain", workTiming: { source: "site_visit", visitId: visit.visitId, startedAt: visit.startedAt, finishedAt: null, uncertainty: "during_this_visit" },
    approvalTimings: [{ stepIndex: 0, timing: "uncertain" }, { stepIndex: 1, timing: "uncertain" }] });
  const foreign = await chainWorld(c), foreignVisit = await visits.startVisit(await foreign.ctx, foreign.members.operative.member, { commandId: randomUUID(), jobId: foreign.jobId });
  const anotherJob = await newJob(c, w), siteExtras = new SiteExtraRepository(c.runtime);
  for (const [attackJob, siteVisitId] of [[anotherJob, visit.visitId], [jobId, foreignVisit.visitId]]) {
    await expect(siteExtras.logSiteExtra(context, operative, { commandId: randomUUID(), jobId: attackJob, siteVisitId, note: "Fictional timing refusal", description: "Fictional extra" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await visits.completeVisit(context, operative, { commandId: randomUUID(), jobId, visitId: visit.visitId, closeoutAnswer: "yes" });
  expect(await view()).toMatchObject({ doneWithoutRequiredPreapproval: expected });
  await expect(approvals.clientApprovalView(await foreign.ctx, foreign.members.client_approver.member, { version: "client-approval-view.v1", jobId, requestId: s.requestId, linkToken: token, email })).rejects.toMatchObject({ code: "LINK_INVALID" });
  await expect(c.runtime.query("SELECT * FROM app.site_extra_work_status")).rejects.toMatchObject({ code: "42501" });
  const statement = await withTenant(c.runtime, context, db => db.$client.query("SELECT app.ent3_extra_work_status($1,$2) status", [jobId, extra.variationId]));
  expect(statement.rows).toEqual([{ status: workStatus ?? null }]);
  const hiddenStatement = await withTenant(c.runtime, await foreign.ctx, db => db.$client.query("SELECT app.ent3_extra_work_status($1,$2) status", [jobId, extra.variationId]));
  expect(hiddenStatement.rows).toEqual([{ status: null }]);
  const wrongJob = await withTenant(c.runtime, context, db => readExtraApprovalTiming(db, w.p.tenantId, w.otherJob, extra.variationId, s.requestId));
  expect(wrongJob).toMatchObject({ doneWithoutRequiredPreapproval: "not_derived", workTiming: null, approvalTimings: [] });
  const wrongTenant = await withTenant(c.runtime, await foreign.ctx, db => readExtraApprovalTiming(db, w.p.tenantId, jobId, extra.variationId, s.requestId));
  expect(wrongTenant).toMatchObject({ doneWithoutRequiredPreapproval: "not_derived", workTiming: null, approvalTimings: [] });
  await approvals.decideClientApproval(context, w.members.client_approver.member, { version: "decide-client-approval.v1", commandId: randomUUID(), jobId, requestId: s.requestId,
    linkToken: token, email, revisionHash: s.hash, netPence: s.net, decision: "approve", fictionalRoleName: "Fictional client", actualTesterReference: "tester:fictional" });
  const after = await withTenant(c.runtime, context, db => readExtraApprovalTiming(db, w.p.tenantId, jobId, extra.variationId, s.requestId));
  expect(after.doneWithoutRequiredPreapproval).toBe(expected);
  expect(after.approvalTimings.at(-1)).toEqual({ stepIndex: 2, timing: "after_work" });
}, 180_000);
