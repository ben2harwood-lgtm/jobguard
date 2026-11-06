import { z } from "zod";
import {
 applyOfflineUploadResultV1, offlineQueueItemV1, offlineQueueResultCodesV1,
 offlineQueueUploadResultV1, restoreOfflineQueueV1,
} from "./offline-client-queue.js";

const reasons = [...offlineQueueResultCodesV1, "UNKNOWN_RESULT", "RETRY_EXHAUSTED", "RECOVERED_REVIEW"] as const;
/** Metadata only. No body, credentials, approval, recipient or money is stored here. */
export const offlineReconciliationV1 = z.object({
 version: z.literal("offline-reconciliation.v1"),
 item: offlineQueueItemV1,
 reason: z.enum(reasons).nullable(),
}).strict();
export type OfflineReconciliationV1 = z.infer<typeof offlineReconciliationV1>;

/** Terminal review reasons survive delayed acknowledgments and reconnects. */
export function reconcileOfflineResultV1(raw: unknown, response: unknown, nowMs: number, jitterMs = 0): OfflineReconciliationV1 {
 const saved = offlineReconciliationV1.parse(raw);
 const item = applyOfflineUploadResultV1(saved.item, response, nowMs, jitterMs);
 if (saved.item.status === "recorded" || saved.item.status === "needs_review") return saved;
 const parsed = offlineQueueUploadResultV1.safeParse(response);
 const known = parsed.success && parsed.data.commandId === item.commandId &&
  offlineQueueResultCodesV1.some(code => code === parsed.data.code);
 let reason: OfflineReconciliationV1["reason"] = "UNKNOWN_RESULT";
 if (known) {
  const result = parsed.data;
  const valid = (result.state === "acknowledged" && result.code === "RECORDED") ||
   (result.state === "retryable" && result.code === "UNAVAILABLE") ||
   ((result.state === "rejected" || result.state === "conflict") && result.code !== "RECORDED" && result.code !== "UNAVAILABLE");
  if (valid) reason = result.code as typeof offlineQueueResultCodesV1[number];
  if (result.state === "retryable" && result.code === "UNAVAILABLE" && item.status === "needs_review") reason = "RETRY_EXHAUSTED";
  if (result.state === "acknowledged" && result.code === "RECORDED" && item.kind === "commercial_intent") reason = "ONLINE_REVIEW_REQUIRED";
 }
 return { ...saved, item, reason };
}

export type OfflineReconciliationChoiceV1 = "keep_pending" | "wait_for_retry" | "check_server_result" |
 "review_current_snapshot" | "restore_access" | "inspect_saved_intent";

/** Choices are navigation/advice, never a command executor or permission to rebase/rekey. */
export function offlineReconciliationViewV1(raw: unknown): {
 state: "queued" | "sending" | "retried" | "recorded" | "stale" | "conflicted" | "refused" | "needs_review";
 reason: OfflineReconciliationV1["reason"];
 choices: readonly OfflineReconciliationChoiceV1[];
 requiresOnlineValidation: boolean;
 automaticCommercialActions: false;
} {
 const { item, reason } = offlineReconciliationV1.parse(raw);
 const common = { reason, requiresOnlineValidation: item.status !== "recorded", automaticCommercialActions: false as const };
 if (item.status === "recorded") return { ...common, state: "recorded", choices: [] };
 if (item.status === "sending") return { ...common, state: "sending", choices: ["keep_pending", "check_server_result"] };
 if (item.status === "queued") return { ...common, state: item.attemptCount ? "retried" : "queued", choices: ["keep_pending", "wait_for_retry"] };
 if (reason === "PERMISSION_REVOKED") return { ...common, state: "refused", choices: ["keep_pending", "restore_access"] };
 if (reason === "INVALID_INTENT" || reason === "PAYLOAD_HASH_MISMATCH" || reason === "IDEMPOTENCY_CONFLICT") {
  return { ...common, state: "refused", choices: ["keep_pending", "inspect_saved_intent"] };
 }
 if (reason === "STALE_REVISION" || reason === "STALE_PRICE" || reason === "ACCEPTED_VERSION_CHANGED" || reason === "APPROVAL_EXPIRED") {
  return { ...common, state: "stale", choices: ["keep_pending", "review_current_snapshot"] };
 }
 if (reason === "AUTHORITY_CHANGED" || reason === "COMPLETION_CONFLICT" || reason === "LOCKED_BILL" || reason === "ONLINE_REVIEW_REQUIRED") {
  return { ...common, state: "conflicted", choices: ["keep_pending", "review_current_snapshot"] };
 }
 return { ...common, state: "needs_review", choices: ["keep_pending", "check_server_result", "inspect_saved_intent"] };
}

const owner = z.object({ userId: z.guid(), tenantId: z.guid() }).strict();
/** Synthetic decoded backup boundary. Caller must authenticate the current owner online first. */
export const offlineRecoveryBundleV1 = z.object({
 version: z.literal("offline-recovery.v1"), environment: z.literal("synthetic_demo"),
 owner, entries: z.array(z.unknown()),
}).strict();
export class OfflineRecoveryError extends Error {
 constructor(readonly code: "OFFLINE_RECOVERY_INVALID_BUNDLE" | "OFFLINE_RECOVERY_OWNER_MISMATCH") {
  super(code); this.name = "OfflineRecoveryError";
 }
}

/** Does not decrypt, reconstruct lost bodies, restore authorization, or mark semantic effects complete. */
export function recoverOfflineReconciliationV1(raw: unknown, currentOwner: unknown): {
 entries: OfflineReconciliationV1[];
 refused: ReturnType<typeof restoreOfflineQueueV1>["refused"];
} {
 const bundle = offlineRecoveryBundleV1.safeParse(raw);
 const current = owner.safeParse(currentOwner);
 if (!bundle.success || !current.success) throw new OfflineRecoveryError("OFFLINE_RECOVERY_INVALID_BUNDLE");
 if (bundle.data.owner.userId !== current.data.userId || bundle.data.owner.tenantId !== current.data.tenantId) {
  throw new OfflineRecoveryError("OFFLINE_RECOVERY_OWNER_MISMATCH");
 }
 const restored = restoreOfflineQueueV1(bundle.data.entries);
 return { entries: restored.items.map(item => ({ version: "offline-reconciliation.v1", item,
  reason: item.status === "needs_review" ? "RECOVERED_REVIEW" : null })), refused: restored.refused };
}
