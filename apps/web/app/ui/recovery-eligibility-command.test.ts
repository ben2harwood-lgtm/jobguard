import { describe, expect, it } from "vitest";
import { recoveryEligibilityCommandV1 } from "@jobguard/core";
import { approveEligibilityCommand, reviewEligibilityCommand, staleApprovalCommand, supersedeEvidenceCommand } from "./recovery-eligibility-command";

const id = "9b1d6f0e-2c7a-4a43-8f5e-1d2e3f4a5b6c";
const eligibility = (over: Partial<{ revision: number; evidenceRevision: number; policyRevision: number }> = {}) => ({
  revision: 3, caseRevision: 2, evidenceRevision: 1, policyVersion: "reference-d03.v1" as const, policyRevision: 1, classification: "eligible_for_review",
  eligibleNetPence: 32000, reason: "r", citations: [], status: "reviewed" as const, reviewerRef: "membership:x", ...over,
});
const withEligibility = (over?: Parameters<typeof eligibility>[0]) => ({ id, revision: 2, eligibility: eligibility(over) });

describe("eligibility command revisions come from the saved review", () => {
  it("uses revision 1 only for an initial review", () => {
    const command = reviewEligibilityCommand({ id, revision: 2, eligibility: null }, "evidence_backed_withheld_payment");
    expect(command).toMatchObject({ action: "review", evidenceRevision: 1, policyRevision: 1, expectedCaseRevision: 2 });
    expect(() => recoveryEligibilityCommandV1.parse(command)).not.toThrow();
  });
  it("re-reviews at the superseded evidence revision instead of resetting it to 1", () => {
    const command = reviewEligibilityCommand(withEligibility({ evidenceRevision: 2 }), "evidence_backed_withheld_payment");
    expect(command).toMatchObject({ evidenceRevision: 2, policyRevision: 1 });
    expect(() => recoveryEligibilityCommandV1.parse(command)).not.toThrow();
  });
  it("re-reviews at the superseded policy revision instead of resetting it to 1", () => {
    const command = reviewEligibilityCommand(withEligibility({ policyRevision: 2 }), "pending_money");
    expect(command).toMatchObject({ evidenceRevision: 1, policyRevision: 2, scenario: "pending_money" });
    expect(() => recoveryEligibilityCommandV1.parse(command)).not.toThrow();
  });
  it("approves with the saved policy revision, not a literal 1", () => {
    const command = approveEligibilityCommand(withEligibility({ evidenceRevision: 2, policyRevision: 2 }));
    expect(command).toMatchObject({ action: "approve", expectedEvidenceRevision: 2, expectedPolicyRevision: 2, expectedReviewRevision: 3, expectedCaseRevision: 2 });
    expect(() => recoveryEligibilityCommandV1.parse(command)).not.toThrow();
  });
  it("has nothing to approve before a review exists", () => {
    expect(approveEligibilityCommand({ id, revision: 2, eligibility: null })).toBeNull();
  });
  it("keeps the previous revisions, including policy, in the deliberate stale-approval command", () => {
    const prior = eligibility({ evidenceRevision: 1, policyRevision: 2 });
    const command = staleApprovalCommand({ id, revision: 2 }, prior);
    expect(command).toMatchObject({ action: "approve", expectedEvidenceRevision: 1, expectedPolicyRevision: 2, expectedReviewRevision: 3 });
    expect(() => recoveryEligibilityCommandV1.parse(command)).not.toThrow();
    expect(supersedeEvidenceCommand({ id, revision: 2 })).toMatchObject({ action: "supersede", subject: "evidence", expectedCaseRevision: 2 });
  });
  it("gives every command its own command ID", () => {
    const a = reviewEligibilityCommand({ id, revision: 2, eligibility: null }, "pending_money"), b = reviewEligibilityCommand({ id, revision: 2, eligibility: null }, "pending_money");
    expect(a.commandId).not.toBe(b.commandId);
  });
});
