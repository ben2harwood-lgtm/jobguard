import{z}from"zod";
export const integrityReviewV1=z.object({version:z.literal("commercial-integrity-review.v1"),commandId:z.string().uuid(),findingKey:z.string().min(1),explanation:z.string().trim().min(1).max(500),outcome:z.literal("dismissed_false_positive")}).strict();
