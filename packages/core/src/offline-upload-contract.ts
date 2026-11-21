import { z } from "zod";
import { jobWorkStateCommandV1 } from "./job-work-state.js";
import { logSiteExtraV1 } from "./site-extra.js";
import { money } from "./money.js";
const uuid = z.guid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().nonnegative().safe();
/** Outbound intents can only request online re-review; they never create approval. */
export const offlineCommercialIntentV1 = z.object({
 version: z.literal("offline-commercial-intent.v1"), commandId: uuid,
 expectedRevision: revision, acceptedQuoteVersionId: uuid.nullable(), authorizationId: uuid,
 actionType: z.enum(["send_quote", "issue_invoice", "place_order"]),
 recipient: z.email().refine(value => value.endsWith(".invalid")), contentHash: hash,
 amountPence: z.number().int().nonnegative().refine(value => { try { money(value); return true; } catch { return false; } }),
 currency: z.literal("GBP"), policyVersion: z.string().min(1).max(80),
}).strict();
export const offlineUploadBodyV1 = z.union([logSiteExtraV1, jobWorkStateCommandV1, offlineCommercialIntentV1]);
export const offlineUploadV1 = z.object({
 version: z.literal("offline-upload.v1"), commandId: uuid, jobId: uuid,
 payloadHash: hash, expectedRevision: revision.nullable(),
 body: offlineUploadBodyV1,
}).strict().superRefine((intent, ctx) => {
 if (intent.commandId !== intent.body.commandId) ctx.addIssue({ code: "custom", message: "Command identity mismatch" });
 const expected = "expectedRevision" in intent.body ? intent.body.expectedRevision : null;
 if (intent.expectedRevision !== expected) ctx.addIssue({ code: "custom", message: "Revision binding mismatch" });
});
export type OfflineUploadV1 = z.infer<typeof offlineUploadV1>;
export const offlineUploadResultV1 = z.object({
 version: z.literal("offline-upload-result.v1"), commandId: uuid,
 state: z.enum(["acknowledged", "rejected", "conflict", "retryable"]),
 code: z.enum(["RECORDED", "INVALID_INTENT", "PAYLOAD_HASH_MISMATCH", "IDEMPOTENCY_CONFLICT", "PERMISSION_REVOKED", "STALE_REVISION", "STALE_PRICE", "ACCEPTED_VERSION_CHANGED", "APPROVAL_EXPIRED", "AUTHORITY_CHANGED", "COMPLETION_CONFLICT", "LOCKED_BILL", "ONLINE_REVIEW_REQUIRED", "UNAVAILABLE"]),
 realExternalActions: z.literal(0),
}).strict();
