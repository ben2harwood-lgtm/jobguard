import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, ExtraRepository, SiteExtraRepository, SiteVisitRepository, siteExtraAuthoritySeam, withTenant } from "../src/index.js";
import { readExtraApprovalTiming } from "../src/extra-approval-timing.js";
import { chainWorld, cluster, approveInput, newToken, emailOf, newJob, type ChainWorld, type Cluster } from "./extra-approval-chain-fixtures.js";
import { direct } from "./site-extra-fixtures.js";

let c: Cluster, w: ChainWorld;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await chainWorld(c); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("ENT-5 shared visit: unfinished is uncertain, client sees completed work before preapproval, later approval preserves breach", async () => {
  const context = await w.ctx, approvals = new ExtraApprovalRepository(c.runtime), visits = new SiteVisitRepository(c.runtime);
  const operative = w.members.operative.member;
  const visit = await visits.startVisit(context, operative, { commandId: randomUUID(), jobId: w.jobId });
  const raise = () => new ExtraRepository(c.runtime).raiseExtra(context, direct(w, w.members.operative, { siteVisitId: visit.visitId }), siteExtraAuthoritySeam);
  const extra = await raise(); await raise(); // Several extras share these bounds; neither has an exact work time.
  await approvals.priceExtra(context, w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId: w.jobId, extraId: extra.variationId, netPence: 150000 });
  const request = await approvals.submitExtra(context, w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId: w.jobId, extraId: extra.variationId });
  const s = { jobId: w.jobId, requestId: request.requestId as string, hash: request.revisionHash as string, net: 150000 };
  await approvals.approveExtraStep(context, w.members.supervisor.member, approveInput(s, 0));
  await approvals.approveExtraStep(context, w.supervisor2.member, approveInput(s, 1));
  const token = newToken(), email = await emailOf(c, w, w.members.client_approver.member.membershipId);
  await approvals.issueClientApproval(context, w.members.owner.member, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: w.jobId, requestId: s.requestId,
    approverMembershipId: w.members.client_approver.member.membershipId, recipient: email, linkToken: token, expiresAt: new Date(Date.now() + 3600_000) });
  const view = () => approvals.clientApprovalView(context, w.members.client_approver.member, { version: "client-approval-view.v1", jobId: w.jobId, requestId: s.requestId, linkToken: token, email });
  expect(await view()).toMatchObject({ doneWithoutRequiredPreapproval: "uncertain", workTiming: { source: "site_visit", visitId: visit.visitId, startedAt: visit.startedAt, finishedAt: null, uncertainty: "during_this_visit" },
    approvalTimings: [{ stepIndex: 0, timing: "uncertain" }, { stepIndex: 1, timing: "uncertain" }] });
  const foreign = await chainWorld(c), foreignVisit = await visits.startVisit(await foreign.ctx, foreign.members.operative.member, { commandId: randomUUID(), jobId: foreign.jobId });
  const anotherJob = await newJob(c, w), siteExtras = new SiteExtraRepository(c.runtime);
  for (const [jobId, siteVisitId] of [[anotherJob, visit.visitId], [w.jobId, foreignVisit.visitId]]) {
    await expect(siteExtras.logSiteExtra(context, operative, { commandId: randomUUID(), jobId, siteVisitId, note: "Fictional timing refusal", description: "Fictional extra" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await visits.completeVisit(context, operative, { commandId: randomUUID(), jobId: w.jobId, visitId: visit.visitId, closeoutAnswer: "yes" });
  expect(await view()).toMatchObject({ doneWithoutRequiredPreapproval: true });
  await expect(approvals.clientApprovalView(await foreign.ctx, foreign.members.client_approver.member, { version: "client-approval-view.v1", jobId: w.jobId, requestId: s.requestId, linkToken: token, email })).rejects.toMatchObject({ code: "LINK_INVALID" });
  const wrongJob = await withTenant(c.runtime, context, db => readExtraApprovalTiming(db, w.p.tenantId, w.otherJob, extra.variationId, s.requestId));
  expect(wrongJob).toMatchObject({ doneWithoutRequiredPreapproval: "not_derived", workTiming: null, approvalTimings: [] });
  const wrongTenant = await withTenant(c.runtime, await foreign.ctx, db => readExtraApprovalTiming(db, w.p.tenantId, w.jobId, extra.variationId, s.requestId));
  expect(wrongTenant).toMatchObject({ doneWithoutRequiredPreapproval: "not_derived", workTiming: null, approvalTimings: [] });
  await approvals.decideClientApproval(context, w.members.client_approver.member, { version: "decide-client-approval.v1", commandId: randomUUID(), jobId: w.jobId, requestId: s.requestId,
    linkToken: token, email, revisionHash: s.hash, netPence: s.net, decision: "approve", fictionalRoleName: "Fictional client", actualTesterReference: "tester:fictional" });
  const after = await withTenant(c.runtime, context, db => readExtraApprovalTiming(db, w.p.tenantId, w.jobId, extra.variationId, s.requestId));
  expect(after.doneWithoutRequiredPreapproval).toBe(true);
  expect(after.approvalTimings.at(-1)).toEqual({ stepIndex: 2, timing: "after_work" });
}, 180_000);
