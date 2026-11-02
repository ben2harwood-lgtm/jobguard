import {expect,it} from "vitest";
import {successFeeResultV1,successFeeStatementV1} from "./success-fee-posting.js";
const id="10000000-0000-4000-8000-000000000001";
const statement={version:"success-fee-statement.v1",jobId:id,policyVersion:"reference_fee_policy_v3",roundingPolicy:"commercial_half_even.v1",
 qualifyingPrincipal:{numerator:"80000",denominator:"1"},feePence:8000,priorPence:0,deltaPence:8000,expectedPostingRevision:0,
 sources:[{assessmentId:id,sourceHash:"a".repeat(64),reviewAuthorizationId:id,allocationIds:[id]}],
 environment:"synthetic_demo",productionEnabled:false,realExternalActions:0};
it("F13 preserves Q GBP800 -> GBP80 and requires source-backed statement fields",()=>{
 expect(successFeeStatementV1.parse(statement)).toEqual(statement);
 for(const patch of [{sources:[]},{feePence:8001},{deltaPence:7999},{priorPence:1},{productionEnabled:true},{base:0}])
  expect(successFeeStatementV1.safeParse({...statement,...patch}).success).toBe(false);
});
it.each([["149","10",1],["150","10",2],["250","10",2],["350","10",4]])("rounds exact cumulative %s/%s only once",(numerator,denominator,fee)=>{
 expect(successFeeStatementV1.safeParse({...statement,qualifyingPrincipal:{numerator,denominator},feePence:fee,deltaPence:fee}).success).toBe(true);
});
it("unlinked negative delta stays refused, and zero records a derivation without a journal",()=>{
 expect(successFeeStatementV1.safeParse({...statement,priorPence:8001,deltaPence:0}).success).toBe(false);
 const result={version:"success-fee-result.v1",jobId:id,commandId:id,action:"approve",reviewId:id,statementHash:"a".repeat(64),
  statement:{...statement,priorPence:8000,deltaPence:0},derivationId:id,journalId:null,postingRevision:1,replayed:false,
  environment:"synthetic_demo",productionEnabled:false,realExternalActions:0};
 expect(successFeeResultV1.safeParse(result).success).toBe(true);
 for(const patch of [{journalId:id},{derivationId:null},{postingRevision:0}])expect(successFeeResultV1.safeParse({...result,...patch}).success).toBe(false);
});
it("F10/F11 accepts source-backed case statements and signed linked compensation",()=>{
 const source={caseId:id,recoveryAllocationId:id,sourceHash:"b".repeat(64),reviewAuthorizationId:id};
 for(const [q,prior,delta] of [[32000,0,3200],[282000,3200,25000],[282000,28200,0]] as const)
  expect(successFeeStatementV1.safeParse({...statement,sources:[source],qualifyingPrincipal:{numerator:String(q),denominator:"1"},feePence:q/10,priorPence:prior,deltaPence:delta}).success).toBe(true);
 const compensation={...statement,sources:[source],qualifyingPrincipal:{numerator:"32000",denominator:"1"},feePence:3200,priorPence:28200,deltaPence:-25000,
  compensationLinks:[{journalId:id,amountPence:25000}]};
 expect(successFeeStatementV1.safeParse(compensation).success).toBe(true);
 for(const patch of [{compensationLinks:undefined},{compensationLinks:[{journalId:id,amountPence:24999}]},
  {compensationLinks:[{journalId:id,amountPence:12500},{journalId:id,amountPence:12500}]},
  {sources:[{...source,assessmentId:id}]},{base:0},{cap:0},{credit:0}])
  expect(successFeeStatementV1.safeParse({...compensation,...patch}).success).toBe(false);
 const result={version:"success-fee-result.v1",jobId:id,commandId:id,action:"approve",reviewId:id,statementHash:"a".repeat(64),statement:compensation,
  derivationId:id,journalId:id,postingRevision:1,replayed:false,environment:"synthetic_demo",productionEnabled:false,realExternalActions:0};
 expect(successFeeResultV1.safeParse(result).success).toBe(true);
 expect(successFeeResultV1.safeParse({...result,journalId:null}).success).toBe(false);
});
it("accepts an exact negative statement only with a compensation identity and a posted journal",()=>{
 const reversed={...statement,qualifyingPrincipal:{numerator:"0",denominator:"1"},feePence:0,priorPence:8000,deltaPence:-8000,compensatesDerivationId:id,compensations:[{journalId:id,derivationId:id,amountPence:8000}]};
 expect(successFeeStatementV1.safeParse(reversed).success).toBe(true);
 expect(successFeeStatementV1.safeParse({...reversed,compensatesDerivationId:undefined}).success).toBe(false);
 expect(successFeeStatementV1.safeParse({...reversed,deltaPence:-7999}).success).toBe(false);
 expect(successFeeStatementV1.safeParse({...statement,compensatesDerivationId:id}).success).toBe(false);
 const result={version:"success-fee-result.v1",jobId:id,commandId:id,action:"approve",reviewId:id,statementHash:"a".repeat(64),statement:reversed,
  derivationId:id,journalId:id,postingRevision:1,replayed:false,environment:"synthetic_demo",productionEnabled:false,realExternalActions:0};
 expect(successFeeResultV1.safeParse(result).success).toBe(true);
 expect(successFeeResultV1.safeParse({...result,journalId:null}).success).toBe(false);
});

it("split compensation preserves exact totals and refuses missing, duplicate or mismatched links",()=>{
 const other="10000000-0000-4000-8000-000000000002";
 const compensations=[{journalId:id,derivationId:id,amountPence:3000},{journalId:other,derivationId:other,amountPence:5000}];
 const reversed={...statement,qualifyingPrincipal:{numerator:"0",denominator:"1"},feePence:0,priorPence:8000,deltaPence:-8000,compensatesDerivationId:id,compensations};
 expect(successFeeStatementV1.parse(reversed)).toEqual(reversed);
 for(const patch of [{compensatesDerivationId:other},{compensations:undefined},{compensations:[]},
  {compensations:[compensations[0]]},{compensations:[compensations[0],{...compensations[1],journalId:id}]},
  {compensations:[compensations[0],{...compensations[1],amountPence:5001}]}])
  expect(successFeeStatementV1.safeParse({...reversed,...patch}).success).toBe(false);
 expect(successFeeStatementV1.safeParse({...statement,compensations}).success).toBe(false);
});

it("retains both compensation formats only when their journal identities and exact amounts agree",()=>{
 const reversed={...statement,qualifyingPrincipal:{numerator:"0",denominator:"1"},feePence:0,priorPence:8000,deltaPence:-8000,
  compensatesDerivationId:id,compensations:[{journalId:id,derivationId:id,amountPence:8000}],compensationLinks:[{journalId:id,amountPence:8000}]};
 expect(successFeeStatementV1.parse(reversed)).toEqual(reversed);
 const other="10000000-0000-4000-8000-000000000002";
 for(const compensationLinks of [[{journalId:other,amountPence:8000}],[{journalId:id,amountPence:7999}],
  [{journalId:id,amountPence:4000},{journalId:other,amountPence:4000}]])
  expect(successFeeStatementV1.safeParse({...reversed,compensationLinks}).success).toBe(false);
});
