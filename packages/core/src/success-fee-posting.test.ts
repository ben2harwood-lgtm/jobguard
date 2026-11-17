import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import { calculateSuccessFeeProposal, parseSuccessFeeCommand, successFeeAvailabilityV1, successFeeProposalInputV1 } from "./success-fee-posting.js";
const id="10000000-0000-4000-8000-000000000001";
const review={version:"success-fee-command.v1",action:"review",commandId:id,expectedPostingRevision:0};
const approval={...review,action:"approve",reviewId:id,statementHash:"a".repeat(64)};
const input={version:"success-fee-proposal.v1",environment:"synthetic_reference",qualifyingPrincipal:{numerator:"80000",denominator:"1"},priorPostedPrincipalPence:0,compensatesDerivationId:null};
describe("M4-9-S proposal boundaries (arithmetic never authority)",()=>{
 it("accepts only review and exact statement approval intents",()=>{expect(parseSuccessFeeCommand(review)).toEqual(review);expect(parseSuccessFeeCommand(approval)).toEqual(approval);});
 it.each(["tenantId","actorMembershipId","environment","rate","Q","J","qualifies","approval","base","cap","credit","currency"])("refuses caller authority field %s",field=>{expect(()=>parseSuccessFeeCommand({...review,[field]:true})).toThrow("INVALID_SUCCESS_FEE_COMMAND");expect(()=>parseSuccessFeeCommand({...approval,[field]:true})).toThrow("INVALID_SUCCESS_FEE_COMMAND");});
 it.each([null,{}, {...review,commandId:"bad"},{...review,expectedPostingRevision:-1},{...review,expectedPostingRevision:0.5},{...review,expectedPostingRevision:Number.MAX_SAFE_INTEGER+1},{...approval,reviewId:"bad"},{...approval,statementHash:"A".repeat(64)},{...approval,statementHash:"a".repeat(63)},{...review,action:"reassess"},{...review,action:"compensate"}])("rejects malformed intent %#",raw=>expect(()=>parseSuccessFeeCommand(raw)).toThrow("INVALID_SUCCESS_FEE_COMMAND"));
 it.each([
  {...input,qualifyingPrincipal:{numerator:"-1",denominator:"1"}},
  {...input,qualifyingPrincipal:{numerator:"1",denominator:"0"}},
  {...input,qualifyingPrincipal:{numerator:"01",denominator:"1"}},
  {...input,qualifyingPrincipal:{numerator:"1.1",denominator:"1"}},
  {...input,qualifyingPrincipal:{numerator:String(BigInt(MAX_MONEY_PENCE)+1n),denominator:"1"}},
  {...input,qualifyingPrincipal:{numerator:"1",denominator:"1",qualifies:true}},
  {...input,priorPostedPrincipalPence:-1},{...input,priorPostedPrincipalPence:MAX_MONEY_PENCE+1},
  {...input,environment:"production_billing"},{...input,rate:"1/2"},{...input,policyVersion:"reference_fee_policy_v1"},{...input,currency:"USD"},
 ])("refuses invalid proposal %#",raw=>expect(()=>calculateSuccessFeeProposal(raw)).toThrow());
 it("proposal schema rejects bounds before invoking the shared kernel",()=>{
  for(const prior of [-1,0.5,MAX_MONEY_PENCE+1,Number.MAX_SAFE_INTEGER+1])expect(successFeeProposalInputV1.safeParse({...input,priorPostedPrincipalPence:prior}).success).toBe(false);
 });
 it("rounds only after applying 10% to fractional Q (149/10 p gives 1 p)",()=>{
  const out=calculateSuccessFeeProposal({...input,qualifyingPrincipal:{numerator:"149",denominator:"10"}});
  expect(out.qualifyingPrincipal).toEqual({numerator:"149",denominator:"10"});
  expect(out.successFeePrincipal).toEqual({pence:1,currency:"GBP"});
  expect(out.postingDelta).toEqual({pence:1,currency:"GBP"});
 });
 it("requires a prior derivation link for a negative calculation",()=>{expect(()=>calculateSuccessFeeProposal({...input,priorPostedPrincipalPence:9000})).toThrow("COMPENSATION_LINK_REQUIRED");});
 it("allows exact bounded arithmetic and returns no execution authority",()=>{
  const out=calculateSuccessFeeProposal({...input,qualifyingPrincipal:{numerator:String(MAX_MONEY_PENCE),denominator:"1"}});
  expect(out.productionEnabled).toBe(false);expect(out.proposed).toBe(true);expect(out.realExternalActions).toBe(0);
  for(const key of ["base","cap","credit","creditUsed","subscriptionOffset"])expect(out).not.toHaveProperty(key);
 });
 it("exposes a strict dependency status without shadow counts or money",()=>{
  const status={version:"success-fee-availability.v1",jobId:id,environment:"synthetic_demo",state:"dependency_bound",dependency:"accepted_attribution_source_adapter",productionEnabled:false,realExternalActions:0};
  expect(successFeeAvailabilityV1.parse(status)).toEqual(status);
  for(const extra of [{Q:"0"},{count:0},{statementHash:"a".repeat(64)},{productionEnabled:true}])expect(successFeeAvailabilityV1.safeParse({...status,...extra}).success).toBe(false);
 });
});
