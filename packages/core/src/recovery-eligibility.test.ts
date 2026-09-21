import { describe, expect, it } from "vitest";
import { classifyReferenceD03 } from "./recovery-eligibility.js";
describe("reference D03 recovery eligibility",()=>{
 it("classifies the evidence-backed claim without creating cash",()=>expect(classifyReferenceD03("evidence_backed_withheld_payment",32000)).toEqual({classification:"eligible_for_review",eligibleNetPence:32000,reason:"Verified evidence attributes settled customer money to this claim"}));
 it.each([["pending_money","Pending money cannot qualify"],["manual_payment","A manual payment record is not settlement evidence"],["prevented_spending","Prevented spending is not recovered cash"],["supplier_credit","Supplier credits are excluded by this reference policy"],["wrong_attribution","This payment is not attributed to this recovery case"],["already_allocated","This movement is already allocated"]] as const)("excludes %s",(scenario,reason)=>expect(classifyReferenceD03(scenario,32000)).toMatchObject({classification:"excluded",eligibleNetPence:null,reason}));
 it.each(["unknown_basis","unknown_causation"] as const)("holds %s for review",scenario=>expect(classifyReferenceD03(scenario,32000).classification).toBe("pending_review"));
});
