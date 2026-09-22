import { describe,expect,it } from "vitest";
import { evaluateBillDiscrepancy,evaluateComparableBill } from "./discrepancy.js";
const base={version:"discrepancy-input.v1" as const,ruleRevision:"supplier-overcharge.v1",sourceDocumentId:"10000000-0000-4000-8000-000000000001",sourceVersionId:"10000000-0000-4000-8000-000000000002",matchRevisionId:"10000000-0000-4000-8000-000000000003",confirmed:true as const,matched:true as const,orderedQuantity:10,acceptedQuantity:8,billedQuantity:10,orderedUnitPricePence:2000,billedUnitPricePence:2500};
describe("discrepancy rule v1",()=>{
 it("separates price and quantity without overlap",()=>expect(evaluateBillDiscrepancy(base)).toMatchObject({kind:"actionable",pricePence:5000,quantityPence:4000,totalPence:9000}));
 it("derives 320 pounds instead of returning canned output",()=>expect(evaluateBillDiscrepancy({...base,orderedQuantity:40,acceptedQuantity:40,billedQuantity:40,billedUnitPricePence:2800}).totalPence).toBe(32000));
 it("only reports none for comparable confirmed facts",()=>{const{confirmed:_,...unknown}=base;expect(evaluateComparableBill(unknown)).toEqual({kind:"insufficient"});expect(evaluateComparableBill({...base,billedUnitPricePence:2000,acceptedQuantity:10}).kind).toBe("none")});
 it("enforces the public money magnitude",()=>expect(()=>evaluateBillDiscrepancy({...base,billedQuantity:1_000_000,billedUnitPricePence:1_000_000_000_000})).toThrow("MONEY_MAGNITUDE_EXCEEDED"));
});
