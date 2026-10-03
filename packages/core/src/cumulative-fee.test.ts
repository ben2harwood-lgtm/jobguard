import { describe, expect, it } from "vitest";
import { addExactPence, calculateCumulativeFee, exactPence, serializeExactPence, type ExactPence } from "./cumulative-fee.js";
import { MAX_MONEY_PENCE, money } from "./money.js";
import { allocateMoney } from "./allocation.js";
const link = "10000000-0000-4000-8000-000000000001";
const fee = (q: number | ExactPence, prior = 0, version = "reference_fee_policy_v3", rate = "10") => calculateCumulativeFee({
  version: "cumulative-fee.v1", rate: { version: "fee-rate.v1", policyVersion: version, numerator: rate, denominator: "100" },
  cumulativeQualifyingPrincipal: serializeExactPence(typeof q === "number" ? exactPence(BigInt(q)) : q),
  priorPolicyVersion: version, priorNetPostedPence: prior, compensatesDerivationId: link,
});
describe("shared cumulative fee, commercial half-even v1", () => {
  // These inputs have ALREADY passed the category/origin/proof gates owned by later tasks.
  it.each([
    ["F1",80000,0,8000,8000], ["F2 first",40000,0,4000,4000], ["F2 rest",80000,4000,8000,4000],
    ["F3",60000,8000,6000,-2000], ["F4",exactPence(2000000n,43n),0,4651,4651], ["F4b",80000,4651,8000,3349],
    ["F5",40000,0,4000,4000], ["F6",0,0,0,0], ["F7",80000,0,8000,8000], ["F8",0,0,0,0],
    ["F9 5p",5,0,0,0], ["F9 15p",15,0,2,2], ["F9 25p",25,0,2,2], ["F9 split",10,0,1,1],
    ["F10 first",32000,0,3200,3200], ["F10 rest",282000,3200,28200,25000], ["F11",32000,28200,3200,-25000],
    ["F12",0,0,0,0], ["F13",80000,0,8000,8000], ["F14",30000,0,3000,3000], ["F15",0,0,0,0],
    ["F16 partial",0,0,0,0], ["F16 full",30000,0,3000,3000], ["F17",45000,0,4500,4500],
    ["F18",262000,0,26200,26200], ["F19",250000,0,25000,25000], ["F20",0,0,0,0], ["F21",0,0,0,0],
    ["F22",0,0,0,0], ["F23",80000,0,8000,8000],
  ] as const)("reproduces §10.3 %s principal/fee/delta", (_id,q,prior,total,delta) => {
    const result = fee(q,prior); expect(result.cumulativeFee.pence).toBe(total); expect(result.postingDelta.pence).toBe(delta);
    expect(result.compensatesDerivationId).toBe(delta < 0 ? link : null);
    expect(result).not.toHaveProperty("creditUsed");
  });
  it.each([
    ["ENT-F1",15000,0,1500,1500], ["ENT-F2 first",exactPence(250000n,31n),0,806,806], ["ENT-F2 rest",24000,806,2400,1594],
    ["ENT-F3",10000,1500,1000,-500], ["ENT-F4",0,1500,0,-1500], ["ENT-F5",15000,0,1500,1500],
    ["ENT-F6",12000,0,1200,1200], ["ENT-F7",15000,0,1500,1500], ["ENT-F8",0,0,0,0],
    ["ENT-F10",15,0,2,2], ["ENT-F11 5p",5,0,0,0], ["ENT-F11 15p",15,0,2,2], ["ENT-F11 25p",25,0,2,2],
    ["ENT-F11 split",10,0,1,1], ["ENT-F12 later credit",10000,1500,1000,-500],
  ] as const)("reproduces §9.1 %s principal/fee/delta", (_id,q,prior,total,delta) => {
    const result = fee(q,prior,"enterprise_site_capture_policy_v1");
    expect([result.cumulativeFee.pence,result.postingDelta.pence]).toEqual([total,delta]);
  });
  it("ENT-F10 distributes its once-rounded two pennies with the existing allocation primitive", () => {
    const total = fee(15,0,"enterprise_site_capture_policy_v1").cumulativeFee;
    expect([...allocateMoney(money(total.pence),[{id:"extra-a",weight:5n},{id:"extra-b",weight:5n},{id:"extra-c",weight:5n}])].map(([id,amount])=>[id,amount.pence])).toEqual([["extra-a",1],["extra-b",1],["extra-c",0]]);
  });
  it("ENT-F9 keeps agreement rates separate, including later compensation under v1", () => {
    expect(fee(15000,0,"agreement-v1").cumulativeFee.pence + fee(15000,0,"agreement-v2","8").cumulativeFee.pence).toBe(2700);
    expect(fee(10000,1500,"agreement-v1").postingDelta.pence).toBe(-500);
  });
  it("split/combined rational receipts have identical fees and telescoping posting deltas", () => {
    let seed = 123456;
    const next = () => (seed = (Math.imul(seed,1664525) + 1013904223) >>> 0);
    for (let i=0;i<2000;i++) {
      const a=exactPence(BigInt(next()%1000000),BigInt(next()%97+1));
      const b=exactPence(BigInt(next()%1000000),BigInt(next()%101+1));
      const combined=addExactPence(a,b), first=fee(a), second=fee(combined,first.cumulativeFee.pence);
      expect(first.postingDelta.pence + second.postingDelta.pence).toBe(fee(combined).cumulativeFee.pence);
      expect(fee(addExactPence(b,a)).cumulativeFee).toEqual(fee(combined).cumulativeFee);
      expect(fee(a,fee(combined).cumulativeFee.pence).postingDelta.pence).toBe(Number(-BigInt(second.postingDelta.pence)));
    }
  });
  it("rejects invalid boundaries, mismatched versions, unsupported fields and unlinked reversals", () => {
    const input = { version:"cumulative-fee.v1",rate:{version:"fee-rate.v1",policyVersion:"v3",numerator:"10",denominator:"100"},
      cumulativeQualifyingPrincipal:{numerator:"0",denominator:"1"},priorNetPostedPence:10,priorPolicyVersion:"v3",compensatesDerivationId:null };
    expect(() => calculateCumulativeFee(input)).toThrow("COMPENSATION_LINK_REQUIRED");
    expect(() => calculateCumulativeFee({...input,priorPolicyVersion:"v1"})).toThrow("POLICY_VERSION_MISMATCH");
    expect(() => fee(-1)).toThrow("INVALID_SHARED_MONEY");
    expect(() => fee(exactPence(BigInt(MAX_MONEY_PENCE)+1n))).toThrow("INVALID_SHARED_MONEY");
    expect(() => calculateCumulativeFee({...input,priorNetPostedPence:0.5})).toThrow("INVALID_SHARED_MONEY");
    expect(() => calculateCumulativeFee({...input,subscriptionOffset:100})).toThrow("INVALID_SHARED_MONEY");
    for (const rate of [{numerator:"101",denominator:"100"},{numerator:"10",denominator:"0"},{numerator:"0.1",denominator:"1"}]) {
      expect(() => calculateCumulativeFee({...input,rate:{...input.rate,...rate}})).toThrow("INVALID_SHARED_MONEY");
    }
    expect(() => fee(10000,0,"reference_fee_policy_v3","8")).toThrow("INVALID_SHARED_MONEY");
    expect(fee(MAX_MONEY_PENCE).cumulativeFee.pence).toBe(100000000000);
  });
});
