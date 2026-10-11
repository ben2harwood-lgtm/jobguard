import { describe, expect, it } from "vitest";
import { evaluateRecoveryEligibilityV3, recoveryEligibilityCommandV3, recoveryEligibilityFactsV3, recoveryEligibilityViewV3 } from "./recovery-eligibility-v3.js";
import { assertRecoverySources, recoveryCaseTypeV1 } from "./recovery-case.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const facts = (fixture: string, changes: Record<string,unknown> = {}) => ({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:id(1),jobId:id(2),caseId:id(3),fixture,settlement:"settled",paymentTiming:"after_opening",sourceRef:id(4),...changes});
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
  ["F21",0,null,false],["F22",0,"Prevented spending is not recovered cash",true],
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
 it("F21 excludes an unpaid-bill reduction without substituting a held reason",()=>{
  expect(evaluateRecoveryEligibilityV3(facts("F21",{settlement:"pending"}))).toMatchObject({qualifyingPrincipal:{pence:0},reason:null,reasonHeld:true,lines:[{reason:null,reasonHeld:true}]});
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
