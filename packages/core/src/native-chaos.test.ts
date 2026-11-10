import { expect, it } from "vitest";
import { chooseOfflineQueueItemV1, restoreOfflineQueueV1, type OfflineQueueItemV1 } from "./offline-client-queue.js";
import { reconcileOfflineResultV1, offlineReconciliationViewV1 } from "./offline-reconciliation.js";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const item = (n = 1): OfflineQueueItemV1 => ({
 version: "offline-queue-item.v1", environment: "synthetic_demo", commandId: id(n), jobId: id(10000 + n),
 payloadHash: "a".repeat(64), expectedRevision: 0, kind: "work_state", status: "queued", attemptCount: 0, nextAttemptAtMs: 0,
});
const result = (commandId: string, state: string, code: string) => ({
 version: "offline-upload-result.v1", commandId, state, code, realExternalActions: 0,
});
// Scripted metadata snapshots only: not an encrypted store, transport or simulated server.
it.each(["airplane mode during request", "app killed before response"])("%s preserves unknown-outcome identity through restart and duplicate acknowledgment", () => {
 const first = chooseOfflineQueueItemV1([item()], 100);
 const snapshot: unknown[] = JSON.parse(JSON.stringify(first.items));
 const restored = restoreOfflineQueueV1(snapshot);
 expect(restored.refused).toEqual([]);
 const replay = chooseOfflineQueueItemV1(restored.items, 100).next!;
 expect(replay).toEqual({ ...first.next, attemptCount: 2 });
 const recorded = reconcileOfflineResultV1({ version: "offline-reconciliation.v1", item: replay, reason: null },
  result(replay.commandId, "acknowledged", "RECORDED"), 100);
 expect(offlineReconciliationViewV1(recorded).state).toBe("recorded");
 expect(reconcileOfflineResultV1(recorded, result(replay.commandId, "retryable", "UNAVAILABLE"), 200)).toEqual(recorded);
 expect(restoreOfflineQueueV1([recorded.item, ...snapshot]).items).toEqual([recorded.item]);
});

it.each([0, 4_070_908_800_000])("clock jump to %s never clears review or a retry deadline", now => {
 const sending = chooseOfflineQueueItemV1([item()], 100).next!;
 const waiting = reconcileOfflineResultV1({ version: "offline-reconciliation.v1", item: sending, reason: null },
  result(sending.commandId, "retryable", "UNAVAILABLE"), 100);
 expect(chooseOfflineQueueItemV1([waiting.item], 0).next).toBeNull();
 const refused = reconcileOfflineResultV1(waiting, result(sending.commandId, "rejected", "PERMISSION_REVOKED"), now);
 expect(offlineReconciliationViewV1(refused)).toMatchObject({ state: "refused", reason: "PERMISSION_REVOKED", automaticCommercialActions: false });
 expect(chooseOfflineQueueItemV1([refused.item], now).next).toBeNull();
 expect(refused.item).toEqual({ ...waiting.item, status: "needs_review" });
});

it("schema upgrade quarantines unsupported saved entries while preserving supported intent", () => {
 const saved = [item(), { ...item(2), version: "offline-queue-item.v2" }, item(3)];
 const restored = restoreOfflineQueueV1(JSON.parse(JSON.stringify(saved)));
 expect(restored.refused).toEqual([{ index: 1, code: "OFFLINE_QUEUE_INVALID_ITEM" }]);
 expect(restored.items).toEqual([item(), item(3)]);
 expect(saved[1]?.version).toBe("offline-queue-item.v2"); // caller must retain refused source for recovery
});

it("a full synthetic backlog retains every identity and drains safe work past a poison job", () => {
 // Fixture size, not a new product capacity limit or evidence of disk-full handling.
 const saved = Array.from({ length: 128 }, (_, n) => item(n + 1));
 saved[0] = { ...saved[0]!, status: "needs_review", attemptCount: 8 };
 const sameJob = { ...item(129), jobId: saved[0]!.jobId };
 let queue = restoreOfflineQueueV1([...saved, sameJob]).items;
 for (let n = 2; n <= 128; n++) {
  const claim = chooseOfflineQueueItemV1(queue, 0);
  expect(claim.next?.commandId).toBe(id(n));
  const reconciled = reconcileOfflineResultV1({ version: "offline-reconciliation.v1", item: claim.next!, reason: null },
   result(id(n), "acknowledged", "RECORDED"), 0);
  queue = claim.items.map(entry => entry.commandId === id(n) ? reconciled.item : entry);
 }
 expect(chooseOfflineQueueItemV1(queue, 0).next).toBeNull();
 expect(queue).toHaveLength(129);
 expect(queue[0]).toEqual(saved[0]);
 expect(queue[128]).toEqual(sameJob);
 expect(queue.slice(1, 128).every(entry => entry.status === "recorded")).toBe(true);
 expect(new Set(queue.map(entry => entry.commandId)).size).toBe(129);
});
