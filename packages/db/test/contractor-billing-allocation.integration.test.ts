import {afterAll,beforeAll,expect,it} from "vitest";
import { cluster,world,type World } from "./contractor-billing-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>,w:World;
beforeAll(async()=>{c=await cluster();w=await world(c);},240000);afterAll(async()=>{await c?.close();});
it("E6-13 E6-14 ENT-F2 PostgreSQL full denominator Q = £80.645161…; ordinary line contributes zero",async()=>{
 await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([await w.invoice(),w.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"receipt-f2",amount:{netPence:41667,vatPence:8333,grossPence:50000}})]));
 const rows=(await c.admin.query("SELECT external_invoice_line_id,gross_numerator::text gn,gross_denominator::text gd,net_numerator::text nn,net_denominator::text nd,matched_extra_numerator::text q FROM app.contractor_receipt_line_allocation WHERE job_id=$1",[w.s.jobId])).rows;
 expect(rows.find(r=>r.external_invoice_line_id==="extra")).toMatchObject({gn:"300000",gd:"31",nn:"250000",nd:"31",q:"250000"});
 expect(rows.find(r=>r.external_invoice_line_id==="order").q).toBe("0");
 // The existing pure fixture gates its test declarations on testPath. Only the fixture helper
 // is reused here; this is reference Q from persisted fractions, not production eligibility.
 const {extra,group}=await import("../../core/src/enterprise-domain/origin.test.js");
 const {qualifyingPrincipal}=await import("@jobguard/core");const e=extra();
 e.revision.netPence=24000;e.revision.approvals[0]!.netPence=24000;
 const persisted=rows.find(r=>r.external_invoice_line_id==="extra")!;
 e.billingFacts[0]!.net={numerator:"24000",denominator:"1"};e.billingFacts[1]!.net={numerator:persisted.nn,denominator:persisted.nd};
 expect(qualifyingPrincipal(group([e]),{reference:true})).toEqual({numerator:250000n,denominator:31n});
});
it("E6-17 E6-28 checked persistence refuses tampered allocation fractions even for finance",async()=>{
 const own=await world(c),invoice=await own.invoice(),payment=own.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"checked-allocation",amount:{netPence:41667,vatPence:8333,grossPence:50000}});
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice,payment]));
 const {withTenant}=await import("../src/index.js");
 await expect(withTenant(c.runtime,own.ctx,async db=>{
  const cmd=own.importInput([invoice]);await db.$client.query("SELECT app.cb_begin($1,$2,$3,'ImportBillingStatus',$4::jsonb)",[own.session,own.s.jobId,cmd.commandId,JSON.stringify(cmd)]);
  const group=(await db.$client.query("SELECT app.cb_inputs($1,$2) groups",[own.session,own.s.jobId])).rows[0].groups[0];
  const projection=JSON.parse(JSON.stringify((await c.admin.query("SELECT projection FROM app.billing_allocation_run WHERE job_id=$1 ORDER BY server_recorded_at DESC LIMIT 1",[own.s.jobId])).rows[0].projection));
  projection.allocations[0].lines[0].net.numerator="999999";
  await db.$client.query("SELECT app.cb_derive($1,$2,$3,$4,$5,$6,$7::jsonb)",[own.session,own.s.jobId,cmd.commandId,group.source,group.invoiceNumber,group.inputHash,JSON.stringify(projection)]);
 })).rejects.toMatchObject({message:"BILLING_INVALID"});
});
it("E6-15 complete mixed-job invoice keeps both extra lines and ordinary work in the denominator",async()=>{
 const own=await world(c),invoice=await own.invoice();
 const {submitted,approveInput}=await import("./extra-approval-chain-fixtures.js"),{ExtraApprovalRepository}=await import("../src/index.js");
 const s=await submitted(c,own.w,24000);await new ExtraApprovalRepository(c.runtime).approveExtraStep(own.ctx,own.w.members.supervisor.member,approveInput(s,0));
 await own.repo.finalise(own.ctx,own.session,s.jobId,own.exportInput());
 const line=(await own.repo.read(own.ctx,own.session,s.jobId)).exports[0]!.artifact.lines[0]!;
 const comp=invoice.composition as unknown as {declared:Record<string,number>;lines:Record<string,unknown>[]};
 comp.declared={netPence:148000,vatPence:29600,grossPence:177600};comp.lines.push({externalInvoiceLineId:"second-extra",kind:"extra",existedAt:"2026-10-01T00:00:00Z",netPence:24000,vatPence:4800,grossPence:28800,match:{exportLineId:line.exportLineId,jobId:line.jobId,extraId:line.extraId,scopeItemId:line.scopeItemId,revisionId:line.revisionId,revisionHash:line.revisionHash}});
 invoice.amount=comp.declared as typeof invoice.amount;
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice,own.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"mixed-jobs",amount:{netPence:41667,vatPence:8333,grossPence:50000}})]));
 const allocations=(await c.admin.query("SELECT line_job_id,external_invoice_line_id,net_numerator::text n,net_denominator::text d FROM app.contractor_receipt_line_allocation WHERE job_id=$1",[own.s.jobId])).rows;
 expect(allocations.filter(a=>a.external_invoice_line_id!=="order").map(a=>[a.n,a.d])).toEqual([["250000","37"],["250000","37"]]);
 expect(allocations.find(a=>a.external_invoice_line_id==="second-extra").line_job_id).toBe(s.jobId);
});
it("E6-18 earlier deposits never spread onto a later-existing extra",async()=>{
 const own=await world(c),invoice=await own.invoice(),composition=invoice.composition as unknown as {lines:{kind:string;existedAt:string}[]};composition.lines.find(l=>l.kind==="extra")!.existedAt="2026-10-04T00:00:00Z";
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice,own.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"earlier-deposit",amount:{netPence:41667,vatPence:8333,grossPence:50000}})]));
 const view=await own.repo.read(own.ctx,own.session,own.s.jobId);expect(view.invoices[0]!.projection.totals.matchedExtraNet).toEqual({numerator:"0",denominator:"1"});expect(view.invoices[0]!.projection.allocations[0]!.lines.every(l=>l.lineId==="order")).toBe(true);
});
