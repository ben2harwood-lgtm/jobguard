import { describe, expect, it } from "vitest";
import { sha256 } from "./evidence-pack.js";
import { evaluateRecoveryEligibilityV3, recoveryEligibilityCommandV3, recoveryEligibilityFactsV3, recoveryEligibilityViewV3, RECOVERY_NOT_COUNTED_WORDING_V1 } from "./recovery-eligibility-v3.js";
import { assertRecoverySources, recoveryCaseTypeV1 } from "./recovery-case.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const facts = (fixture: string, changes: Record<string,unknown> = {}) => ({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:id(1),jobId:id(2),caseId:id(3),fixture,payer:"not_insurer",settlement:"settled",paymentTiming:"after_opening",sourceRef:id(4),...changes});
describe("CH-7 D03 v3 candidate reviews", () => {
 it("B1 accepts the additive supplier case category and source split",()=>{
  expect(recoveryCaseTypeV1.parse("duplicate_supplier_payment")).toBe("duplicate_supplier_payment");
  expect(()=>assertRecoverySources({caseType:"duplicate_supplier_payment",book:"supplier_cost",sourceType:"supplier_documents",sourceRefs:["Supplier invoice INV-320"]})).not.toThrow();
  expect(()=>assertRecoverySources({caseType:"duplicate_supplier_payment",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:["Generated customer invoice INV-18800"]})).toThrow();
 });
 it.each([
  ["F14",30000,null,false],["F15",0,"Credit note below the £250 minimum",false],
  ["F16-partial",0,"Credit note used against an invoice not yet paid in full",false],
  ["F16-full",30000,null,false],["F17",45000,null,false],["F18",262000,"Fixed statutory compensation is not part of the fee base",false],
  ["F19",250000,"Fixed statutory compensation is not part of the fee base",false],["F20",0,"Paid before you opened this case",false],
  ["F21",0,RECOVERY_NOT_COUNTED_WORDING_V1.unpaidBillReduced,false],["F22",0,"Prevented spending is not recovered cash",true],
 ] as const)("DW1 %s exact candidate Q and available reason",(fixture,q,reason,terminal)=>{
  const result=evaluateRecoveryEligibilityV3(facts(fixture));
  expect(result).toMatchObject({qualifyingPrincipal:{pence:q,currency:"GBP"},reason,terminal,productionEnabled:false});
  expect(result.outcome).toBe(q>0?"eligible_for_review":"excluded");
  expect(result).not.toHaveProperty("fee");
 });
 it.each(["F18","F19"])("B3 %s compensation never contributes and debtor is server fixture data",fixture=>{
  const r=evaluateRecoveryEligibilityV3(facts(fixture));
  expect(r.lines.find(l=>l.kind==="fixed_compensation")).toMatchObject({qualifyingPrincipal:{pence:0},reason:"Fixed statutory compensation is not part of the fee base"});
  expect(r.lines.find(l=>l.kind==="statutory_interest")?.qualifyingPrincipal.pence).toBe(fixture==="F18"?12000:0);
  expect(r.lines.every(l=>l.debtorType===(fixture==="F19"?"individual":"business"))).toBe(true);
 });
 it.each(["F17","F18","F19"])("excludes %s without settled proof",fixture=>{
  expect(evaluateRecoveryEligibilityV3(facts(fixture,{settlement:"pending"}))).toMatchObject({qualifyingPrincipal:{pence:0},reason:"Pending money cannot qualify"});
 });
 it.each(["F14","F16-full"])("never labels %s's later invoice fully paid without settled proof",fixture=>{
  for(const settlement of ["pending","unverified"])expect(evaluateRecoveryEligibilityV3(facts(fixture,{settlement})).qualifyingPrincipal.pence).toBe(0);
 });
 it("uses immutable server timing, never the date a review was requested",()=>{
  expect(evaluateRecoveryEligibilityV3(facts("F18",{paymentTiming:"before_opening"}))).toMatchObject({qualifyingPrincipal:{pence:0},reason:"Paid before you opened this case"});
 });
 it("F21 excludes an unpaid-bill reduction with the approved reason",()=>{
  expect(evaluateRecoveryEligibilityV3(facts("F21",{settlement:"pending"}))).toMatchObject({qualifyingPrincipal:{pence:0},reason:RECOVERY_NOT_COUNTED_WORDING_V1.unpaidBillReduced,reasonHeld:false,lines:[{reason:RECOVERY_NOT_COUNTED_WORDING_V1.unpaidBillReduced,reasonHeld:false}]});
 });
 it("strict versioned boundaries refuse injected money, debtor, category and authority",()=>{
  const command={version:"recovery-eligibility-command.v3",action:"review",commandId:id(5),caseId:id(3),expectedCaseRevision:2,expectedReviewRevision:0,fixture:"F18"};
  expect(recoveryEligibilityCommandV3.parse(command)).toEqual(command);
  for(const [key,value] of Object.entries({tenantId:id(1),category:"prevention",debtorType:"business",settlement:"settled",qualifyingPrincipal:262000,termsStatus:"approved",environment:"synthetic_demo"})) expect(recoveryEligibilityCommandV3.safeParse({...command,[key]:value}).success).toBe(false);
  expect(recoveryEligibilityFactsV3.safeParse(facts("F18",{environment:"production"})).success).toBe(false);
  expect(()=>evaluateRecoveryEligibilityV3(facts("insurer"))).toThrow();
 });
 it("rejects unrecognized fields throughout the stored v3 result",()=>{
  const result=evaluateRecoveryEligibilityV3(facts("F18"));
  expect(recoveryEligibilityViewV3.safeParse({...result,termsStatus:"approved"}).success).toBe(false);
  expect(recoveryEligibilityViewV3.safeParse({...result,lines:result.lines.map(line=>({...line,settlement:"settled"}))}).success).toBe(false);
  expect(recoveryEligibilityViewV3.safeParse({...result,lines:result.lines.map(line=>({...line,qualifyingPrincipal:{...line.qualifyingPrincipal,fee:1}}))}).success).toBe(false);
 });
});

describe("CH-7-F17-BEFORE-OPEN timing parity",()=>{
 it.each(["settled","pending"])("F17 excludes a refund originally settled at or before opening, including %s proof",settlement=>{
  const result=evaluateRecoveryEligibilityV3(facts("F17",{paymentTiming:"before_opening",settlement}));
  expect(result).toMatchObject({outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Paid before you opened this case",lines:[{netPence:45000,qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Paid before you opened this case"}]});
 });
});


describe("CH-7-INSURER independent F19 wording",()=>{
 const individual="Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.";
 it("[B1 B2 DB16] F19 exact words and hash preserve principal and compensation header",()=>{
  expect(individual).toHaveLength(173);expect(sha256(individual)).toBe("fb24c95b4190d5b342b52302d5f5e18734f6b75a06b1c943de313359fa07a72f");
  const result=evaluateRecoveryEligibilityV3(facts("F19"));
  expect(result).toMatchObject({qualifyingPrincipal:{pence:250000},reason:"Fixed statutory compensation is not part of the fee base",reasonHeld:false});
  expect(result.lines.find(l=>l.kind==="statutory_interest")).toMatchObject({reason:individual,reasonHeld:false,qualifyingPrincipal:{pence:0}});
 });
 it("[B2 DB16] F19 pending explains interest while preserving its pending header",()=>{
  const result=evaluateRecoveryEligibilityV3(facts("F19",{settlement:"pending"}));
  expect(result.reason).toBe("Pending money cannot qualify");expect(result.lines.find(l=>l.kind==="statutory_interest")?.reason).toBe(individual);
 });
 it("[B2] paid-before covers every F19 line and F18 interest is unchanged",()=>{
  expect(evaluateRecoveryEligibilityV3(facts("F19",{paymentTiming:"before_opening"})).lines.every(l=>l.reason==="Paid before you opened this case")).toBe(true);
  expect(evaluateRecoveryEligibilityV3(facts("F18")).lines.find(l=>l.kind==="statutory_interest")).toMatchObject({reason:null,qualifyingPrincipal:{pence:12000}});
 });
 it("[B2 DB18] legacy F19 null interest and held reasons remain readable",()=>{
  const result=evaluateRecoveryEligibilityV3(facts("F19")),legacy={...result,reasonHeld:true,lines:result.lines.map(l=>({...l,reason:l.kind==="statutory_interest"?null:l.reason,reasonHeld:l.kind==="statutory_interest"}))};
  expect(recoveryEligibilityViewV3.parse(legacy)).toEqual(legacy);
 });
});

it("[B1] approved constants have the exact independent UTF-8 hashes for F21 activation",()=>{
 expect(RECOVERY_NOT_COUNTED_WORDING_V1.individualInterest).toHaveLength(173);
 expect(sha256(RECOVERY_NOT_COUNTED_WORDING_V1.individualInterest)).toBe("fb24c95b4190d5b342b52302d5f5e18734f6b75a06b1c943de313359fa07a72f");
 expect(RECOVERY_NOT_COUNTED_WORDING_V1.unpaidBillReduced).toHaveLength(163);
 expect(sha256(RECOVERY_NOT_COUNTED_WORDING_V1.unpaidBillReduced)).toBe("44e291a1874a9c230b704f972df2a547fcb4d67256d1c0f69114682decaf0e21");
 expect(evaluateRecoveryEligibilityV3(facts("F21"))).toMatchObject({reason:RECOVERY_NOT_COUNTED_WORDING_V1.unpaidBillReduced,reasonHeld:false});
});


describe("CH-7-INSURER Round 2 payer fact",()=>{
 it("[A6] requires an explicit server payer fact and refuses unknown payer values",()=>{
  const {payer:_payer,...missing}=facts("F18");
  expect(recoveryEligibilityFactsV3.safeParse(missing).success).toBe(false);
  expect(()=>evaluateRecoveryEligibilityV3(missing)).toThrow("INVALID_COMMAND");
  for(const payer of [null,"insurer","customer_cash"])expect(()=>evaluateRecoveryEligibilityV3(facts("F18",{payer}))).toThrow("INVALID_COMMAND");
 });
 it.each(["F18","F19"])("[A1 A6 DB1] %s insurer fact has its own exclusion reason on every component",fixture=>{
  const r=evaluateRecoveryEligibilityV3(facts(fixture,{payer:"insurer_unmarked"}));
  expect(r).toMatchObject({outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Insurer proceeds never qualify",reasonHeld:false,productionEnabled:false});
  expect(r.lines).toHaveLength(3);
  for(const line of r.lines)expect(line).toMatchObject({qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Insurer proceeds never qualify",reasonHeld:false});
 });
 it.each(["not_insurer","insurer_customer_own"])("[A6 DB2 DB3] %s retains F18/F19 exact figures and reasons",payer=>{
  expect(evaluateRecoveryEligibilityV3(facts("F18",{payer}))).toMatchObject({qualifyingPrincipal:{pence:262000},reason:"Fixed statutory compensation is not part of the fee base"});
  expect(evaluateRecoveryEligibilityV3(facts("F19",{payer}))).toMatchObject({qualifyingPrincipal:{pence:250000},reason:"Fixed statutory compensation is not part of the fee base"});
 });
 it.each(["F18","F19","F20"])("[A1 DB7] %s paid-before wins over insurer money on every line",fixture=>{
  for(const payer of ["insurer_unmarked","insurer_customer_own"]){
   const r=evaluateRecoveryEligibilityV3(facts(fixture,{payer,paymentTiming:"before_opening"}));
   expect(r).toMatchObject({qualifyingPrincipal:{pence:0},reason:"Paid before you opened this case"});
   expect(r.lines.every(l=>l.reason==="Paid before you opened this case")).toBe(true);
  }
 });
 it.each(["pending","unverified"])("[A1 DB8] insurer exclusion precedes %s proof",settlement=>{
  const r=evaluateRecoveryEligibilityV3(facts("F19",{payer:"insurer_unmarked",settlement}));
  expect(r.reason).toBe("Insurer proceeds never qualify");expect(r.lines.every(l=>l.reason===r.reason&&l.qualifyingPrincipal.pence===0)).toBe(true);
 });
 it.each(["F15","F17","F21","F22"])("[A1 DB9 Round2] insurer payer leaves %s including F21 reasons and held flags untouched",fixture=>{
  expect(evaluateRecoveryEligibilityV3(facts(fixture,{payer:"insurer_unmarked"}))).toEqual(evaluateRecoveryEligibilityV3(facts(fixture)));
 });
});

const approvedF21="Your supplier reduced a bill you hadn’t paid yet. That’s a saving, not money back in your account, so it isn’t counted as recovered money and there’s no fee on it.";
it("F21ApprovedReasonHeaderAndLine",()=>{
 expect(approvedF21).toHaveLength(163);
 expect(sha256(approvedF21)).toBe("44e291a1874a9c230b704f972df2a547fcb4d67256d1c0f69114682decaf0e21");
 for(const settlement of ["settled","pending","unverified"])for(const payer of ["not_insurer","insurer_unmarked","insurer_customer_own"])for(const paymentTiming of ["before_opening","after_opening"]){
  expect(evaluateRecoveryEligibilityV3(facts("F21",{settlement,payer,paymentTiming}))).toEqual({
   version:"recovery-eligibility-review.v3",policyVersion:"reference_recovery_eligibility_policy_v3",fixture:"F21",outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason:approvedF21,reasonHeld:false,terminal:false,productionEnabled:false,
   lines:[{kind:"principal",debtorType:"business",netPence:9000,qualifyingPrincipal:{pence:0,currency:"GBP"},reason:approvedF21,reasonHeld:false}]
  });
 }
});
it("LegacyF21ResultStillParses",()=>{
 // Explicit historical wire result, independent of the current evaluator.
 const legacy={version:"recovery-eligibility-review.v3",policyVersion:"reference_recovery_eligibility_policy_v3",fixture:"F21",outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason:null,reasonHeld:true,terminal:false,productionEnabled:false,
  lines:[{kind:"principal",debtorType:"business",netPence:9000,qualifyingPrincipal:{pence:0,currency:"GBP"},reason:null,reasonHeld:true}]};
 expect(recoveryEligibilityViewV3.parse(legacy)).toEqual(legacy);
});
