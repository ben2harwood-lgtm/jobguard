import { z } from "zod";
import { mobileAccessV1, mobileRefreshV1, mobilePartitionV1, mobileReadLeaseV1, mobileLocalMetadataV1, syncDeviceCacheV1, offlineReconciliationV1, offlineUploadV1, offlineCaptureItemV1, offlineIntentV1 } from "@jobguard/core";
import type { EncryptedStore } from "./store";
const time = z.number().int().nonnegative().safe();
export const mobileSession = z.object({ version: z.literal("mobile-session.v1"), environment: z.literal("synthetic_demo"),
 access: mobileAccessV1, refresh: mobileRefreshV1, partition: mobilePartitionV1, accessExpiresAtMs: time, refreshExpiresAtMs: time, lease: mobileReadLeaseV1,
}).strict().refine(s => samePartition(s.partition, s.lease.partition), "partition mismatch");
export type MobileSession = z.infer<typeof mobileSession>;
export type Partition = z.infer<typeof mobilePartitionV1>;
export const activeRecord = z.object({ version: z.literal("mobile-active.v1"), partition: mobilePartitionV1,
 state: z.enum(["active", "cleanup_required"]) }).strict();
export const nativeQueueEntryV1 = z.object({ upload: offlineUploadV1, reconciliation: offlineReconciliationV1, offlineIntent: offlineIntentV1.optional() }).strict();
export const inlineAttachmentV1 = z.object({ id: z.guid(),
 base64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u).max(131072),
}).strict();
const capture = z.union([
 z.object({ item: offlineCaptureItemV1, text: z.string().startsWith("Fictional ").max(5000), upload: z.never().optional() }).strict()
  .refine(c => c.item.kind === "text" && c.item.status === "local_only"),
 z.object({ item: offlineCaptureItemV1, upload: z.object({ finalizeCommandId: z.guid(),
  requestedExpiresAtMs: time, serverExpiresAtMs: time.nullable(), nextOffset: z.number().int().nonnegative(),
 }).strict() }).strict().refine(({ item, upload }) => item.kind !== "text" && upload.nextOffset <= item.byteLength &&
  (upload.serverExpiresAtMs !== null || upload.nextOffset === 0) &&
  (upload.serverExpiresAtMs === null || upload.serverExpiresAtMs <= upload.requestedExpiresAtMs) &&
  (item.status !== "verified" || upload.nextOffset === item.byteLength)),
]);
// V2-B2B1: photo bytes live OUTSIDE this row as encrypted chunks (see encrypted-media.ts); this row holds only the
// index, the capture-order counter and, after server verification, a small receipt. No media bytes or keys here.
export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_CHUNK_BYTES = 256 * 1024;
const mediaDigest = z.string().regex(/^[0-9a-f]{64}$/u);
export const captureOrderV1 = z.object({ sessionId: z.guid(), sequence: z.number().int().positive().max(1_000_000) }).strict();
const mediaTiming = z.object({ signInCheckServerMs: time, elapsedSinceCheckMs: time }).strict();
const mediaChunks = z.object({ byteLength: z.number().int().positive().max(MEDIA_MAX_BYTES), chunkBytes: z.literal(MEDIA_CHUNK_BYTES),
 chunkCount: z.number().int().positive().max(Math.ceil(MEDIA_MAX_BYTES / MEDIA_CHUNK_BYTES)) }).strict()
 .refine(c => c.chunkCount === Math.ceil(c.byteLength / c.chunkBytes), "chunk count");
export const storedMediaV1 = z.object({ state: z.literal("stored"), mediaId: z.guid(), jobId: z.guid(), captureOrder: captureOrderV1,
 contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), chunks: mediaChunks, sha256: mediaDigest, timing: mediaTiming,
 discardRequestId: z.guid().nullable() }).strict();
export const verifiedMediaReceiptV1 = z.object({ state: z.literal("verified_receipt"), mediaId: z.guid(), jobId: z.guid(),
 captureOrder: captureOrderV1, chunks: mediaChunks, serverVerification: z.object({ evidenceId: z.guid(),
  objectVersionId: z.string().min(1).max(1024), sha256: mediaDigest, byteLength: z.number().int().positive().max(MEDIA_MAX_BYTES) }).strict(),
}).strict();
export const mediaRecordV1 = z.discriminatedUnion("state", [storedMediaV1, verifiedMediaReceiptV1]);
export type MediaRecord = z.infer<typeof mediaRecordV1>;
type QueueAndCaptures = { queue: unknown[]; captures: { item: { uploadId: string; status: string } }[]; media: MediaRecord[] };
/** True only when nothing local is still waiting on the server. A verified receipt is settled; stored media never is. */
export function nothingUnsynced(data: QueueAndCaptures) {
 return data.media.every(m => m.state === "verified_receipt") && data.captures.every(({ item }) => item.status === "verified" &&
  data.media.some(m => m.state === "verified_receipt" && m.mediaId === item.uploadId)) && data.queue.every(raw => {
  const parsed = nativeQueueEntryV1.safeParse(raw); return parsed.success && parsed.data.reconciliation.item.status === "recorded"
   && parsed.data.reconciliation.item.commandId === parsed.data.upload.commandId
   && parsed.data.reconciliation.item.payloadHash === parsed.data.upload.payloadHash;
 });
}
export const localData = z.object({ version: z.literal("mobile-cache.v1"), metadata: mobileLocalMetadataV1,
 sync: syncDeviceCacheV1.nullable().prefault(null),
 queue: z.array(z.unknown()).max(1000).prefault([]),
 captures: z.array(capture).max(100).prefault([]),
 notes: z.array(z.object({ id: z.guid(), text: z.string().startsWith("Fictional ").max(500) }).strict()).max(100),
 // Small synthetic attachments are stored INSIDE SQLCipher, never in a plaintext media directory.
 files: z.array(inlineAttachmentV1).max(8),
 media: z.array(mediaRecordV1).max(100).prefault([]),
 mediaSequences: z.array(z.object({ sessionId: z.guid(), last: z.number().int().positive().max(1_000_000) }).strict()).max(100).prefault([]),
 // Discarded photos whose encrypted chunks or key may still exist; removed only once both are gone (retryable).
 mediaCleanup: z.array(z.object({ mediaId: z.guid(), chunkCount: z.number().int().positive().max(Math.ceil(MEDIA_MAX_BYTES / MEDIA_CHUNK_BYTES)) }).strict()).max(100).prefault([]),
 // True only when encrypted media itself turned the hold on (none -> present). Any other marker is never cleared here.
 mediaOwnsUnsyncedHold: z.boolean().prefault(false),
 unsyncedWork: z.enum(["none", "present", "unknown"]),
}).strict().refine(data => data.captures.every(({ item, upload }) => !upload ||
 data.files.filter(f => f.id === item.uploadId).length + data.media.filter(m => m.mediaId === item.uploadId).length === 1), "Capture attachment missing or ambiguous")
.refine(data => data.media.every(m => {
 const owners = data.captures.filter(c => c.upload && c.item.uploadId === m.mediaId);
 const owner = owners[0];
 return owners.length === 1 && owner !== undefined && owner.item.jobId === m.jobId && (m.state === "stored"
  ? owner.item.status !== "verified" && owner.item.clientSha256 === m.sha256 && owner.item.byteLength === m.chunks.byteLength
  : owner.item.status === "verified" && JSON.stringify(owner.item.serverVerification) === JSON.stringify(m.serverVerification));
}), "Media record must belong to exactly one matching capture")
.refine(data => new Set(data.media.map(m => `${m.captureOrder.sessionId}:${m.captureOrder.sequence}`)).size === data.media.length
 && data.media.every(m => (data.mediaSequences.find(s => s.sessionId === m.captureOrder.sessionId)?.last ?? 0) >= m.captureOrder.sequence)
 && new Set(data.mediaSequences.map(s => s.sessionId)).size === data.mediaSequences.length, "Capture order repeats or runs ahead of its counter")
// Codex P2 (#979): a pending media cleanup tombstone is the only pointer to leftover encrypted chunks or a key,
// so it keeps the hold too; otherwise save() could label the row empty and logout would erase that pointer.
.refine(data => data.unsyncedWork !== "none" || (nothingUnsynced(data) && data.mediaCleanup.length === 0),
 "Unresolved queue, capture or media cleanup requires cleanup hold");
// Unresolved or malformed commands cannot be labelled empty to authorize erasure.
export type LocalData = z.infer<typeof localData>;
export function samePartition(a: Partition, b: Partition) {
 return a.userId === b.userId && a.tenantId === b.tenantId && a.membershipId === b.membershipId
  && a.mobileSessionId === b.mobileSessionId && a.deviceInstanceId === b.deviceInstanceId;
}
export interface SecureVault {
 get(key: string): Promise<string | null>;
 set(key: string, value: string): Promise<void>;
 remove(key: string): Promise<void>;
}
export interface PartitionResources {
 open(partition: Partition, create: boolean): Promise<EncryptedStore>;
 destroy(partition: Partition): Promise<void>;
}
/** Implemented by the existing DARK server seam in tests, through its AuthProvider.
 * Source session/CSRF credentials stay in the injected transport, never this cache.
 */
export interface MobileAuthProvider {
 exchange(input: { version: "mobile-exchange.v1"; requestedTenantId: string; commandId: string; deviceInstanceId: string }): Promise<unknown>;
 rotate(input: { version: "mobile-rotation.v1"; commandId: string; deviceInstanceId: string; refresh: MobileSession["refresh"] }, partition: Partition): Promise<unknown>;
 reconnect(input: { version: "mobile-reconnect.v1"; deviceInstanceId: string; access: MobileSession["access"] }, partition: Partition): Promise<unknown>;
 deviceCommand(input: { version: "mobile-device-command.v1"; commandId: string; deviceInstanceId: string; requestedTenantId: string;
 action: "logout" | "tenant_switch"; nextTenantId?: string }, partition: Partition): Promise<unknown>;
}
export class MobileClientError extends Error {
 constructor(readonly code: "MOBILE_DISABLED" | "MOBILE_BUSY" | "MOBILE_DENIED" | "MOBILE_RECOVERY_REQUIRED" | "MOBILE_UNSYNCED_POLICY_HOLD") { super(code); this.name = "MobileClientError"; }
}
