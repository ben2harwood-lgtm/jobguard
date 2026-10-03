import { describe, expect, it } from "vitest";
import { allocateReceiptToLines, type ReceiptAllocationInput } from "./receipt-allocation.js";
import { addExactPence, calculateCumulativeFee, exactPence, serializeExactPence } from "./cumulative-fee.js";
const before = "2026-09-01T00:00:00Z", at = "2026-09-30T00:00:00Z", after = "2026-10-01T00:00:00Z";
const p = (value: number) => ({numerator:String(value),denominator:"1"});
const line = (id:string,net:number,gross:number,outstanding=gross,existedAt=before,invoiceId="blended") => ({id,invoiceId,netPence:net,grossPence:gross,outstandingGross:p(outstanding),existedAt});
const input = (gross:number,lines:ReceiptAllocationInput["lines"]):ReceiptAllocationInput => ({version:"receipt-allocation.v1",sourceRef:"fixture://remittance",receiptGross:p(gross),effectiveAt:at,direction:"receipt",invoiceId:"blended",separateInvoiceId:null,explicit:null,lines});
const net = (raw:ReceiptAllocationInput,id="catch") => allocateReceiptToLines(raw).find(l=>l.lineId===id)?.net ?? exactPence(0n);
const fee = (principal: ReturnType<typeof exactPence>) => calculateCumulativeFee({version:"cumulative-fee.v1",rate:{version:"fee-rate.v1",policyVersion:"v3",numerator:"10",denominator:"100"},cumulativeQualifyingPrincipal:serializeExactPence(principal),priorNetPostedPence:0,priorPolicyVersion:"v3",compensatesDerivationId:null}).cumulativeFee.pence;
describe("receipt hierarchy and exact line allocation",()=>{
 it("F4/F4b keeps fractional pence until cumulative rounding",()=>{
  const lines=[line("baseline",3360000,4032000),line("catch",80000,96000)];
  const first=net(input(2400000,lines));expect(first).toEqual(exactPence(2000000n,43n));expect(fee(first)).toBe(4651);
  const second=net(input(1728000,lines));expect(fee(addExactPence(first,second))).toBe(8000);
  expect(fee(net(input(4128000,lines)))).toBe(8000);
 });
 it("F5 excludes pre-existing deposits from later catches",()=>{
  const lines=[line("baseline",3360000,4032000),line("catch",80000,96000,96000,after)];
  expect(net(input(1200000,lines)).numerator).toBe(0n);
  expect(fee(net(input(1464000,[line("baseline",3360000,4032000,2832000),line("catch",80000,96000)])))).toBe(4000);
 });
 it("F6 explicit allocation outranks the blended invoice and preserves its source",()=>{
  const raw={...input(2400000,[line("baseline",3360000,4032000),line("catch",80000,96000)]),explicit:[{lineId:"baseline",gross:p(2400000)}]};
  expect(fee(net(raw))).toBe(0);expect(allocateReceiptToLines(raw)[0]).toMatchObject({rule:"explicit",sourceRef:"fixture://remittance"});
 });
 it("F7 ignores the unpaid main invoice for a separate catch invoice",()=>{
  const raw={...input(96000,[line("catch",80000,96000,96000,before,"catch-invoice"),line("baseline",3360000,4032000)]),invoiceId:"catch-invoice",separateInvoiceId:"catch-invoice"};
  expect(fee(net(raw))).toBe(8000);expect(allocateReceiptToLines(raw)).toHaveLength(1);
  expect(allocateReceiptToLines(raw)[0]?.rule).toBe("separate_invoice");
 });
 it("ENT-F2 conserves gross including non-fee order lines and each own tax ratio",()=>{
  const raw=input(50000,[line("order",100000,120000),line("catch",24000,28800)]);
  expect(net(raw)).toEqual(exactPence(250000n,31n));expect(fee(net(raw))).toBe(806);
  expect(allocateReceiptToLines(raw).reduce((sum,l)=>addExactPence(sum,l.gross),exactPence(0n))).toEqual(exactPence(50000n));
  expect(net(input(60,[line("zero-VAT",100,100),line("catch",100,120)]))).toEqual(exactPence(300n,11n));
 });
 it("refunds apply the same hierarchy with negative exact values",()=>{
  const raw={...input(24000,[line("catch",80000,96000)]),direction:"reversal" as const,explicit:[{lineId:"catch",gross:p(24000)}]};
  expect(net(raw)).toEqual(exactPence(-20000n));
  expect(allocateReceiptToLines({...raw,explicit:null})[0]?.net).toEqual(exactPence(-20000n));
 });
 it("split receipts conserve exact gross/net with generated ratios",()=>{
  for(let i=1;i<=300;i++) {
   const lines=[line("base",i*10,i*12),line("catch",i*20,i*24)];
   const whole=input(i*18,lines),a=input(i*7,lines),b=input(i*11,lines);
   expect(addExactPence(net(a),net(b))).toEqual(net(whole));
   expect(fee(addExactPence(net(a),net(b)))).toBe(fee(net(whole)));
  }
 });
 it("rejects over-allocation, unknown/duplicate/late explicit targets and invalid invoices",()=>{
  const base=input(120,[line("catch",100,120)]);
  for(const raw of [ {...base,receiptGross:p(121)}, {...base,lines:[]}, {...base,separateInvoiceId:"other"},
   {...base,explicit:[]}, {...base,explicit:[{lineId:"other",gross:p(120)}]},
   {...base,explicit:[{lineId:"catch",gross:p(60)},{lineId:"catch",gross:p(60)}]},
   {...base,lines:[line("catch",100,120,120,after)],explicit:[{lineId:"catch",gross:p(120)}]},
   {...base,lines:[...base.lines,...base.lines]}, {...base,lines:[line("catch",121,120)]},
   {...base,receiptGross:p(-1)}, {...base,lines:[line("catch",100,120,-1)]},
  ]) expect(()=>allocateReceiptToLines(raw)).toThrow("INVALID_ALLOCATION");
  expect(allocateReceiptToLines(input(0,[]))).toEqual([]);
 });
});
