import { z } from "zod";

const counter = z.number().int().nonnegative().safe();
export const offlineQueueItemV1 = z.object({
 version: z.literal("offline-queue-item.v1"), environment: z.literal("synthetic_demo"),
 commandId: z.guid(), jobId: z.guid(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
 expectedRevision: counter.nullable(), kind: z.enum(["site_extra", "work_state", "commercial_intent"]),
 attemptCount: counter, nextAttemptAtMs: counter,
 status: z.enum(["queued", "sending", "recorded", "needs_review"]),
}).strict().refine(item => item.kind !== "commercial_intent" || item.status !== "recorded", {
 message: "Commercial intent requires online review",
});
export type OfflineQueueItemV1 = z.infer<typeof offlineQueueItemV1>;
export const offlineQueueResultCodesV1 = [
 "RECORDED", "INVALID_INTENT", "PAYLOAD_HASH_MISMATCH", "IDEMPOTENCY_CONFLICT", "PERMISSION_REVOKED",
 "STALE_REVISION", "STALE_PRICE", "ACCEPTED_VERSION_CHANGED", "APPROVAL_EXPIRED", "AUTHORITY_CHANGED",
 "COMPLETION_CONFLICT", "LOCKED_BILL", "ONLINE_REVIEW_REQUIRED", "UNAVAILABLE",
] as const;
const uploadResult = z.object({
 version: z.literal("offline-upload-result.v1"), commandId: z.guid(),
 state: z.enum(["acknowledged", "rejected", "conflict", "retryable"]),
 code: z.string(), realExternalActions: z.literal(0),
}).strict();
export const offlineQueueRetryV1 = { maxAttempts: 8, baseDelayMs: 1_000, maxDelayMs: 60_000, maxJitterMs: 1_000 } as const;
export class OfflineQueueError extends Error {
 constructor(readonly code: "OFFLINE_QUEUE_INVALID_ITEM" | "OFFLINE_QUEUE_IDENTITY_CONFLICT") {
  super(code); this.name = "OfflineQueueError";
 }
}
function parseItem(raw: unknown): OfflineQueueItemV1 {
 const parsed = offlineQueueItemV1.safeParse(raw);
 if (!parsed.success) throw new OfflineQueueError("OFFLINE_QUEUE_INVALID_ITEM");
 return parsed.data;
}
function sameIdentity(a: OfflineQueueItemV1, b: OfflineQueueItemV1): boolean {
 return a.payloadHash === b.payloadHash && a.jobId === b.jobId && a.kind === b.kind && a.expectedRevision === b.expectedRevision;
}

/** Array order is capture order; duplicates never replace existing lifecycle or identity. */
export function addOfflineQueueItemV1(saved: readonly OfflineQueueItemV1[], raw: unknown): OfflineQueueItemV1[] {
 const items = saved.map(parseItem);
 const item = parseItem(raw);
 const previous = items.find(entry => entry.commandId === item.commandId);
 if (previous && !sameIdentity(previous, item)) throw new OfflineQueueError("OFFLINE_QUEUE_IDENTITY_CONFLICT");
 return previous ? items : [...items, item];
}

/** Unknown/malformed responses fail closed. A review or acknowledgment cannot be undone by a late response. */
export function applyOfflineUploadResultV1(raw: unknown, response: unknown, nowMs: number, jitterMs = 0): OfflineQueueItemV1 {
 const item = parseItem(raw);
 counter.parse(nowMs);
 counter.max(offlineQueueRetryV1.maxJitterMs).parse(jitterMs);
 if (item.status === "recorded" || item.status === "needs_review") return item;
 const review: OfflineQueueItemV1 = { ...item, status: "needs_review" };
 const parsed = uploadResult.safeParse(response);
 if (!parsed.success || parsed.data.commandId !== item.commandId) return review;
 const result = parsed.data;
 if (!offlineQueueResultCodesV1.some(code => code === result.code)) return review;
 if (result.state === "acknowledged" && result.code === "RECORDED" && item.kind !== "commercial_intent") {
  return { ...item, status: "recorded" };
 }
 if (result.state !== "retryable" || result.code !== "UNAVAILABLE" || item.attemptCount >= offlineQueueRetryV1.maxAttempts) return review;
 const delay = Math.min(offlineQueueRetryV1.maxDelayMs,
  offlineQueueRetryV1.baseDelayMs * 2 ** Math.max(0, item.attemptCount - 1) + jitterMs);
 return { ...item, status: "queued", nextAttemptAtMs: nowMs + Math.min(delay, Number.MAX_SAFE_INTEGER - nowMs) };
}

/** Claim one attempt. Review, in-flight and delayed items block only their own job. */
export function chooseOfflineQueueItemV1(saved: readonly OfflineQueueItemV1[], nowMs: number): {
 items: OfflineQueueItemV1[]; next: OfflineQueueItemV1 | null;
} {
 counter.parse(nowMs);
 const items = saved.map(parseItem).map(item => item.status === "queued" && item.attemptCount >= offlineQueueRetryV1.maxAttempts
  ? { ...item, status: "needs_review" as const } : item);
 const blockedJobs = new Set<string>();
 for (let index = 0; index < items.length; index++) {
  const item = items[index]!;
  if (item.status === "recorded" || blockedJobs.has(item.jobId)) continue;
  blockedJobs.add(item.jobId);
  if (item.status !== "queued" || item.nextAttemptAtMs > nowMs) continue;
  const next: OfflineQueueItemV1 = { ...item, status: "sending", attemptCount: item.attemptCount + 1 };
  items[index] = next;
  return { items, next };
 }
 return { items, next: null };
}

export function offlineQueueDisplayV1(raw: unknown): "queued" | "sending" | "recorded" | "needs review" {
 const parsed = offlineQueueItemV1.safeParse(raw);
 if (!parsed.success || parsed.data.status === "needs_review") return "needs review";
 return parsed.data.status;
}

/** Caller supplies decoded saved entries. No storage, decryption, migration or identity generation. */
export function restoreOfflineQueueV1(saved: readonly unknown[]): {
 items: OfflineQueueItemV1[]; refused: { index: number; code: OfflineQueueError["code"] }[];
} {
 let items: OfflineQueueItemV1[] = [];
 const refused: { index: number; code: OfflineQueueError["code"] }[] = [];
 saved.forEach((raw, index) => {
  try {
   const item = parseItem(raw);
   items = addOfflineQueueItemV1(items, item.status === "sending" ? { ...item, status: "queued" } : item);
  } catch (error) {
   if (!(error instanceof OfflineQueueError)) throw error;
   refused.push({ index, code: error.code });
   // A conflicting saved identity needs review; never choose either variant for automatic replay.
   if (error.code === "OFFLINE_QUEUE_IDENTITY_CONFLICT") {
    const item = parseItem(raw);
    items = items.map(existing => existing.commandId === item.commandId ? { ...existing, status: "needs_review" } : existing);
   }
  }
 });
 return { items, refused };
}
