import { expect, it } from "vitest";
import { chooseOfflineQueueItemV1, type OfflineQueueItemV1 } from "./offline-client-queue.js";
import {
 offlineReconciliationV1, offlineReconciliationViewV1, reconcileOfflineResultV1,
 recoverOfflineReconciliationV1, type OfflineReconciliationV1,
} from "./offline-reconciliation.js";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const item = (patch: Partial<OfflineQueueItemV1> = {}): OfflineQueueItemV1 => ({
 version: "offline-queue-item.v1", environment: "synthetic_demo", commandId: id(1), jobId: id(100),
 payloadHash: "a".repeat(64), expectedRevision: 4, kind: "work_state", attemptCount: 1, nextAttemptAtMs: 0, status: "sending", ...patch,
});
const model = (patch: Partial<OfflineQueueItemV1> = {}): OfflineReconciliationV1 => ({
 version: "offline-reconciliation.v1", item: item(patch), reason: null,
});
const response = (code: string, state = "conflict") => ({
 version: "offline-upload-result.v1", commandId: id(1), state, code, realExternalActions: 0,
});
const owner = { userId: id(500), tenantId: id(600) };
const backup = (entries: unknown[]) => ({ version: "offline-recovery.v1", environment: "synthetic_demo", owner, entries });

it("classifies every actionable server refusal without losing its reason or rebasing identity", () => {
 const groups = {
  stale: ["STALE_REVISION", "STALE_PRICE", "ACCEPTED_VERSION_CHANGED", "APPROVAL_EXPIRED"],
  conflicted: ["AUTHORITY_CHANGED", "COMPLETION_CONFLICT", "LOCKED_BILL", "ONLINE_REVIEW_REQUIRED"],
  refused: ["PERMISSION_REVOKED", "INVALID_INTENT", "PAYLOAD_HASH_MISMATCH", "IDEMPOTENCY_CONFLICT"],
 };
 for (const [state, codes] of Object.entries(groups)) for (const code of codes) {
  const original = model();
  const reconciled = reconcileOfflineResultV1(original, response(code), 0);
  expect(reconciled.item).toEqual({ ...original.item, status: "needs_review" });
  expect(offlineReconciliationViewV1(reconciled)).toMatchObject({ state, reason: code, requiresOnlineValidation: true, automaticCommercialActions: false });
  expect(chooseOfflineQueueItemV1([reconciled.item], Number.MAX_SAFE_INTEGER).next).toBeNull();
  expect(reconcileOfflineResultV1(reconciled, response("RECORDED", "acknowledged"), 10)).toEqual(reconciled);
  expect(original.item.status).toBe("sending");
 }
});

it("offers only appropriate human choices; there is no force, rebase, approve, issue, send or pay choice", () => {
 const view = (code: string) => offlineReconciliationViewV1(reconcileOfflineResultV1(model(), response(code), 0));
 expect(view("PERMISSION_REVOKED").choices).toEqual(["keep_pending", "restore_access"]);
 expect(view("IDEMPOTENCY_CONFLICT").choices).toEqual(["keep_pending", "inspect_saved_intent"]);
 expect(view("STALE_PRICE").choices).toEqual(["keep_pending", "review_current_snapshot"]);
 expect(view("COMPLETION_CONFLICT").choices).toEqual(["keep_pending", "review_current_snapshot"]);
});

it("distinguishes waiting, sending, bounded retry and recorded facts from commercial intent", () => {
 expect(offlineReconciliationViewV1(model({ status: "queued", attemptCount: 0 })).state).toBe("queued");
 expect(offlineReconciliationViewV1(model()).state).toBe("sending");
 const retry = reconcileOfflineResultV1(model(), response("UNAVAILABLE", "retryable"), 500);
 expect(offlineReconciliationViewV1(retry)).toMatchObject({ state: "retried", choices: ["keep_pending", "wait_for_retry"] });
 expect(chooseOfflineQueueItemV1([retry.item], 1499).next).toBeNull();
 expect(chooseOfflineQueueItemV1([retry.item], 1500).next?.commandId).toBe(id(1));
 const exhausted = reconcileOfflineResultV1(model({ attemptCount: 8 }), response("UNAVAILABLE", "retryable"), 0);
 expect(exhausted).toMatchObject({ reason: "RETRY_EXHAUSTED", item: { status: "needs_review", attemptCount: 8 } });
 expect(offlineReconciliationViewV1(reconcileOfflineResultV1(model(), response("RECORDED", "acknowledged"), 0)))
  .toMatchObject({ state: "recorded", choices: [], requiresOnlineValidation: false });
 const commercial = reconcileOfflineResultV1(model({ kind: "commercial_intent" }), response("RECORDED", "acknowledged"), 0);
 expect(offlineReconciliationViewV1(commercial)).toMatchObject({ state: "conflicted", reason: "ONLINE_REVIEW_REQUIRED", automaticCommercialActions: false });
});

it("malformed, unknown, mismatched and impossible response pairs fail closed", () => {
 for (const raw of [null, response("FUTURE_CODE"), response("RECORDED"), response("STALE_PRICE", "retryable"),
  { ...response("RECORDED", "acknowledged"), commandId: id(2) },
  { ...response("RECORDED", "acknowledged"), realExternalActions: 1 }]) {
  const result = reconcileOfflineResultV1(model(), raw, 0);
  expect(result).toMatchObject({ reason: "UNKNOWN_RESULT", item: { status: "needs_review" } });
 }
 expect(offlineReconciliationV1.safeParse({ ...model(), approval: true }).success).toBe(false);
 expect(offlineReconciliationV1.safeParse({ ...model(), reason: "some arbitrary provider text" }).success).toBe(false);
});

it("reinstall refuses changed user/tenant and unsupported backups without releasing any entries", () => {
 for (const current of [{ ...owner, userId: id(501) }, { ...owner, tenantId: id(601) }]) {
  expect(() => recoverOfflineReconciliationV1(backup([item()]), current)).toThrow("OFFLINE_RECOVERY_OWNER_MISMATCH");
 }
 for (const raw of [{ ...backup([]), version: "offline-recovery.v2" }, { ...backup([]), environment: "production" },
  { ...backup([]), accessToken: "fictional" }, null]) {
  expect(() => recoverOfflineReconciliationV1(raw, owner)).toThrow("OFFLINE_RECOVERY_INVALID_BUNDLE");
 }
 expect(() => recoverOfflineReconciliationV1(backup([]), {})).toThrow("OFFLINE_RECOVERY_INVALID_BUNDLE");
});

it("recovers original unknown-outcome identity; malformed and conflicting entries cannot poison other jobs", () => {
 const recovered = recoverOfflineReconciliationV1(backup([item(), null,
  item({ payloadHash: "b".repeat(64) }), item({ commandId: id(2), jobId: id(101) })]), owner);
 expect(recovered.refused).toEqual([{ index: 1, code: "OFFLINE_QUEUE_INVALID_ITEM" }, { index: 2, code: "OFFLINE_QUEUE_IDENTITY_CONFLICT" }]);
 expect(recovered.entries[0]).toMatchObject({ reason: "RECOVERED_REVIEW", item: { status: "needs_review" } });
 expect(chooseOfflineQueueItemV1(recovered.entries.map(entry => entry.item), 0).next?.commandId).toBe(id(2));
 const interrupted = recoverOfflineReconciliationV1(backup([item()]), owner).entries[0]!;
 expect(interrupted.item).toEqual(item({ status: "queued" }));
 expect(chooseOfflineQueueItemV1([interrupted.item], 0).next).toEqual(item({ attemptCount: 2 }));
});
