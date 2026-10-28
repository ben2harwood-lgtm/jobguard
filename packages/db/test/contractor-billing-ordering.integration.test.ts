import {afterAll,beforeAll,expect,it} from "vitest";
import {cluster,world} from "./contractor-billing-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>;beforeAll(async()=>{c=await cluster();},240000);afterAll(async()=>{await c?.close();});
it("E6-18 E6-20 E6-21 payment before invoice is held then recomputed in a successor run",async()=>{
 const w=await world(c),invoice=await w.invoice(),payment=w.event("paid",{effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"order-payment",amount:{netPence:41667,vatPence:8333,grossPence:50000}});
 await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([payment]));expect((await w.repo.read(w.ctx,w.session,w.s.jobId)).invoices[0]!.projection.held.length).toBeGreaterThan(0);
 await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([invoice]));
 const a=(await w.repo.read(w.ctx,w.session,w.s.jobId)).invoices[0]!.projection;
 await w.repo.import(w.ctx,w.session,w.s.jobId,w.importInput([invoice,payment]));
 expect((await w.repo.read(w.ctx,w.session,w.s.jobId)).invoices[0]!.projection).toEqual(a);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.billing_allocation_run WHERE job_id=$1",[w.s.jobId])).rows[0].n).toBe(2);
});
it("E6-19 E6-20 all 24 arrival permutations preserve credits, reversals and exact projections",async()=>{
 const permutations=<T,>(xs:T[]):T[][]=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(t=>[x,...t])):[[]];
 let expected:unknown;
 for(const order of permutations([0,1,2,3])){
  const own=await world(c),inv={...await own.invoice(),sourceEventId:"invoice"},payment=own.event("paid",{sourceEventId:"payment",effectiveAt:"2026-10-03T12:00:00Z",reconciliationId:"receipt",amount:{netPence:41667,vatPence:8333,grossPence:50000}}),credit=own.event("credited",{sourceEventId:"credit",originalEventId:"invoice",effectiveAt:"2026-10-04T12:00:00Z",amount:{netPence:10000,vatPence:2000,grossPence:12000},lineAdjustments:[{externalInvoiceLineId:"order",netPence:10000,vatPence:2000,grossPence:12000}]}),reversed=own.event("payment_reversed",{sourceEventId:"reversal",originalEventId:"payment",reconciliationId:"reversal",effectiveAt:"2026-10-05T12:00:00Z",amount:{netPence:20000,vatPence:4000,grossPence:24000}});
  const events=[inv,payment,credit,reversed];for(const i of order)await own.repo.import(own.ctx,own.session,own.s.jobId,own.importInput([events[i]]));
  const actual=(await own.repo.read(own.ctx,own.session,own.s.jobId)).invoices[0]!.projection;if(expected===undefined)expected=actual;else expect(actual).toEqual(expected);
  expect(actual.held).toEqual([]);expect(actual.allocations).toHaveLength(2);
 }
},300000);

for (const factType of ["paid", "credited", "rejected", "payment_reversed"] as const) {
 for (const separateImports of [false, true]) it(`r7 E6-19 E6-20 ${factType} composition preserves exact projection in either invoice arrival order (${separateImports ? "separate imports" : "one import"})`, async () => {
  let expected: unknown;
  for (const movementFirst of [false, true]) {
   const own = await world(c), invoice = {...await own.invoice(), sourceEventId: "r7-invoice"};
   const payment = own.event("paid", {sourceEventId: "r7-payment", reconciliationId: "r7-receipt",
    effectiveAt: "2026-10-03T12:00:00Z", amount: {netPence: 41667, vatPence: 8333, grossPence: 50000}});
   const isAdjustment = factType === "credited" || factType === "rejected";
   const movement = own.event(factType, {sourceEventId: "r7-movement", composition: invoice.composition,
    reconciliationId: isAdjustment ? null : "r7-movement-receipt",
    originalEventId: factType === "payment_reversed" ? payment.sourceEventId : isAdjustment ? invoice.sourceEventId : null,
    effectiveAt: "2026-10-04T12:00:00Z",
    amount: isAdjustment ? {netPence: 24000, vatPence: 4800, grossPence: 28800} : payment.amount,
    lineAdjustments: isAdjustment ? [{externalInvoiceLineId: "extra", netPence: 24000, vatPence: 4800, grossPence: 28800}] : []});
   const movements = factType === "payment_reversed" ? [payment, movement] : [movement];
   const arrivals = movementFirst ? [...movements, invoice] : [invoice, ...movements];
   const imports = separateImports ? arrivals.map(event => [event]) : [arrivals];
   for (const events of imports) {
    await own.repo.import(own.ctx, own.session, own.s.jobId, own.importInput(events));
    const view = await own.repo.read(own.ctx, own.session, own.s.jobId);
    // Separate imports retain prerequisite holds permanently; no match-validation quarantine is legitimate.
    if (!separateImports || !movementFirst) expect(view.quarantine).toEqual([]);
    else expect(view.quarantine.every(q => q.reason === "INVOICE_REQUIRED")).toBe(true);
    const matches = (await c.admin.query(`SELECT f.source_event_id, f.payload->>'factType' fact_type
     FROM app.billing_line_match m JOIN app.billing_fact f ON (f.tenant_id,f.id)=(m.tenant_id,m.fact_id)
     WHERE m.tenant_id=$1`, [own.w.p.tenantId])).rows;
    expect(matches).toEqual(events.includes(invoice) || (!movementFirst && separateImports)
     ? [{source_event_id: invoice.sourceEventId, fact_type: "invoiced"}] : []);
   }
   const view = await own.repo.read(own.ctx, own.session, own.s.jobId), actual = view.invoices[0]!.projection;
   if (expected === undefined) expected = actual; else expect(actual).toEqual(expected);
   expect(actual.held).toEqual([]);
   const quarantineHistory = (await c.admin.query(`SELECT f.payload->>'factType' fact_type, q.reason
    FROM app.billing_quarantine q JOIN app.billing_fact f ON (f.tenant_id,f.id)=(q.tenant_id,q.fact_id)
    WHERE q.tenant_id=$1 ORDER BY fact_type`, [own.w.p.tenantId])).rows;
   expect(quarantineHistory).toEqual(separateImports && movementFirst
    ? movements.map(e => ({fact_type: e.factType, reason: "INVOICE_REQUIRED"})).sort((a, b) => a.fact_type.localeCompare(b.fact_type)) : []);
   expect(view.reconciliation.totals.unbilledExports).toEqual({numerator: factType === "credited" ? "24000" : "0", denominator: "1"});
   expect(actual.totals.billedNet).toEqual({numerator: "124000", denominator: "1"});
   expect(actual.totals.creditedNet).toEqual({numerator: factType === "credited" ? "24000" : "0", denominator: "1"});
   expect(actual.totals.paidNet).toEqual(factType === "paid"
    ? {numerator: "125000", denominator: "3"} : {numerator: "0", denominator: "1"});
   expect(actual.totals.matchedExtraNet).toEqual(factType === "paid"
    ? {numerator: "250000", denominator: "31"} : {numerator: "0", denominator: "1"});
   expect(actual.lines.find(l => l.lineId === "extra")!.rejected).toBe(factType === "rejected");
   const facts = (await c.admin.query("SELECT match_valid FROM app.billing_fact WHERE tenant_id=$1", [own.w.p.tenantId])).rows;
   expect(facts).toHaveLength(arrivals.length);
   expect(facts.every(f => f.match_valid === true)).toBe(true);
   const persisted = (await c.admin.query("SELECT projection FROM app.billing_allocation_run WHERE id=$1", [view.invoices[0]!.runId])).rows[0].projection;
   expect(persisted).toEqual(actual);
  }
 }, 120000);

 it(`r7 E6-16 invalid ${factType} composition remains quarantined in either invoice arrival order`, async () => {
  for (const movementFirst of [false, true]) {
   const own = await world(c), invoice = await own.invoice();
   const composition = structuredClone(invoice.composition) as unknown as {lines: {kind: string; match: {revisionHash: string} | null}[]};
   composition.lines.find(l => l.kind === "extra")!.match!.revisionHash = "b".repeat(64);
   const isAdjustment = factType === "credited" || factType === "rejected";
   const movement = own.event(factType, {sourceEventId: "r7-invalid-movement", composition,
    reconciliationId: isAdjustment ? null : "r7-invalid-receipt",
    originalEventId: isAdjustment ? invoice.sourceEventId : factType === "payment_reversed" ? "r7-missing-payment" : null,
    effectiveAt: "2026-10-04T12:00:00Z", amount: {netPence: 24000, vatPence: 4800, grossPence: 28800},
    lineAdjustments: isAdjustment ? [{externalInvoiceLineId: "extra", netPence: 24000, vatPence: 4800, grossPence: 28800}] : []});
   for (const event of movementFirst ? [movement, invoice] : [invoice, movement])
    await own.repo.import(own.ctx, own.session, own.s.jobId, own.importInput([event]));
   const facts = (await c.admin.query("SELECT id, source_event_id, match_valid FROM app.billing_fact WHERE tenant_id=$1 ORDER BY match_valid DESC", [own.w.p.tenantId])).rows;
   expect(facts).toEqual([
    {id: expect.any(String), source_event_id: invoice.sourceEventId, match_valid: true},
    {id: expect.any(String), source_event_id: movement.sourceEventId, match_valid: false}]);
   const view = await own.repo.read(own.ctx, own.session, own.s.jobId);
   expect(view.quarantine).toContainEqual({fact_id: facts[1].id, reason: "INVALID_COMPOSITION_OR_MATCH"});
   expect(view.quarantine.every(q => q.fact_id === facts[1].id &&
    ["INVALID_COMPOSITION_OR_MATCH", "INVOICE_REQUIRED", "COMPOSITION_REQUIRED"].includes(q.reason))).toBe(true);
   expect(view.invoices[0]!.projection.held).toContainEqual({sourceEventId: movement.sourceEventId, reason: "COMPOSITION_REQUIRED"});
   expect(view.invoices[0]!.projection.totals.matchedExtraNet).toEqual({numerator: "0", denominator: "1"});
   expect((await c.admin.query("SELECT fact_id FROM app.billing_line_match WHERE tenant_id=$1", [own.w.p.tenantId])).rows).toEqual([{fact_id: facts[0].id}]);
  }
 }, 120000);
}
