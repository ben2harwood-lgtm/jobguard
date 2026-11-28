import { z } from "zod";
import { proposalReviewV1, reviewLineV1, reviewQuestionV1 } from "@jobguard/core";

type Review = z.infer<typeof proposalReviewV1>;
// Local edits may be incomplete. Server validation still governs Save/Confirm.
const draftReview = z.object({ ...proposalReviewV1.shape,
  lines: z.array(z.object({ ...reviewLineV1.shape, description: z.string(), room: z.string(), category: z.string(),
    quantity: z.string().nullable(), unit: z.string().nullable(), dismissalReason: z.string().nullable() })),
  questions: z.array(z.object({ ...reviewQuestionV1.shape, answer: z.string().nullable() })),
});
const draft = z.object({ review: draftReview, priceText: z.record(z.string(), z.string()) });

export function reviewDraftKey(jobId: string, proposalId: string, revision: number) {
  return `jobguard-review-draft-v1:${jobId}:${proposalId}:${revision}`;
}
export function readReviewDraft(key: string, jobId: string, proposalId: string, revision: number) {
  try {
    const parsed = draft.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
    if (parsed.success && parsed.data.review.jobId === jobId && parsed.data.review.proposalId === proposalId
      && parsed.data.review.revision === revision) return parsed.data;
  } catch { /* Storage may be unavailable or contain an invalid interrupted write. */ }
  return null;
}
export function writeReviewDraft(key: string, review: Review, priceText: Record<string, string>) {
  try { sessionStorage.setItem(key, JSON.stringify({ review, priceText })); } catch { /* Keep in-memory edits usable. */ }
}
export function clearReviewDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* Keep in-memory edits usable. */ }
}
