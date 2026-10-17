import { describe, expect, it, vi } from "vitest";
import { EnterpriseFeeError, type EnterpriseFeeApprovalCheck, type EnterpriseFeeReferenceInput } from "@jobguard/core";
import { prepareEnterpriseFeeReference, bindEnterpriseFeeReference } from "./enterprise-fee.application.js";
import { refuseEnterpriseFeeInvoiceWork } from "./enterprise-fee.executor.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const input: EnterpriseFeeReferenceInput = { version: "enterprise-fee-reference-input.v1", statement: { version: "enterprise-statement.v1",
    tenantId: id(1), statementId: id(2), period: "2026-10", recordedCutoff: "2026-11-01T00:00:00Z", mode: "synthetic_demo", groups: [],
    agreements: [{ version: "enterprise-agreement.v1", id: "v1", tenantId: id(1), hash: "a".repeat(64), effectiveFrom: "2026-01-01T00:00:00Z",
      rate: { version: "fee-rate.v1", policyVersion: "v1", numerator: "10", denominator: "100" }, basis: "on_payment",
      minimumCommitment: null, onboardingFee: null, volumeBands: null }],
    prior: [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: 0, derivationId: null, contributions: [] }] }, sources: [] };
  const prepared = prepareEnterpriseFeeReference(input);
  const bound = bindEnterpriseFeeReference(prepared, { version: "enterprise-fee-reference-binding.v1", revisionId: id(3),
    action: "invoice-simulation", expiresAt: "2026-11-20T00:00:00Z" });
  const current: EnterpriseFeeApprovalCheck = { version: "enterprise-fee-approval-check.v1", ...bound, now: "2026-11-15T00:00:00Z",
    current: { tenantId: id(1), membershipId: id(4), grantId: id(5), role: "finance", sessionValid: true, membershipActive: true, grantActive: true },
    decision: { id: id(6), resolutionId: id(7), resolution: "approved", membershipId: id(4), ...bound, revoked: false, superseded: false },
    authorization: { id: id(8), decisionId: id(6), resolutionId: id(7), membershipId: id(4), grantId: id(5), ...bound, amountPence: 0, currency: "GBP", revoked: false } };
  return { work: { version: "enterprise-fee-invoice-work.v1", actionId: id(9), prepared, ...bound, authorizationId: id(8), outcome: "not_started" }, current };
}
describe("ENT-7 invoice executor refusal unit safeguards, not a worker integration", () => {
  it("E7-25 production and pilot workers refuse synthetic work even with exact supplied approval facts", () => {
    const { work, current } = fixture();
    expect(() => refuseEnterpriseFeeInvoiceWork(work, current, "production_billing")).toThrow("SYNTHETIC_REFERENCE_FORBIDDEN");
    expect(() => refuseEnterpriseFeeInvoiceWork(work, current, "pilot_no_charge")).toThrow("FEE_GATE_CLOSED");
  });
  it("E7-26 current authority is rechecked; revoked, expired and mismatched bindings refuse", () => {
    const { work, current } = fixture();
    current.current.grantActive = false;
    expect(() => refuseEnterpriseFeeInvoiceWork(work, current, "synthetic_demo")).toThrow("STATEMENT_AUTHORITY_INVALID");
    const second = fixture(); second.current.now = "2026-11-20T00:00:00Z";
    expect(() => refuseEnterpriseFeeInvoiceWork(second.work, second.current, "synthetic_demo")).toThrow("STATEMENT_AUTHORITY_INVALID");
    const third = fixture(); third.work.authorizationId = id(10);
    expect(() => refuseEnterpriseFeeInvoiceWork(third.work, third.current, "synthetic_demo")).toThrow("STATEMENT_AUTHORITY_INVALID");
  });
  it("E7-26 no network, payment, enqueue or successful execution occurs while Q-02 is held", () => {
    const network = vi.spyOn(globalThis, "fetch");
    try {
      const { work, current } = fixture();
      expect(() => refuseEnterpriseFeeInvoiceWork(work, current, "synthetic_demo")).toThrow("STATEMENT_EXECUTION_HELD");
      expect(() => refuseEnterpriseFeeInvoiceWork(work, current, "synthetic_demo")).toThrow("STATEMENT_EXECUTION_HELD");
      expect(network).not.toHaveBeenCalled();
      expect(work).not.toHaveProperty("paid");
    } finally { network.mockRestore(); }
  });
  it("E7-26 unknown outcome remains unresolved; no success or second invoice is produced", () => {
    const { work, current } = fixture(); work.outcome = "outcome_unknown";
    expect(() => refuseEnterpriseFeeInvoiceWork(work, current, "synthetic_demo")).toThrow("OUTCOME_UNKNOWN");
    expect(() => refuseEnterpriseFeeInvoiceWork(work, current, "synthetic_demo")).toThrow("OUTCOME_UNKNOWN");
  });
  it("E7-01 malformed executor payloads and client authority fields are refused", () => {
    const { work, current } = fixture();
    expect(() => refuseEnterpriseFeeInvoiceWork({ ...work, feeGate: true }, current, "synthetic_demo")).toThrow(EnterpriseFeeError);
    expect(() => refuseEnterpriseFeeInvoiceWork({ ...work, actionId: "invalid" }, current, "synthetic_demo")).toThrow(EnterpriseFeeError);
  });
});
