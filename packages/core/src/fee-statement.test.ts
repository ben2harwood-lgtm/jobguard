import { describe, expect, it } from "vitest";
import { projectFeeStatement, type FeeStatementInputV1 } from "./fee-statement.js";

const id = (n:number) => `${String(n).padStart(8,"0")}-0000-4000-8000-000000000000`;
const statement = (acceptedNetPence:number, eligibleNetPence:number, settledBasePlanPence=7_900, priorPostedRecoveryPence=0) => projectFeeStatement({
  version:"fee-statement.v1", mode:"synthetic_demo", tenantId:id(1), jobId:id(2), acceptedNetPence, settledBasePlanPence,
  priorPostedRecoveryPence, priorRecoveryPaymentsPence:0, outcomes: eligibleNetPence ? [{sourceId:id(3),caseId:id(4),state:"eligible",eligibleNetPence,grossCashPence:eligibleNetPence,evidenceId:id(5),evidenceState:"verified",reversesSourceId:null}] : [],
});

type Outcome = FeeStatementInputV1["outcomes"][number];
const landing = (source: number, eligibleNetPence = 10_000, grossCashPence = 12_000): Outcome => ({
  sourceId: id(source), caseId: id(4), state: "eligible", eligibleNetPence, grossCashPence,
  evidenceId: id(5), evidenceState: "verified", reversesSourceId: null,
});
const reversal = (source: number, target: number, principal = 10_000, gross = 12_000): Outcome => ({
  ...landing(source, principal, gross), state: "reversed", reversesSourceId: id(target),
});
const projectOutcomes = (outcomes: Outcome[], priorPostedRecoveryPence = 0) => projectFeeStatement({
  version: "fee-statement.v1", mode: "synthetic_demo", tenantId: id(1), jobId: id(2),
  acceptedNetPence: 1_880_000, settledBasePlanPence: 7_900,
  priorPostedRecoveryPence, priorRecoveryPaymentsPence: 0, outcomes,
});

describe("source-bound fee statement reversals", () => {
  it("rejects two full reversals of A even when B keeps aggregate totals nonnegative", () => {
    expect(() => projectOutcomes([
      landing(10, 10_000, 10_000), landing(11, 10_000, 10_000),
      reversal(12, 10, 10_000, 10_000), reversal(13, 10, 10_000, 10_000),
    ])).toThrow("Reversals cannot exceed immutable landing sources");
  });

  it.each([
    ["null", { ...reversal(12, 10), reversesSourceId: null }],
    ["missing", reversal(12, 99)],
    ["prevented", reversal(12, 11)],
    ["reversal", reversal(12, 13)],
    ["self", reversal(12, 12)],
    ["other case", { ...reversal(12, 10), caseId: id(99) }],
  ] satisfies [string, Outcome][])("rejects a %s target", (_, invalid) => {
    expect(() => projectOutcomes([
      landing(10), { ...landing(11), state: "prevented" }, reversal(13, 10, 0, 0), invalid,
    ])).toThrow("Reversals require an eligible source in the same case");
  });

  it.each([
    ["principal", 6_000, 1_000],
    ["gross cash", 1_000, 7_000],
  ])("rejects cumulative %s overflow despite a positive aggregate balance", (_, principal, gross) => {
    expect(() => projectOutcomes([
      landing(10), landing(11), reversal(12, 10, principal, gross), reversal(13, 10, principal, gross),
    ])).toThrow("Reversals cannot exceed immutable landing sources");
  });

  it.each(["eligible", "prevented", "reversed"] as const)("rejects ambiguous source identities shared with %s", (state) => {
    expect(() => projectOutcomes([
      landing(10), { ...landing(10), state, reversesSourceId: state === "reversed" ? id(11) : null }, landing(11),
    ])).toThrow("Outcome source identities must be unique");
  });

  it("retains exact partial reversals across distinct sources regardless of input order", () => {
    const outcomes = [landing(10, 250_000, 300_000), landing(11, 32_000, 38_400),
      reversal(12, 10, 100_000, 120_000), reversal(13, 10, 50_000, 60_000),
      reversal(14, 11, 2_000, 2_400)];
    const result = projectOutcomes(outcomes, 20_300);
    expect(result.principal).toMatchObject({
      eligibleLanded: { pence: 130_000 }, cap: { pence: 28_200 }, cumulativeFee: { pence: 13_000 },
      creditUsed: { pence: 7_900 }, additionalLiability: { pence: 5_100 },
      incrementalRetained: { pence: 124_900 }, totalPlatformPrincipal: { pence: 13_000 },
      netBenefitAfterTotalPlatformPrincipal: { pence: 117_000 },
    });
    expect(result.grossCash.landed.pence).toBe(156_000);
    expect(result.history.compensation.pence).toBe(15_200);
    expect(result.collectiblePlatformBalance).toBeNull();
    expect(result.labels).toEqual(["ILLUSTRATIVE ONLY", "NOT A PLATFORM TAX INVOICE", "NOT MONEY COLLECTED", "VAT EXCLUDED"]);
    const shuffled = projectOutcomes([...outcomes].reverse(), 20_300);
    expect(shuffled).toEqual({ ...result, eligibleOutcomes: [...result.eligibleOutcomes].reverse() });
  });

  it("allows cumulative partial reversals to leave exactly zero", () => {
    const result = projectOutcomes([reversal(12, 10, 6_000, 7_200), landing(10), reversal(13, 10, 4_000, 4_800)]);
    expect(result.principal.eligibleLanded.pence).toBe(0);
    expect(result.principal.cumulativeFee.pence).toBe(0);
    expect(result.grossCash.landed.pence).toBe(0);
    expect(result.collectiblePlatformBalance).toBeNull();
  });

  it("preserves signed prior posting compatibility", () => {
    const result = projectOutcomes([landing(10)], -100);
    expect(result.history.priorNetPostings.pence).toBe(-100);
    expect(result.history.compensation.pence).toBe(0);
  });
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
