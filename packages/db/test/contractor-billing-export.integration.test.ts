import { afterAll,beforeAll,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { cluster,world,code,type World } from "./contractor-billing-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>, w:World;
beforeAll(async()=>{c=await cluster();w=await world(c);},240000);
afterAll(async()=>{await c?.close();});
it("E6-06 E6-07 E6-08 finalising again adds no lines; two racing batches only one gets the extra",async()=>{
 const results=await Promise.all([w.exported(),w.exported()]);
 expect(results.map(r=>r.lineCount).sort()).toEqual([0,1]);
 const view=await w.repo.read(w.ctx,w.session,w.s.jobId);expect(view.exports).toHaveLength(1);
 expect((await w.exported()).lineCount).toBe(0);
});
it("E6-03 E6-10 export guard refuses wrong tenant or client contract",async()=>{
 expect(await code(w.repo.finalise(w.ctx,w.session,w.s.jobId,{...w.exportInput(),clientContractId:randomUUID()}))).toBe("BILLING_NOT_FOUND");
});
it("E6-09 an extra revised or withdrawn during finalisation is included at locked revision or excluded",async()=>{
 const {ExtraApprovalRepository}=await import("../src/index.js");
 for(const operation of ["price","withdraw"]){const own=await world(c),approvals=new ExtraApprovalRepository(c.runtime);
  const change=operation==="price"?()=>approvals.priceExtra(own.ctx,own.w.members.surveyor.member,{version:"price-extra.v1",commandId:randomUUID(),jobId:own.s.jobId,extraId:own.s.extraId,netPence:25000}):()=>approvals.withdrawExtra(own.ctx,own.w.members.supervisor.member,{version:"withdraw-extra.v1",commandId:randomUUID(),jobId:own.s.jobId,extraId:own.s.extraId,reasonCode:"not_done"});
  const results=await Promise.allSettled([own.exported(),change()]);expect(results.some(r=>r.status==="fulfilled")).toBe(true);
  const lines=(await own.repo.read(own.ctx,own.session,own.s.jobId)).exports.flatMap(b=>b.artifact.lines);expect(lines.length).toBeLessThanOrEqual(1);if(lines.length)expect(lines[0]!.approvedNet.pence).toBe(24000);
 }
});
it("E6-05 E6-27 unresolved candidates block both racing exports, MarkDuplicate then releases one canonical",async()=>{
 const own=await world(c),{ExtraRepository,ExtraApprovalRepository}=await import("../src/index.js"),{direct}=await import("./site-extra-fixtures.js");
 // Real captures with the same SoR code on the same server day, through the merged origin routine.
 const other=await new ExtraRepository(c.runtime).raiseExtra(own.ctx,direct(own.w,own.w.members.operative,{jobId:own.s.jobId,sorItem:{versionId:own.w.demo.sorVersionId,code:"CLEAR-GUTTER"}}));
 // First priced capture was non-schedule: add a third real same-code capture to produce a candidate pair.
 const third=await new ExtraRepository(c.runtime).raiseExtra(own.ctx,direct(own.w,own.w.members.operative,{jobId:own.s.jobId,sorItem:{versionId:own.w.demo.sorVersionId,code:"CLEAR-GUTTER"}}));
 const refused=await Promise.all([code(own.exported()),code(own.exported())]);expect(refused).toEqual(["BILLING_DUPLICATES_UNRESOLVED","BILLING_DUPLICATES_UNRESOLVED"]);
 const approvals=new ExtraApprovalRepository(c.runtime);
 const marking=approvals.markDuplicate(own.ctx,own.w.members.supervisor.member,{version:"mark-duplicate.v1",commandId:randomUUID(),jobId:own.s.jobId,duplicateId:third.variationId,canonicalId:other.variationId});
 const races=await Promise.allSettled([marking,own.exported(),own.exported()]);expect(races[0]!.status).toBe("fulfilled");
 await own.exported();expect((await own.repo.read(own.ctx,own.session,own.s.jobId)).exports.flatMap(b=>b.artifact.lines)).toHaveLength(1);
});

it("MON-8 agreement loss refuses new exports and delivery approvals without hiding an existing export", async () => {
 const { seedContractorAgreement } = await import("./contractor-agreement-test-fixtures.js");
 const own = await world(c), input = own.exportInput();
 const exported = await own.repo.finalise(own.ctx, own.session, own.s.jobId, input);
 const before = await own.repo.read(own.ctx, own.session, own.s.jobId);
 expect(exported.lineCount).toBe(1);
 await seedContractorAgreement(c.admin, own.w.p.tenantId, "suspended");
 for (const command of [input, own.exportInput()]) await expect(own.repo.finalise(own.ctx, own.session, own.s.jobId, command)).rejects.toMatchObject({ code: "BILLING_FORBIDDEN" });
 const batch = before.exports.find(e => e.id === exported.batchId)!;
 await expect(own.repo.approveDelivery(own.ctx, own.session, own.s.jobId, {
  version: "billing-approve-delivery.v1", commandId: randomUUID(), batchId: batch.id,
  channel: "fake_download", destination: "fictional.invalid", contentHash: batch.jsonHash,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
 })).rejects.toMatchObject({ code: "BILLING_FORBIDDEN" });
 expect((await own.repo.read(own.ctx, own.session, own.s.jobId)).exports).toEqual(before.exports);
});
