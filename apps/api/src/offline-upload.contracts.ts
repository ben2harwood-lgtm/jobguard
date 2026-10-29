import { createHash } from "node:crypto";
import { z } from "zod";
import { jobWorkStateCommandV1, logSiteExtraV1, money } from "@jobguard/core";

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
const offlineUploadBodyV1 = z.union([logSiteExtraV1, jobWorkStateCommandV1, offlineCommercialIntentV1]);
export class OfflineUploadError extends Error {
 constructor(readonly code: "SYNTHETIC_MODE_REQUIRED" | "INVALID_OFFLINE_UPLOAD") { super(code); this.name = "OfflineUploadError"; }
}
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
/** Parsed schemas fix object order; hash only the semantic selector/body, never credentials or capture clocks. */
export function offlineUploadPayloadHash(jobId: string, body: OfflineUploadV1["body"]): string {
 const parsed = offlineUploadBodyV1.parse(body);
 return createHash("sha256").update(JSON.stringify({ jobId, body: parsed })).digest("hex");
}
export const offlineUploadResultV1 = z.object({
 version: z.literal("offline-upload-result.v1"), commandId: uuid,
 state: z.enum(["acknowledged", "rejected", "conflict", "retryable"]),
 code: z.enum(["RECORDED", "INVALID_INTENT", "PAYLOAD_HASH_MISMATCH", "IDEMPOTENCY_CONFLICT", "PERMISSION_REVOKED", "STALE_REVISION", "STALE_PRICE", "ACCEPTED_VERSION_CHANGED", "APPROVAL_EXPIRED", "AUTHORITY_CHANGED", "COMPLETION_CONFLICT", "LOCKED_BILL", "ONLINE_REVIEW_REQUIRED", "UNAVAILABLE"]),
 realExternalActions: z.literal(0),
}).strict();
