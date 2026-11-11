import { testActorContext } from "./tenant-context-test-utils.js";
import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
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
 await assertLp4SealedEvents(c.admin, w.w.p.tenantId, "contractor.billing.finaliseexportbatch");
 expect((await w.exported()).lineCount).toBe(0);
});
it("E6-03 E6-10 export guard refuses wrong tenant or client contract",async()=>{
 expect(await code(w.repo.finalise(w.ctx,w.session,w.s.jobId,{...w.exportInput(),clientContractId:randomUUID()}))).toBe("BILLING_NOT_FOUND");
});
it("E6-09 an extra revised or withdrawn during finalisation is included at locked revision or excluded",async()=>{
 const {ExtraApprovalRepository}=await import("../src/index.js");
 for(const operation of ["price","withdraw"]){const own=await world(c),approvals=new ExtraApprovalRepository(c.runtime);
  const change=operation==="price"?async ()=>approvals.priceExtra(await testActorContext(c.admin, own.ctx, own.w.members.surveyor.member),own.w.members.surveyor.member,{version:"price-extra.v1",commandId:randomUUID(),jobId:own.s.jobId,extraId:own.s.extraId,netPence:25000}):async ()=>approvals.withdrawExtra(await testActorContext(c.admin, own.ctx, own.w.members.supervisor.member),own.w.members.supervisor.member,{version:"withdraw-extra.v1",commandId:randomUUID(),jobId:own.s.jobId,extraId:own.s.extraId,reasonCode:"not_done"});
  const results=await Promise.allSettled([own.exported(),change()]);expect(results.some(r=>r.status==="fulfilled")).toBe(true);
  const lines=(await own.repo.read(own.ctx,own.session,own.s.jobId)).exports.flatMap(b=>b.artifact.lines);expect(lines.length).toBeLessThanOrEqual(1);if(lines.length)expect(lines[0]!.approvedNet.pence).toBe(24000);
 }
});
it("E6-05 E6-27 unresolved candidates block both racing exports, MarkDuplicate then releases one canonical",async()=>{
 const own=await world(c),{ExtraRepository,ExtraApprovalRepository}=await import("../src/index.js"),{direct}=await import("./site-extra-fixtures.js");
 // Real captures with the same SoR code on the same server day, through the merged origin routine.
 const other=await new ExtraRepository(c.runtime).raiseExtra(await testActorContext(c.admin, own.ctx, own.w.members.operative.member),direct(own.w,own.w.members.operative,{jobId:own.s.jobId,sorItem:{versionId:own.w.demo.sorVersionId,code:"CLEAR-GUTTER"}}));
 // First priced capture was non-schedule: add a third real same-code capture to produce a candidate pair.
 const third=await new ExtraRepository(c.runtime).raiseExtra(await testActorContext(c.admin, own.ctx, own.w.members.operative.member),direct(own.w,own.w.members.operative,{jobId:own.s.jobId,sorItem:{versionId:own.w.demo.sorVersionId,code:"CLEAR-GUTTER"}}));
 const refused=await Promise.all([code(own.exported()),code(own.exported())]);expect(refused).toEqual(["BILLING_DUPLICATES_UNRESOLVED","BILLING_DUPLICATES_UNRESOLVED"]);
 const approvals=new ExtraApprovalRepository(c.runtime);
 const marking=approvals.markDuplicate(await testActorContext(c.admin, own.ctx, own.w.members.supervisor.member),own.w.members.supervisor.member,{version:"mark-duplicate.v1",commandId:randomUUID(),jobId:own.s.jobId,duplicateId:third.variationId,canonicalId:other.variationId});
 const races=await Promise.allSettled([marking,own.exported(),own.exported()]);expect(races[0]!.status).toBe("fulfilled");
 await own.exported();expect((await own.repo.read(own.ctx,own.session,own.s.jobId)).exports.flatMap(b=>b.artifact.lines)).toHaveLength(1);
});

it("LATER-SAFETY-81 SQL export prefixes TAB and CR formulas and preserves existing escaping",async()=>{
 const own=await world(c);await own.exported();
 const view=await own.repo.read(own.ctx,own.session,own.s.jobId),artifact=view.exports[0]!.artifact;
 for(const prefix of ["\t","\r","=","+","-","@","'"]){
  const description=prefix+'SUM(1,2) "fictional"';
  const modified={...JSON.parse(artifact.json),lines:artifact.lines.map(line=>({...line,description}))};
  const csv=(await c.admin.query<{csv:string}>("SELECT app.cb_csv($1::jsonb) csv",[JSON.stringify(modified)])).rows[0]!.csv;
  expect(csv).toContain(',"\''+description.replaceAll('"','""')+'",');
  expect(modified.lines[0]!.description).toBe(description);
 }
 const plain=(await c.admin.query<{cell:string}>("SELECT app.cb_csv_cell($1) cell",['Fictional "plain", cell'])).rows[0]!.cell;
 expect(plain).toBe('"Fictional ""plain"", cell"');
});
it("LATER-SAFETY-16 reconciliation restores an approved unlinked extra until its export", async () => {
 const own=await world(c,338),{ExtraRepository,ExtraApprovalRepository,readExtraDuplicateCandidates}=await import("../src/index.js"),{direct}=await import("./site-extra-fixtures.js");
 const extras=new ExtraRepository(c.runtime),approvals=new ExtraApprovalRepository(c.runtime),actor=own.w.members.supervisor.member;
 // A distinct free-text capture avoids unresolved same-code candidates after unlinking.
 const canonical=await extras.raiseExtra(await testActorContext(c.admin, own.ctx, own.w.members.operative.member),direct(own.w,own.w.members.operative,{jobId:own.s.jobId}));
 const expected=[{extraId:own.s.extraId,net:{numerator:"338",denominator:"1"}}];
 const read=()=>own.repo.read(own.ctx,own.session,own.s.jobId);
 expect((await read()).reconciliation.approvedNotExported).toEqual(expected);
 const {approveInput}=await import("./extra-approval-chain-fixtures.js");
 await approvals.priceExtra(await testActorContext(c.admin, own.ctx, own.w.members.surveyor.member),own.w.members.surveyor.member,{version:"price-extra.v1",commandId:randomUUID(),jobId:own.s.jobId,extraId:canonical.variationId,netPence:338});
 const request=await approvals.submitExtra(await testActorContext(c.admin, own.ctx, actor),actor,{version:"submit-extra.v1",commandId:randomUUID(),jobId:own.s.jobId,extraId:canonical.variationId});
 await approvals.approveExtraStep(await testActorContext(c.admin, own.ctx, actor),actor,approveInput({jobId:own.s.jobId,requestId:String(request.requestId),hash:String(request.revisionHash),net:338},0));
 const linked=await approvals.markDuplicate(await testActorContext(c.admin, own.ctx, actor),actor,{version:"mark-duplicate.v1",commandId:randomUUID(),jobId:own.s.jobId,duplicateId:own.s.extraId,canonicalId:canonical.variationId});
 // Approved work links only to an approved canonical (LATER-SAFETY-111), which
 // stays billable while the link is active (LATER-SAFETY-132): only the duplicate is masked.
 expect((await read()).reconciliation.approvedNotExported).toEqual([{extraId:canonical.variationId,net:{numerator:"338",denominator:"1"}}]);
 const state=await readExtraDuplicateCandidates(c.runtime,await testActorContext(c.admin, own.ctx, actor),actor,own.s.jobId);
 await extras.unlinkDuplicate(await testActorContext(c.admin, own.ctx, own.w.members.supervisor.member),{version:"extra-duplicate-unlink.v1",commandId:randomUUID(),jobId:own.s.jobId,actorMembershipId:actor.membershipId,linkId:String(linked.linkId),expectedRevision:state.revision,reasonCode:"linked_in_error"});
 // Once unlinked, the canonical may be reopened for review, isolating the restored extra.
 await approvals.reviseExtra(await testActorContext(c.admin, own.ctx, own.w.members.surveyor.member),own.w.members.surveyor.member,{version:"revise-extra.v1",commandId:randomUUID(),jobId:own.s.jobId,extraId:canonical.variationId,netPence:339});
 const restored=await read();
 expect(restored.reconciliation.approvedNotExported).toEqual(expected);
 expect(restored.reconciliation.totals.approvedNotExported).toEqual({numerator:"338",denominator:"1"});
 expect((await read()).reconciliation.approvedNotExported).toEqual(expected);
 expect((await own.exported()).lineCount).toBe(1);
 const exported=await read();
 expect(exported.exports.flatMap(batch=>batch.artifact.lines).map(line=>line.extraId)).toEqual([own.s.extraId]);
 expect(exported.reconciliation.approvedNotExported).toEqual([]);
 expect(exported.reconciliation.totals.approvedNotExported).toEqual({numerator:"0",denominator:"1"});
});
it("LATER-SAFETY-16 reconciliation and export exclude withdrawn and rejected extras", async () => {
 const {ExtraApprovalRepository}=await import("../src/index.js"),{submitted,approveInput}=await import("./extra-approval-chain-fixtures.js");
 const own=await world(c,338),approvals=new ExtraApprovalRepository(c.runtime),actor=own.w.members.supervisor.member;
 // An approved extra cannot be withdrawn (ALREADY_DECIDED); withdraw a submitted one instead.
 const withdrawn=await submitted(c,own.w,338);
 await approvals.withdrawExtra(await testActorContext(c.admin, own.ctx, actor),actor,{version:"withdraw-extra.v1",commandId:randomUUID(),jobId:withdrawn.jobId,extraId:withdrawn.extraId,reasonCode:"not_done"});
 expect((await own.repo.read(own.ctx,own.session,withdrawn.jobId)).reconciliation.approvedNotExported).toEqual([]);
 expect((await own.repo.finalise(own.ctx,own.session,withdrawn.jobId,own.exportInput())).lineCount).toBe(0);
 const rejected=await submitted(c,own.w,338);
 await approvals.rejectExtra(await testActorContext(c.admin, own.ctx, actor),actor,{...approveInput(rejected,0),version:"reject-extra.v1",reasonCode:"price_not_agreed"});
 expect((await own.repo.read(own.ctx,own.session,rejected.jobId)).reconciliation.approvedNotExported).toEqual([]);
 expect((await own.repo.finalise(own.ctx,own.session,rejected.jobId,own.exportInput())).lineCount).toBe(0);
});

it("LATER-SAFETY-16 the effective-state read routine enforces tenant, session and job authority", async () => {
 const own=await world(c,338),foreign=await world(c),{withTenant}=await import("../src/index.js");
 const sql="SELECT * FROM app.contractor_approved_not_exported($1,$2)";
 await expect(c.runtime.query(sql,[own.session,own.s.jobId])).rejects.toMatchObject({code:"42501"});
 await expect(withTenant(c.runtime,own.ctx,db=>db.$client.query(sql,[foreign.session,own.s.jobId]))).rejects.toMatchObject({code:"42501"});
 await expect(withTenant(c.runtime,foreign.ctx,db=>db.$client.query(sql,[foreign.session,own.s.jobId]))).rejects.toMatchObject({code:"P0002"});
 const rows=await withTenant(c.runtime,own.ctx,async db=>(await db.$client.query(sql,[own.session,own.s.jobId])).rows);
 expect(rows).toEqual([{extra_id:own.s.extraId,net_pence:"338"}]);
});
