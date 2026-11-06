import { expect, it } from "vitest";
import { chooseOfflineQueueItemV1, restoreOfflineQueueV1, type OfflineQueueItemV1 } from "./offline-client-queue.js";
import { offlineReconciliationViewV1, reconcileOfflineResultV1, type OfflineReconciliationV1 } from "./offline-reconciliation.js";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const item = (patch: Partial<OfflineQueueItemV1> = {}): OfflineQueueItemV1 => ({
 version: "offline-queue-item.v1", environment: "synthetic_demo", commandId: id(1), jobId: id(100),
 payloadHash: "a".repeat(64), expectedRevision: 3, kind: "work_state", attemptCount: 0, nextAttemptAtMs: 0, status: "queued", ...patch,
});

it("generated duplicate/reordered backup histories converge per identity without resurrecting terminal work", () => {
 for (let seed = 1; seed <= 128; seed++) {
  let random = seed;
  const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random; };
  const terminal = seed % 2 ? "recorded" : "needs_review";
  const history = Array.from({ length: 20 }, () => item({ attemptCount: next() % 9, nextAttemptAtMs: next(), status: next() % 2 ? "sending" : "queued" }));
  history.push(item({ status: terminal, attemptCount: 8 }));
  for (let index = history.length - 1; index > 0; index--) {
   const swap = next() % (index + 1);
   [history[index], history[swap]] = [history[swap]!, history[index]!];
  }
  const result = restoreOfflineQueueV1(JSON.parse(JSON.stringify(history)));
  const reversed = restoreOfflineQueueV1([...history].reverse());
  expect(result, `seed ${seed}`).toEqual(reversed);
  expect(result.items).toEqual([item({ status: terminal, attemptCount: 8, nextAttemptAtMs: Math.max(...history.map(entry => entry.nextAttemptAtMs)) })]);
  expect(chooseOfflineQueueItemV1(result.items, Number.MAX_SAFE_INTEGER).next).toBeNull();
  expect(restoreOfflineQueueV1(result.items)).toEqual(result);
 }
});

it("generated retry/reinstall/lost-response histories preserve bindings and never renew commercial authority", () => {
 for (let seed = 1; seed <= 96; seed++) {
  let saved: OfflineReconciliationV1 = { version: "offline-reconciliation.v1", item: item({
   kind: seed % 2 ? "commercial_intent" : "work_state", expectedRevision: seed,
  }), reason: null };
  const original = { ...saved.item };
  for (let step = 0; step < 12; step++) {
   const claimed = chooseOfflineQueueItemV1([saved.item], step * 61_000);
   saved = { ...saved, item: claimed.items[0]! };
   if ((step + seed) % 3 === 0) {
    // A process died with no known result. Recovery may replay only the exact original identity.
    saved = { ...saved, item: restoreOfflineQueueV1([saved.item, original]).items[0]! };
   } else {
    const unavailable = (step + seed) % 4 !== 0;
    saved = reconcileOfflineResultV1(saved, { version: "offline-upload-result.v1", commandId: id(1),
     state: unavailable ? "retryable" : "conflict", code: unavailable ? "UNAVAILABLE" : "STALE_PRICE", realExternalActions: 0 }, step * 61_000);
   }
   expect(saved.item).toMatchObject({ commandId: original.commandId, jobId: original.jobId,
    payloadHash: original.payloadHash, expectedRevision: original.expectedRevision, kind: original.kind });
   expect(saved.item.attemptCount).toBeLessThanOrEqual(8);
   expect(offlineReconciliationViewV1(saved).automaticCommercialActions).toBe(false);
   if (saved.item.status === "needs_review") {
    expect(reconcileOfflineResultV1(saved, { version: "offline-upload-result.v1", commandId: id(1),
     state: "acknowledged", code: "RECORDED", realExternalActions: 0 }, 0)).toEqual(saved);
   }
  }
 }
});
