import {afterAll,beforeAll,expect,it} from "vitest";
import {cluster,world,code,type World} from "./contractor-billing-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>,w:World;
beforeAll(async()=>{c=await cluster();w=await world(c);},240000);afterAll(async()=>{await c?.close();});
it("E6-11 E6-12 source event idempotence and cross-channel payment identity",async()=>{
 const invoice=await w.invoice(), payment=w.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"payment-1",amount:{netPence:41667,vatPence:8333,grossPence:50000}});
 await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([invoice,payment]));
 await w.repo.import(w.ctx,w.session,w.s.jobId,{...w.importInput([payment]),transport:"csv"});
 const view=await w.repo.read(w.ctx,w.session,w.s.jobId);expect(view.invoices[0]!.projection.totals.matchedExtraNet).toEqual({numerator:"250000",denominator:"31"});
 expect(await code(w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([{...payment,amount:{netPence:40000,vatPence:8000,grossPence:48000}}])))).toBe("BILLING_CONFLICT");
});
it("E6-16 unknown composition is quarantined and imports never create, price or approve an extra",async()=>{
 const before=(await c.admin.query("SELECT count(*)::int n FROM app.variation")).rows[0].n;
 await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([w.event("paid",{invoiceNumber:"unknown"})]));
 const view=await w.repo.read(w.ctx,w.session,w.s.jobId);expect(view.invoices.find(i=>i.invoiceNumber==="unknown")!.projection.held).not.toHaveLength(0);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.variation")).rows[0].n).toBe(before);
});
it("E6-12 E6-21 conflicting cross-source payment identities append ambiguity runs for both groups",async()=>{
 const own=await world(c),inv=await own.invoice(),paid=own.event("paid",{reconciliationId:"shared",effectiveAt:"2026-10-03T12:00:00Z",amount:{netPence:41667,vatPence:8333,grossPence:50000}});
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([inv,paid]));
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([{...paid,source:"other-source",sourceEventId:"other-observation"}]));
 const view=await own.repo.read(own.ctx,own.session,own.s.jobId);for(const row of view.invoices)expect(row.projection.totals.matchedExtraNet.numerator).toBe("0");
 expect(view.invoices.every(i=>i.projection.held.length>0)).toBe(true);
});
it("E6-22 reconciliation totals equal drill-down sums and alert age comes from the frozen contract",async()=>{
 const own=await world(c);expect((await own.repo.read(own.ctx,own.session,own.s.jobId)).reconciliation.totals.approvedNotExported).toEqual({numerator:"24000",denominator:"1"});
 await own.exported();const view=await own.repo.read(own.ctx,own.session,own.s.jobId);
 expect(view.reconciliation.approvedNotExported).toHaveLength(0);expect(view.reconciliation.unbilledExports).toHaveLength(1);
 expect(view.reconciliation.totals.unbilledExports).toEqual(view.reconciliation.unbilledExports[0]!.net);
 const row=(await c.admin.query("SELECT (cv.document->>'exportedNotBilledAlertDays')::int days FROM app.work_order w JOIN app.client_contract_version cv ON(cv.tenant_id,cv.id)=(w.tenant_id,w.contract_version_id) WHERE w.job_id=$1",[own.s.jobId])).rows[0];
 expect(view.reconciliation.unbilledExports[0]!.alertDays).toBe(row.days);
});
it("E6-27 a conflicting later event rolls back earlier events, receipt, run and audit atomically",async()=>{
 const own=await world(c),invoice=await own.invoice();await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice]));
 const snapshot=async()=>{const rows:Record<string,number>={};for(const name of ["billing_status_import","billing_fact","billing_allocation_run","billing_application_event","contractor_receipt_line_allocation","command_receipt","audit_event"])rows[name]=(await c.admin.query(`SELECT count(*)::int n FROM app.${name} WHERE tenant_id=$1`,[own.w.p.tenantId])).rows[0].n;return rows;};
 const before=await snapshot(),newFact=own.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"rolled-back",amount:{netPence:1000,vatPence:200,grossPence:1200}});
 expect(await code(own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([newFact,{...invoice,effectiveAt:"2026-10-02T13:00:00Z"}])))).toBe("BILLING_CONFLICT");expect(await snapshot()).toEqual(before);
});
it("E6-31 imports append no platform fee, journal or subscription facts",async()=>{
 const own=await world(c),invoice=await own.invoice();
 const names=(await c.admin.query("SELECT c.table_name FROM information_schema.columns c WHERE c.table_schema='app' AND c.column_name='tenant_id' AND c.table_name ~ '(fee|journal|subscription)' ORDER BY c.table_name")).rows.map(r=>r.table_name as string);
 expect(names.length).toBeGreaterThan(0);const counts=async()=>{const result=[];for(const name of names)result.push((await c.admin.query(`SELECT count(*)::int n FROM app.${name} WHERE tenant_id=$1`,[own.w.p.tenantId])).rows[0].n);return result;};
 const before=await counts();await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice]));expect(await counts()).toEqual(before);
});
it("E6-19 imported rejection is projected without editing the approved extra or invoice history",async()=>{
 const own=await world(c),invoice=await own.invoice();await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice,own.event("rejected",{originalEventId:invoice.sourceEventId,effectiveAt:"2026-10-04T12:00:00Z",amount:{netPence:24000,vatPence:4800,grossPence:28800},lineAdjustments:[{externalInvoiceLineId:"extra",netPence:24000,vatPence:4800,grossPence:28800}]})]));
 const view=await own.repo.read(own.ctx,own.session,own.s.jobId);expect(view.reconciliation.rejections).toHaveLength(1);expect(view.reconciliation.totals.rejections).toEqual({numerator:"24000",denominator:"1"});expect((await c.admin.query("SELECT count(*)::int n FROM app.billing_fact WHERE job_id=$1",[own.s.jobId])).rows[0].n).toBe(2);
});
it("E6-03 E6-28 populated billing rows fail closed without tenant context and stay isolated from another tenant",async()=>{
 const own=await world(c),invoice=await own.invoice();await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice]));const foreign=await world(c),{withTenant}=await import("../src/index.js");
 expect((await c.admin.query("SELECT count(*)::int n FROM app.billing_fact WHERE tenant_id=$1",[own.w.p.tenantId])).rows[0].n).toBeGreaterThan(0);
 expect((await c.runtime.query("SELECT count(*)::int n FROM app.billing_fact WHERE tenant_id=$1",[own.w.p.tenantId])).rows[0].n).toBe(0);
 expect(await withTenant(c.runtime,foreign.ctx,async db=>(await db.$client.query("SELECT count(*)::int n FROM app.billing_fact WHERE tenant_id=$1",[own.w.p.tenantId])).rows[0].n)).toBe(0);
 expect(await code(own.repo.read(own.ctx,foreign.session,own.s.jobId))).toBe("BILLING_FORBIDDEN");
});

for (const acrossJobs of [false, true]) it(`r6 one export line cannot match two invoices (${acrossJobs ? "two jobs" : "one job"})`,async()=>{
 const own=await world(c),invoice=await own.invoice();
 const payment=own.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"r6-first-payment",amount:{netPence:41667,vatPence:8333,grossPence:50000}});
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice,payment]));
 const before=(await c.admin.query("SELECT * FROM app.billing_line_match WHERE tenant_id=$1",[own.w.p.tenantId])).rows;
 expect(before).toHaveLength(1);
 let secondJob=own.s.jobId;
 if(acrossJobs){const {submitted}=await import("./extra-approval-chain-fixtures.js");secondJob=(await submitted(c,own.w,24000)).jobId;}
 const second={...invoice,sourceEventId:"r6-second-invoice",invoiceNumber:"r6-second-invoice"};
 await own.repo.import(own.ctx,own.session,secondJob,own.importInput([second,{...payment,sourceEventId:"r6-second-payment",invoiceNumber:second.invoiceNumber,reconciliationId:"r6-second-payment"}]));
 expect((await c.admin.query("SELECT * FROM app.billing_line_match WHERE tenant_id=$1",[own.w.p.tenantId])).rows).toEqual(before);
 const facts=(await c.admin.query("SELECT id,source_event_id,match_valid FROM app.billing_fact WHERE tenant_id=$1 AND payload->>'factType'='invoiced' ORDER BY match_valid DESC",[own.w.p.tenantId])).rows;
 expect(facts).toEqual([{id:expect.any(String),source_event_id:invoice.sourceEventId,match_valid:true},{id:expect.any(String),source_event_id:second.sourceEventId,match_valid:false}]);
 const quarantine=(await own.repo.read(own.ctx,own.session,secondJob)).quarantine;
 expect(quarantine).toContainEqual({fact_id:facts[1].id,reason:"EXPORT_LINE_ALREADY_MATCHED"});
 expect(quarantine.some(q=>q.fact_id===facts[0].id)).toBe(false);
 const views=await Promise.all([...new Set([own.s.jobId,secondJob])].map(job=>own.repo.read(own.ctx,own.session,job)));
 const totals=views.flatMap(v=>v.invoices.map(i=>i.projection.totals.matchedExtraNet));
 expect(totals.filter(t=>t.numerator!=="0")).toEqual([{numerator:"250000",denominator:"31"}]);
 const allocations=(await c.admin.query(`SELECT a.matched_extra_numerator::text n,a.matched_extra_denominator::text d
 FROM app.contractor_receipt_line_allocation a JOIN app.billing_allocation_run r ON(r.tenant_id,r.id)=(a.tenant_id,a.run_id)
 WHERE a.tenant_id=$1 AND a.matched_extra_numerator<>0 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run newer WHERE newer.tenant_id=r.tenant_id AND newer.predecessor_id=r.id)`,[own.w.p.tenantId])).rows;
 expect(allocations).toEqual([{n:"250000",d:"31"}]);
});
it("r6 replaying the same invoice fact with a new command creates no match or quarantine",async()=>{
 const own=await world(c),invoice=await own.invoice();
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice]));
 const before=(await c.admin.query("SELECT * FROM app.billing_line_match WHERE tenant_id=$1",[own.w.p.tenantId])).rows;
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice]));
 expect((await c.admin.query("SELECT * FROM app.billing_line_match WHERE tenant_id=$1",[own.w.p.tenantId])).rows).toEqual(before);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.billing_fact WHERE tenant_id=$1",[own.w.p.tenantId])).rows[0].n).toBe(1);
 expect((await own.repo.read(own.ctx,own.session,own.s.jobId)).quarantine).toEqual([]);
});
it("r6 PostgreSQL refuses a second direct match of the same export line",async()=>{
 const own=await world(c),invoice=await own.invoice();
 await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([invoice]));
 await expect(c.admin.query(`INSERT INTO app.billing_line_match(tenant_id,id,job_id,client_contract_id,fact_id,external_invoice_line_id,export_line_id,line_job_id)
 SELECT tenant_id,gen_random_uuid(),job_id,client_contract_id,fact_id,'different-line',export_line_id,line_job_id FROM app.billing_line_match WHERE tenant_id=$1`,[own.w.p.tenantId])).rejects.toMatchObject({code:"23505",constraint:"billing_line_match_export_line_unique"});
});
