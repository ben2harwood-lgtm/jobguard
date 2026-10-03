import { describe, expect, it } from "vitest";
import { classifyReferenceD03, recoveryEligibilityCommandV1 } from "./recovery-eligibility.js";
describe("reference D03 recovery eligibility",()=>{
 it("classifies the evidence-backed claim without creating cash",()=>expect(classifyReferenceD03("evidence_backed_withheld_payment",32000)).toEqual({classification:"eligible_for_review",eligibleNetPence:32000,reason:"Synthetic scenario cites evidence attributing customer money to this claim; settlement is not verified"}));
 it.each([["pending_money","Pending money cannot qualify"],["manual_payment","A manual payment record is not settlement evidence"],["prevented_spending","Prevented spending is not recovered cash"],["supplier_credit","Supplier credits are excluded by this reference policy"],["wrong_attribution","This payment is not attributed to this recovery case"],["already_allocated","This movement is already allocated"]] as const)("excludes %s",(scenario,reason)=>expect(classifyReferenceD03(scenario,32000)).toMatchObject({classification:"excluded",eligibleNetPence:null,reason}));
 it.each(["unknown_basis","unknown_causation"] as const)("holds %s for review",scenario=>expect(classifyReferenceD03(scenario,32000).classification).toBe("pending_review"));
});

describe("eligibility command revisions",()=>{
 const base={version:"recovery-eligibility-command.v1",commandId:"3f2c1b7a-6a1e-4c7e-9c1a-0a1b2c3d4e5f",caseId:"9b1d6f0e-2c7a-4a43-8f5e-1d2e3f4a5b6c"};
 // Superseding the policy bumps its recorded revision, so the commands that follow (a fresh review and the approval) must be able to carry it.
 it("accepts a later policy revision in review and approve commands",()=>{
  expect(()=>recoveryEligibilityCommandV1.parse({...base,action:"review",scenario:"evidence_backed_withheld_payment",expectedCaseRevision:2,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:2})).not.toThrow();
  expect(()=>recoveryEligibilityCommandV1.parse({...base,action:"approve",expectedCaseRevision:2,expectedEvidenceRevision:1,expectedPolicyRevision:2,expectedReviewRevision:3})).not.toThrow();
 });
 it("still pins the policy version, requires positive integer revisions and rejects forged eligibility fields",()=>{
  expect(()=>recoveryEligibilityCommandV1.parse({...base,action:"review",scenario:"evidence_backed_withheld_payment",expectedCaseRevision:2,evidenceRevision:1,policyVersion:"reference-d03.v2",policyRevision:1})).toThrow();
  for(const policyRevision of [0,-1,1.5])expect(()=>recoveryEligibilityCommandV1.parse({...base,action:"approve",expectedCaseRevision:2,expectedEvidenceRevision:1,expectedPolicyRevision:policyRevision,expectedReviewRevision:1})).toThrow();
  expect(()=>recoveryEligibilityCommandV1.parse({...base,action:"approve",expectedCaseRevision:2,expectedEvidenceRevision:1,expectedPolicyRevision:1,expectedReviewRevision:1,eligible:true})).toThrow();
 });
});
