import { describe, expect, it } from "vitest";
import { evaluateRecoveryEligibilityV3, recoveryEligibilityCommandV3 } from "./recovery-eligibility-v3.js";
const id="10000000-0000-4000-8000-000000000001";
const note="This came in before your fee terms were agreed, so it isn't counted as recovered money and there's no fee on it.";
const facts=(termsTiming="before_settlement",extra:Record<string,unknown>={})=>({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:id,jobId:id,caseId:id,fixture:"F18",payer:"not_insurer",settlement:"settled",paymentTiming:"after_opening",sourceRef:id,termsTiming,...extra});
describe("DW3 decision 123",()=>{
 it("ReceiptBeforeTermsNeverRescued",()=>{
  for(let review=0;review<3;review++){
   const r=evaluateRecoveryEligibilityV3(facts("after_settlement"));
   expect(r).toMatchObject({outcome:"excluded",qualifyingPrincipal:{pence:0},reason:note,reasonHeld:false});
   expect(r.lines.every(l=>l.qualifyingPrincipal.pence===0)).toBe(true);
   expect(r.lines[0]?.reason).toBe(note);
  }
 });
 it("SeparateInterestUsesOwnSettlementTime",()=>{
  const principal=evaluateRecoveryEligibilityV3(facts());
  const interest=evaluateRecoveryEligibilityV3(facts("after_settlement"));
  expect(principal.qualifyingPrincipal.pence).toBe(262000);
  expect(principal.lines[0]?.qualifyingPrincipal.pence).toBe(250000);
  expect(interest.lines[1]).toMatchObject({qualifyingPrincipal:{pence:0},reason:note});
  expect(principal.lines[2]?.qualifyingPrincipal.pence).toBe(0);
 });
 it("missing approval never qualifies; unresolved timing cannot become a fact",()=>{
  for(const termsTiming of [undefined,null,"missing","equal",true])expect(()=>evaluateRecoveryEligibilityV3({...facts(),termsTiming})).toThrow();
 });
 it("ForgedTermsTimingRefused",()=>{
  const command={version:"recovery-eligibility-command.v3",action:"review",commandId:id,caseId:id,expectedCaseRevision:1,expectedReviewRevision:0,fixture:"F18"};
  for(const extra of [{termsTiming:"before_settlement"},{feeTermsApprovedBeforePursuit:true},{approvedAt:"2026-01-01"},{termsApprovalId:id}]){
   expect(recoveryEligibilityCommandV3.safeParse({...command,...extra}).success).toBe(false);
   if(!("termsTiming" in extra))expect(()=>evaluateRecoveryEligibilityV3({...facts(),...extra})).toThrow();
  }
 });
 it("keeps earlier, insurer, component and pending explanations",()=>{
  expect(evaluateRecoveryEligibilityV3(facts("after_settlement",{paymentTiming:"before_opening"})).reason).toBe("Paid before you opened this case");
  expect(evaluateRecoveryEligibilityV3(facts("after_settlement",{payer:"insurer_unmarked"})).reason).toBe("Insurer proceeds never qualify");
  expect(evaluateRecoveryEligibilityV3(facts("after_settlement",{settlement:"pending"})).reason).toBe("Pending money cannot qualify");
 });
});
