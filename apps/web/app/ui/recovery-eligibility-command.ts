import type { RecoveryCaseResponse } from "@jobguard/api/workspace";

type Case = RecoveryCaseResponse["cases"][number];
type Eligibility = NonNullable<Case["eligibility"]>;
type CaseRef = Pick<Case, "id" | "revision">;

// Evidence and policy revisions come from the saved review. Revision 1 is only the start of a case's first review: after a
// supersession the next review and its approval must carry the recorded (later) revisions, never reset them.
const command = <A extends string>(action: A, c: CaseRef) => ({ version: "recovery-eligibility-command.v1" as const, action, commandId: crypto.randomUUID(), caseId: c.id });

export const reviewEligibilityCommand = (c: CaseRef & { eligibility: Eligibility | null }, scenario: string) => ({
  ...command("review", c), scenario, expectedCaseRevision: c.revision,
  evidenceRevision: c.eligibility?.evidenceRevision ?? 1, policyVersion: "reference-d03.v1" as const, policyRevision: c.eligibility?.policyRevision ?? 1,
});

const approval = (c: CaseRef, e: Eligibility) => ({
  ...command("approve", c), expectedCaseRevision: c.revision,
  expectedEvidenceRevision: e.evidenceRevision, expectedPolicyRevision: e.policyRevision, expectedReviewRevision: e.revision,
});
export const approveEligibilityCommand = (c: CaseRef & { eligibility: Eligibility | null }) => c.eligibility ? approval(c, c.eligibility) : null;
export const supersedeEvidenceCommand = (c: CaseRef) => ({ ...command("supersede", c), expectedCaseRevision: c.revision, subject: "evidence" as const });
/** The deliberate stale click: approve with the revisions of the review that was just superseded. */
export const staleApprovalCommand = (c: CaseRef, prior: Eligibility) => approval(c, prior);
