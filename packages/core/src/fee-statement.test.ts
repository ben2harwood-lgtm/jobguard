import { describe, expect, it } from "vitest";
import { projectFeeStatement } from "./fee-statement.js";

const id = (n:number) => `${String(n).padStart(8,"0")}-0000-4000-8000-000000000000`;
const statement = (acceptedNetPence:number, eligibleNetPence:number, settledBasePlanPence=7_900, priorPostedRecoveryPence=0) => projectFeeStatement({
  version:"fee-statement.v1", mode:"synthetic_demo", tenantId:id(1), jobId:id(2), acceptedNetPence, settledBasePlanPence,
  priorPostedRecoveryPence, priorRecoveryPaymentsPence:0, outcomes: eligibleNetPence ? [{sourceId:id(3),caseId:id(4),state:"eligible",eligibleNetPence,grossCashPence:eligibleNetPence,evidenceId:id(5),evidenceState:"verified",reversesSourceId:null}] : [],
});

describe("transparent fee statement",()=>{
  it.each([
    [1_880_000,282_000,28_200,28_200,7_900,20_300,28_200,253_800],
    [18_800_000,282_000,282_000,28_200,7_900,20_300,28_200,253_800],
    [1_000_000,282_000,15_000,15_000,7_900,7_100,15_000,267_000],
    [100_000,50_000,1_500,1_500,1_500,0,7_900,42_100],
    [1_000_000,0,15_000,0,0,0,7_900,-7_900],
  ])("reproduces section 3.5 %#",(accepted,landed,cap,fee,credit,additional,total,benefit)=>{
    const result=statement(accepted,landed); expect([result.principal.cap.pence,result.principal.cumulativeFee.pence,result.principal.creditUsed.pence,result.principal.additionalLiability.pence,result.principal.totalPlatformPrincipal.pence,result.principal.netBenefitAfterTotalPlatformPrincipal.pence]).toEqual([cap,fee,credit,additional,total,benefit]);
  });
  it("separates the £2,820 principal views and excludes VAT",()=>{const result=statement(1_880_000,282_000);expect(result.principal.incrementalRetained.pence).toBe(261_700);expect(result.principal.netBenefitAfterTotalPlatformPrincipal.pence).toBe(253_800);expect(result.labels).toContain("VAT EXCLUDED");});
  it("does not credit an unpaid base",()=>expect(statement(1_880_000,282_000,0).principal).toMatchObject({creditUsed:{pence:0},additionalLiability:{pence:28_200}}));
  it("shows prevented outcomes without a fee",()=>{const result=projectFeeStatement({version:"fee-statement.v1",mode:"pilot_no_charge",tenantId:id(1),jobId:id(2),acceptedNetPence:1_880_000,settledBasePlanPence:7_900,priorPostedRecoveryPence:0,priorRecoveryPaymentsPence:0,outcomes:[{sourceId:id(3),caseId:id(4),state:"prevented",eligibleNetPence:282_000,grossCashPence:282_000,evidenceId:null,evidenceState:null,reversesSourceId:null}]});expect(result.principal.cumulativeFee.pence).toBe(0);expect(result.collectiblePlatformBalance).toBeNull();});
  it("reconciles partial immutable sources and a reversal to compensation",()=>{const result=projectFeeStatement({version:"fee-statement.v1",mode:"synthetic_demo",tenantId:id(1),jobId:id(2),acceptedNetPence:1_880_000,settledBasePlanPence:7_900,priorPostedRecoveryPence:20_300,priorRecoveryPaymentsPence:20_300,outcomes:[{sourceId:id(3),caseId:id(4),state:"eligible",eligibleNetPence:32_000,grossCashPence:38_400,evidenceId:id(5),evidenceState:"verified",reversesSourceId:null},{sourceId:id(6),caseId:id(4),state:"eligible",eligibleNetPence:250_000,grossCashPence:300_000,evidenceId:id(7),evidenceState:"verified",reversesSourceId:null},{sourceId:id(8),caseId:id(4),state:"reversed",eligibleNetPence:250_000,grossCashPence:300_000,evidenceId:id(7),evidenceState:"verified",reversesSourceId:id(6)}]});expect(result.principal.eligibleLanded.pence).toBe(32_000);expect(result.grossCash.landed.pence).toBe(38_400);expect(result.history.compensation.pence).toBe(20_300);expect(result.eligibleOutcomes[2]?.reversesSourceId).toBe(id(6));});
});
