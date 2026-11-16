import { testActorContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { buildExtraSourcePack, inspectExtraSourcePack, verifyExtraSourcePack } from "@jobguard/core";
import { ExtraApprovalRepository, SiteExtraRepository, SiteVisitRepository, withTenant } from "../src/index.js";
import { loadExtraEvidenceSources } from "../src/extra-evidence-pack-sources.js";
import { readExtraApprovalTiming } from "../src/extra-approval-timing.js";
import { chainWorld, cluster, newJob, approveInput, newToken, emailOf, type ChainWorld, type Cluster } from "./extra-approval-chain-fixtures.js";

let c: Cluster, w: ChainWorld;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await chainWorld(c); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it.each(["finished_breach", "uncertain_overlap", "no_visit"] as const)("pack seals existing timing projection: %s", async scenario => {
  const ctx = await w.ctx, jobId = await newJob(c, w);
  const approvals = new ExtraApprovalRepository(c.runtime), visits = new SiteVisitRepository(c.runtime);
  const operative = w.members.operative.member;
  const visit = scenario === "no_visit" ? undefined : await visits.startVisit(await testActorContext(c.admin, ctx, operative), operative, { commandId: randomUUID(), jobId });
  const extra = await new SiteExtraRepository(c.runtime).logSiteExtra(await testActorContext(c.admin, ctx, operative), operative, {
    version: "log-site-extra.v4", commandId: randomUUID(), jobId, ...(visit ? { siteVisitId: visit.visitId } : {}),
    note: "Fictional contractor pack timing", description: "Fictional extra", workStatus: "finished",
  });
  const extraId = extra.variationId;
  await approvals.priceExtra(await testActorContext(c.admin, ctx, w.members.surveyor.member), w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: 150000 });
  const request = await approvals.submitExtra(await testActorContext(c.admin, ctx, w.members.supervisor.member), w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
  const s = { jobId, requestId: request.requestId as string, hash: request.revisionHash as string, net: 150000 };
  await approvals.approveExtraStep(await testActorContext(c.admin, ctx, w.members.supervisor.member), w.members.supervisor.member, approveInput(s, 0));
  await approvals.approveExtraStep(await testActorContext(c.admin, ctx, w.supervisor2.member), w.supervisor2.member, approveInput(s, 1));
  // Client approval occurs inside an open visit: the interval cannot establish order.
  if (scenario === "uncertain_overlap") {
    const token = newToken(), email = await emailOf(c, w, w.members.client_approver.member.membershipId);
    await approvals.issueClientApproval(await testActorContext(c.admin, ctx, w.members.surveyor.member), w.members.surveyor.member, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId,
      requestId: s.requestId, approverMembershipId: w.members.client_approver.member.membershipId, recipient: email,
      linkToken: token, expiresAt: new Date(Date.now() + 3600_000) });
    await approvals.decideClientApproval(await testActorContext(c.admin, ctx, w.members.client_approver.member), w.members.client_approver.member, { version: "decide-client-approval.v1", commandId: randomUUID(), jobId,
      requestId: s.requestId, linkToken: token, email, revisionHash: s.hash, netPence: s.net, decision: "approve",
      fictionalRoleName: "Fictional client", actualTesterReference: "synthetic:pack-timing" });
  }
  if (visit) await visits.completeVisit(await testActorContext(c.admin, ctx, operative), operative, { commandId: randomUUID(), jobId, visitId: visit.visitId, closeoutAnswer: "yes" });
  const { loaded, projection } = await withTenant(c.runtime, ctx, async db => ({
    loaded: await loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId, extraId }),
    projection: await readExtraApprovalTiming(db, w.p.tenantId, jobId, extraId, s.requestId),
  }));
  expect(projection.doneWithoutRequiredPreapproval).toBe(scenario === "finished_breach" ? true : scenario === "no_visit" ? "not_derived" : "uncertain");
  if (scenario === "no_visit") expect(projection.workTiming).toBeNull();
  else expect(projection.workTiming).toMatchObject({ visitId: visit!.visitId, startedAt: visit!.startedAt, uncertainty: "during_this_visit" });
  if (scenario === "uncertain_overlap") expect(projection.approvalTimings.at(-1)).toEqual({ stepIndex: 2, timing: "uncertain" });
  const pack = buildExtraSourcePack(jobId, extraId, loaded.sources, loaded.omissions);
  const timing = pack.integrity.sources.find(source => source.sourceId === `extra_approval_timing:${extraId}`)!;
  expect(timing.version).toBe(2);
  expect(JSON.parse(timing.content)).toEqual({ version: "extra-pack-timing.v1", ...projection });
  expect(pack.integrity.manifest.omissions).toEqual(expect.arrayContaining(["Client access HELD", "Export and send HELD"]));
  expect(pack.integrity.manifest.omissions).not.toContain("Extra work timing HELD");
  expect(verifyExtraSourcePack(JSON.stringify(pack)).findings).not.toContain("Content hash mismatch");
  expect(pack.completeApprovalPack).toBe(false);
  expect(inspectExtraSourcePack(pack, loaded.sources.map(source => source.sourceId === timing.sourceId ? { ...source, content: "edited timing" } : source)).findings).toContain("Content hash mismatch");
  const foreign = await chainWorld(c);
  await expect(withTenant(c.runtime, await foreign.ctx, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId, extraId }))).rejects.toMatchObject({ code: "EXTRA_SOURCE_NOT_FOUND" });
  await expect(withTenant(c.runtime, ctx, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: w.otherJob, extraId }))).rejects.toMatchObject({ code: "EXTRA_SOURCE_NOT_FOUND" });
}, 180_000);
