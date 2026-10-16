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
