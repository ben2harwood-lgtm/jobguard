import { describe, expect, it } from "vitest";
import { isReceiptDate, parseReceiptPounds, practiceReceiptRecordV1, practiceReceiptReverseV1 } from "./customer-invoice.contracts.js";
const invoiceId="10000000-0000-4000-8000-000000000001";
const commandId="20000000-0000-4000-8000-000000000002";
const receipt={version:"practice-customer-receipt.record.v1",invoiceId,commandId,paidOn:"2026-09-19",amountPence:50000,method:"bank_transfer",reference:"Fictional part payment"};
describe("receipt amount and calendar boundaries",()=>{
 it.each([["0.01",1],["1.10",110],["16.29",1629],["500",50000],["500.00",50000],["10000000000.00",1_000_000_000_000]] as const)("parses %s to exact pence",(input,expected)=>expect(parseReceiptPounds(input)).toBe(expected));
 it.each(["", "0", "0.00", "-1", "1.001", "1e3", "NaN", "Infinity", "1,000", " 5", "5 ", ".50", "5.", "10000000000.01", "9".repeat(500)])("rejects invalid or out-of-range pounds %s",input=>expect(parseReceiptPounds(input)).toBeNull());
 it.each(["2024-02-29","2000-02-29","0001-01-01","9999-12-31","2026-04-30"])("accepts real date %s",input=>expect(isReceiptDate(input)).toBe(true));
 it.each(["2026-02-29","1900-02-29","2026-04-31","2026-00-01","2026-13-01","2026-01-00","0000-01-01","2026-1-01","2026-09-19T00:00:00Z","infinity"])("rejects non-calendar date %s",input=>{
  expect(isReceiptDate(input)).toBe(false);
  expect(practiceReceiptRecordV1.safeParse({...receipt,paidOn:input}).success).toBe(false);
 });
 it("normalises only permitted whitespace and rejects forged fields",()=>{
  expect(practiceReceiptRecordV1.parse({...receipt,reference:"  fictional  "}).reference).toBe("fictional");
  for(const extra of [{amountPence:0},{amountPence:1.1},{amountPence:1_000_000_000_001},{reference:" "},{reference:"x".repeat(121)},{method:"bank_confirmed"},{environment:"production"},{qualifyingRecoveryProof:true},{platformFeeSettlement:true}]) {
   expect(practiceReceiptRecordV1.safeParse({...receipt,...extra}).success).toBe(false);
  }
 });
 it("requires the invoice and a meaningful correction reason",()=>{
  const reverse={version:"practice-customer-receipt.reverse.v1",commandId,invoiceId,paymentId:commandId,reason:"Practice correction"};
  expect(practiceReceiptReverseV1.safeParse(reverse).success).toBe(true);
  expect(practiceReceiptReverseV1.safeParse({...reverse,invoiceId:undefined}).success).toBe(false);
  expect(practiceReceiptReverseV1.safeParse({...reverse,reason:"  "}).success).toBe(false);
 });
});
