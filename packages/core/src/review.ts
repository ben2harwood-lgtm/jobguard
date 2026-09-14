import { z } from "zod";

export const REVIEW_CONTRACT_VERSION = "proposal_review_v1" as const;
const uuid = z.string().uuid();
const nullableCommercial = z.object({
  quantity: z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/u).nullable(),
  unit: z.string().min(1).max(40).nullable(),
  unitPricePence: z.number().int().nonnegative().nullable(),
});

export const reviewLineV1 = z.object({
  id: uuid,
  scopeItemId: uuid,
  origin: z.enum(["proposal", "human"]),
  description: z.string().trim().min(1).max(500),
  room: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  ...nullableCommercial.shape,
  disposition: z.enum(["proposed", "accepted", "dismissed", "split", "merged"]),
  dismissalReason: z.string().trim().min(1).max(200).nullable(),
  parentScopeItemIds: z.array(uuid),
  sourceExcerpt: z.string().max(1_000).nullable(),
}).strict().superRefine((line, context) => {
  if ((line.disposition === "dismissed") !== (line.dismissalReason !== null)) {
    context.addIssue({ code: "custom", message: "Dismissed lines require a reason, and only dismissed lines may have one" });
  }
  if (line.origin === "human" && line.sourceExcerpt !== null) context.addIssue({ code: "custom", message: "Human lines cannot claim an extracted excerpt" });
});

export const reviewQuestionV1 = z.object({
  id: uuid, question: z.string().min(1).max(500), blocking: z.boolean(),
  disposition: z.enum(["unresolved", "answered", "carry_to_quote"]), answer: z.string().trim().min(1).max(500).nullable(),
}).strict().superRefine((question, context) => {
  if (question.disposition === "answered" && !question.answer) context.addIssue({ code: "custom", message: "Answered questions require an answer" });
  if (question.disposition !== "answered" && question.answer) context.addIssue({ code: "custom", message: "Only answered questions may contain an answer" });
});

export const proposalReviewV1 = z.object({
  version: z.literal(REVIEW_CONTRACT_VERSION), reviewId: uuid, proposalId: uuid, jobId: uuid,
  revision: z.number().int().nonnegative(), lines: z.array(reviewLineV1), questions: z.array(reviewQuestionV1),
}).strict();
export type ProposalReview = z.infer<typeof proposalReviewV1>;

export class ReviewConflictError extends Error { readonly code = "REVIEW_REVISION_CONFLICT"; }
export class ReviewIncompleteError extends Error { readonly code = "REVIEW_INCOMPLETE"; }

export function reconciliationSummary(review: ProposalReview) {
  const count = (kind: ProposalReview["lines"][number]["disposition"]) => review.lines.filter((line) => line.disposition === kind).length;
  return {
    proposed: review.lines.filter((line) => line.origin === "proposal").length,
    accepted: count("accepted"), dismissed: count("dismissed"),
    splitOrMerged: count("split") + count("merged"),
    humanAdded: review.lines.filter((line) => line.origin === "human").length,
  };
}

/** Confirmation readiness is intentionally narrower than quote-issue readiness: pricing remains M1-4. */
export function assertReviewConfirmable(review: ProposalReview): void {
  proposalReviewV1.parse(review);
  if (review.lines.some((line) => line.disposition === "proposed")) throw new ReviewIncompleteError("Every proposed line needs an explicit disposition");
  if (review.questions.some((question) => question.blocking && question.disposition !== "answered")) throw new ReviewIncompleteError("Blocking questions must be answered");
  if (review.questions.some((question) => !question.blocking && question.disposition === "unresolved")) throw new ReviewIncompleteError("Non-blocking questions require a visible disposition");
  const promoted = review.lines.filter((line) => line.disposition === "accepted" || line.origin === "human");
  if (!promoted.length) throw new ReviewIncompleteError("At least one scope line must be confirmed");
  for (const line of promoted) {
    if (line.quantity === null || line.unit === null) throw new ReviewIncompleteError("Confirmed scope needs quantity and unit before quoting");
  }
}
