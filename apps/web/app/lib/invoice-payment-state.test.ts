import { describe, expect, it } from "vitest";
import { deriveJobPaymentState, type InvoicePaymentFact } from "./invoice-payment-state";
const fact=(total=132000,paid=0,credited=0,id="invoice-a"):InvoicePaymentFact=>({id,totalPence:total,paidPence:paid,creditedPence:credited,balancePence:Math.max(0,total-credited-paid),customerCreditPence:Math.max(0,paid-(total-credited))});
describe("server-fact payment status",()=>{
 it("does not call an unissued job paid",()=>expect(deriveJobPaymentState([]).state).toBe("not_invoiced"));
 it("projects partial/full/reversed/overpaid states from receipts",()=>{
  expect(deriveJobPaymentState([fact(132000,50000)]).state).toBe("part_paid");
  expect(deriveJobPaymentState([fact(132000,132000)]).label).toBe("Customer paid");
  expect(deriveJobPaymentState([fact(132000,50000)]).label).toBe("Work under way");
  expect(deriveJobPaymentState([fact(132000,140000)]).state).toBe("paid");
 });
 it("requires all invoice balances, not just the latest visible invoice",()=>expect(deriveJobPaymentState([fact(),fact(132000,132000,0,"invoice-b")]).state).toBe("part_paid"));
 it("does not confuse credit-only settlement with customer cash",()=>expect(deriveJobPaymentState([fact(132000,0,132000)]).state).toBe("credited"));
 it("keeps missing payment provenance distinct from payment proof",()=>{
  const value=fact(132000,132000);delete value.paidPence;delete value.creditedPence;
  expect(deriveJobPaymentState([value]).state).toBe("settled");
 });
 it("does not describe unknown payment history as unpaid",()=>{
  const value=fact();delete value.paidPence;delete value.creditedPence;
  expect(deriveJobPaymentState([value]).state).toBe("outstanding");
 });
 it("does not invent credits or payments for a zero-value invoice",()=>expect(deriveJobPaymentState([fact(0)]).state).toBe("zero_balance"));
 it("rejects duplicates, invalid amounts and contradictory balance facts",()=>{
  expect(()=>deriveJobPaymentState([fact(),fact()])).toThrow("INVALID");
  for(const amount of [-1,0.1,Infinity,NaN,1_000_000_000_001])expect(()=>deriveJobPaymentState([{...fact(),totalPence:amount}])).toThrow("INVALID");
  expect(()=>deriveJobPaymentState([{...fact(),balancePence:0}])).toThrow("INCONSISTENT");
  expect(()=>deriveJobPaymentState([{...fact(),creditedPence:132001}])).toThrow("INVALID");
 });
 it("classifies 1000 generated exact-pence cases consistently",()=>{
  for(let n=1;n<=1000;n++){
   const total=n*101,credited=n%3===0?n:0,paid=n%2===0?total:Math.floor(total/2);
   expect(deriveJobPaymentState([fact(total,paid,credited)]).state).toBe(paid>=total-credited?"paid":"part_paid");
  }
 });
});
