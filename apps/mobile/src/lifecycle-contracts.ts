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
export const localData = z.object({ version: z.literal("mobile-cache.v1"), metadata: mobileLocalMetadataV1,
 sync: syncDeviceCacheV1.nullable().prefault(null),
 queue: z.array(z.unknown()).max(1000).prefault([]),
 captures: z.array(z.object({ item: offlineCaptureItemV1, text: z.string().startsWith("Fictional ").max(5000) }).strict()).max(100).prefault([]),
 notes: z.array(z.object({ id: z.guid(), text: z.string().startsWith("Fictional ").max(500) }).strict()).max(100),
 // Small synthetic attachments are stored INSIDE SQLCipher, never in a plaintext media directory.
 files: z.array(z.object({ id: z.guid(), base64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u).max(131072) }).strict()).max(8),
 unsyncedWork: z.enum(["none", "present", "unknown"]),
}).strict().refine(data => data.unsyncedWork !== "none" || (data.captures.every(c => c.item.status === "verified") && data.queue.every(raw => {
 const parsed = nativeQueueEntryV1.safeParse(raw); return parsed.success && parsed.data.reconciliation.item.status === "recorded"
  && parsed.data.reconciliation.item.commandId === parsed.data.upload.commandId
  && parsed.data.reconciliation.item.payloadHash === parsed.data.upload.payloadHash;
})), "Unresolved queue or capture requires cleanup hold");
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
