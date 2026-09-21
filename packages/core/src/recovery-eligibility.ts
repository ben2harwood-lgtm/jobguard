import { z } from "zod";
import { money } from "./money.js";

export const eligibilityScenarioV1 = z.enum([
  "evidence_backed_withheld_payment", "pending_money", "manual_payment", "prevented_spending",
  "supplier_credit", "wrong_attribution", "already_allocated", "unknown_basis", "unknown_causation",
]);
export type EligibilityScenario = z.infer<typeof eligibilityScenarioV1>;

const exclusions: Readonly<Partial<Record<EligibilityScenario, string>>> = {
  pending_money: "Pending money cannot qualify",
  manual_payment: "A manual payment record is not settlement evidence",
  prevented_spending: "Prevented spending is not recovered cash",
  supplier_credit: "Supplier credits are excluded by this reference policy",
  wrong_attribution: "This payment is not attributed to this recovery case",
  already_allocated: "This movement is already allocated",
  unknown_basis: "Net and tax basis needs review",
  unknown_causation: "Recovery causation needs review",
};

export type EligibilityClassification = Readonly<{ classification: "eligible_for_review" | "excluded" | "pending_review"; eligibleNetPence: number | null; reason: string }>;
export function classifyReferenceD03(scenario: EligibilityScenario, claimedNetPence: number): EligibilityClassification {
  const claimed = money(claimedNetPence).pence;
  if (scenario === "evidence_backed_withheld_payment") return { classification: "eligible_for_review", eligibleNetPence: claimed, reason: "Verified evidence attributes settled customer money to this claim" };
  if (scenario === "unknown_basis" || scenario === "unknown_causation") return { classification: "pending_review", eligibleNetPence: null, reason: exclusions[scenario]! };
  return { classification: "excluded", eligibleNetPence: null, reason: exclusions[scenario]! };
}

const base = { version: z.literal("recovery-eligibility-command.v1"), commandId: z.string().uuid(), caseId: z.string().uuid() };
export const recoveryEligibilityCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("review"), scenario: eligibilityScenarioV1, expectedCaseRevision: z.number().int().positive(), evidenceRevision: z.number().int().positive(), policyVersion: z.literal("reference-d03.v1"), policyRevision: z.literal(1) }).strict(),
  z.object({ ...base, action: z.literal("approve"), expectedCaseRevision: z.number().int().positive(), expectedEvidenceRevision: z.number().int().positive(), expectedPolicyRevision: z.literal(1), expectedReviewRevision: z.number().int().positive() }).strict(),
  z.object({ ...base, action: z.literal("supersede"), expectedCaseRevision: z.number().int().positive(), subject: z.enum(["evidence", "case", "policy"]) }).strict(),
]);
export type RecoveryEligibilityCommand = z.infer<typeof recoveryEligibilityCommandV1>;
