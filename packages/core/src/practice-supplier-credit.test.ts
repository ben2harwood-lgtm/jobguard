import { expect, it } from "vitest";
import { supplierDocumentIntakeV1, supplierFixtures } from "./supplier-documents.js";
import { evaluateRecoveryEligibilityV3 } from "./recovery-eligibility-v3.js";
import { calculateCumulativeFee, exactPence, serializeExactPence } from "./cumulative-fee.js";

it("PF1B-A01 A01_AppendTwoInterimDocuments", () => {
  for (const fixtureId of ["practice-credit-300", "practice-later-invoice-1440"]) {
    expect(supplierDocumentIntakeV1.safeParse({ version: "supplier-document-intake.v1", fixtureId, channel: "picker", expectedRevision: 0 }).success).toBe(true);
  }
  const fixtures = supplierFixtures as Record<string, { type: string; number: string | null; bytes: string; media: string; pages: number }>;
  for (const [id, type, number, amount] of [
    ["practice-credit-300", "credit", "CR-PF1B-001", "NET GBP 300.00"],
    ["practice-later-invoice-1440", "invoice", "INV-PF1B-001", "AMOUNT TO PAY GBP 1440.00"],
  ]) {
    const fixture = fixtures[id!]!;
    expect(fixture).toMatchObject({ type, number, media: "text/plain", pages: 1 });
    expect(fixture.bytes).toContain(amount);
    expect(fixture.bytes).toContain("FICTIONAL");
    expect(fixture.bytes).toContain("INTERIM");
    expect(fixture.bytes).not.toMatch(/VAT|\beach\b|\bquantity\b|\bunit price\b|@/iu);
  }
  expect(supplierFixtures["materials-B-credit"].bytes).toContain("CR-MB-001 GBP 90.00");
});

const id = "10000000-0000-4000-8000-000000000001";
const result = (fixture: string) => evaluateRecoveryEligibilityV3({ version: "recovery-eligibility-facts.v3", environment: "synthetic_demo", tenantId: id, jobId: id, caseId: id, fixture, payer: "not_insurer", settlement: "settled", paymentTiming: "after_opening", sourceRef: id });
it("PF1B-A08 A08_ReferenceFeeZeroThenThirty", () => {
  for (const [fixture, expected] of [["F16-partial", 0], ["F16-full", 3000], ["F14", 3000]] as const) {
    const q = result(fixture).qualifyingPrincipal.pence;
    const fee = calculateCumulativeFee({ version: "cumulative-fee.v1", rate: { version: "fee-rate.v1", policyVersion: "reference_fee_policy_v3", numerator: "1", denominator: "10" }, cumulativeQualifyingPrincipal: serializeExactPence(exactPence(BigInt(q))), priorPolicyVersion: "reference_fee_policy_v3", priorNetPostedPence: 0, compensatesDerivationId: null });
    expect(fee.cumulativeFee.pence).toBe(expected);
  }
});
it("PF1B-A14 A14_F15AndMinimumRemainUnchanged", () => {
  expect(result("F15")).toMatchObject({ qualifyingPrincipal: { pence: 0 }, reason: "Credit note below the £250 minimum" });
});
