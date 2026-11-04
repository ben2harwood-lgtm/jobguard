import { describe, expect, it } from "vitest";
import {
 addOfflineQueueItemV1, applyOfflineUploadResultV1, chooseOfflineQueueItemV1, offlineQueueDisplayV1,
 offlineQueueItemV1, offlineQueueResultCodesV1, offlineQueueRetryV1, restoreOfflineQueueV1, type OfflineQueueItemV1,
} from "./offline-client-queue.js";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
function item(patch: Partial<OfflineQueueItemV1> = {}): OfflineQueueItemV1 {
 return { version: "offline-queue-item.v1", environment: "synthetic_demo", commandId: id(1), jobId: id(100),
  payloadHash: "a".repeat(64), expectedRevision: null, kind: "site_extra", attemptCount: 0,
  nextAttemptAtMs: 0, status: "queued", ...patch };
}
const response = (state: string, code: string, commandId = id(1)) => ({
 version: "offline-upload-result.v1", commandId, state, code, realExternalActions: 0,
});

it("strictly validates saved items and refuses unsupported environment, versions and fields", () => {
 for (const patch of [{ environment: "production" }, { version: "offline-queue-item.v2" }, { tenantId: id(3) },
  { attemptCount: -1 }, { attemptCount: 1.1 }, { nextAttemptAtMs: Infinity }, { expectedRevision: -1 },
  { commandId: "bad" }, { jobId: "bad" }, { payloadHash: "invalid" }, { kind: "payment" }, { status: "sent" }]) {
  expect(offlineQueueItemV1.safeParse({ ...item(), ...patch }).success).toBe(false);
 }
 expect(offlineQueueItemV1.safeParse(item({ kind: "work_state", expectedRevision: 3 })).success).toBe(true);
});

it("deduplicates without replacing lifecycle; refuses changed hash, job, revision or kind", () => {
 const original = item({ status: "needs_review", attemptCount: 4 });
 expect(addOfflineQueueItemV1([original], item())).toEqual([original]);
 for (const patch of [{ payloadHash: "b".repeat(64) }, { jobId: id(101) }, { expectedRevision: 2 }, { kind: "work_state" as const }]) {
  expect(() => addOfflineQueueItemV1([original], item(patch))).toThrow("OFFLINE_QUEUE_IDENTITY_CONFLICT");
 }
 expect(addOfflineQueueItemV1([original], item({ commandId: id(2) }))).toHaveLength(2);
});

describe("all response codes and state combinations fail closed except exact success/retry pairs", () => {
 for (const code of offlineQueueResultCodesV1) {
  for (const state of ["acknowledged", "rejected", "conflict", "retryable"]) {
   it(`${state}/${code}`, () => {
    const input = item({ status: "sending", attemptCount: 1 });
    const result = applyOfflineUploadResultV1(input, response(state, code), 100);
    const expected = state === "acknowledged" && code === "RECORDED" ? "recorded"
     : state === "retryable" && code === "UNAVAILABLE" ? "queued" : "needs_review";
    expect(result.status).toBe(expected);
    expect(result).toMatchObject({ commandId: input.commandId, jobId: input.jobId,
     payloadHash: input.payloadHash, expectedRevision: input.expectedRevision, attemptCount: 1 });
    expect(input.status).toBe("sending");
   });
  }
 }
});

it("requires review for stale price, accepted version, revoked permission, expired approval and completion conflict", () => {
 for (const code of ["STALE_PRICE", "ACCEPTED_VERSION_CHANGED", "PERMISSION_REVOKED", "APPROVAL_EXPIRED", "COMPLETION_CONFLICT"]) {
  const result = applyOfflineUploadResultV1(item(), response("conflict", code), 0);
  expect(offlineQueueDisplayV1(result)).toBe("needs review");
  expect(chooseOfflineQueueItemV1([result], Number.MAX_SAFE_INTEGER).next).toBeNull();
 }
});

it("never claims commercial completion, even on an unexpected RECORDED acknowledgment", () => {
 const intent = item({ kind: "commercial_intent", expectedRevision: 1 });
 expect(offlineQueueDisplayV1(intent)).toBe("queued");
 expect(offlineQueueDisplayV1(chooseOfflineQueueItemV1([intent], 0).next)).toBe("sending");
 for (const code of offlineQueueResultCodesV1) {
  expect(offlineQueueDisplayV1(applyOfflineUploadResultV1(intent, response("acknowledged", code), 0))).toBe("needs review");
 }
 expect(offlineQueueDisplayV1({ ...intent, status: "recorded" })).toBe("needs review");
});

it("unknown, malformed, mismatched or external-action responses require review", () => {
 for (const raw of [response("acknowledged", "FUTURE_CODE"), response("retryable", "FUTURE_CODE"),
  response("acknowledged", "RECORDED", id(2)), { ...response("acknowledged", "RECORDED"), realExternalActions: 1 },
  { ...response("acknowledged", "RECORDED"), extra: true }, null]) {
  expect(applyOfflineUploadResultV1(item(), raw, 0).status).toBe("needs_review");
 }
 for (const status of ["recorded", "needs_review"] as const) {
  expect(applyOfflineUploadResultV1(item({ status }), response("retryable", "UNAVAILABLE"), 0)).toEqual(item({ status }));
 }
});

it("uses capped exponential backoff and bounded caller jitter with safe timestamp arithmetic", () => {
 for (let attemptCount = 1; attemptCount < offlineQueueRetryV1.maxAttempts; attemptCount++) {
  const retry = applyOfflineUploadResultV1(item({ attemptCount }), response("retryable", "UNAVAILABLE"), 100, 37);
  expect(retry.nextAttemptAtMs).toBe(100 + Math.min(60_000, 1_000 * 2 ** (attemptCount - 1) + 37));
  expect(chooseOfflineQueueItemV1([retry], retry.nextAttemptAtMs - 1).next).toBeNull();
  expect(chooseOfflineQueueItemV1([retry], retry.nextAttemptAtMs).next?.attemptCount).toBe(attemptCount + 1);
 }
 expect(applyOfflineUploadResultV1(item({ attemptCount: 7 }), response("retryable", "UNAVAILABLE"), Number.MAX_SAFE_INTEGER, 1000).nextAttemptAtMs).toBe(Number.MAX_SAFE_INTEGER);
 for (const jitter of [-1, 1001, 0.5]) expect(() => applyOfflineUploadResultV1(item(), response("retryable", "UNAVAILABLE"), 0, jitter)).toThrow();
 expect(() => chooseOfflineQueueItemV1([item()], -1)).toThrow();
});

it("poison items and exhausted attempts allow unrelated work while retaining same-job order", () => {
 for (const first of [item({ status: "needs_review" }), item({ attemptCount: 8 }), item({ status: "sending" }), item({ nextAttemptAtMs: 100 })]) {
  const second = item({ commandId: id(2) });
  const unrelated = item({ commandId: id(3), jobId: id(101) });
  const chosen = chooseOfflineQueueItemV1([first, second, unrelated], 0);
  expect(chosen.next?.commandId).toBe(id(3));
  expect(chosen.items[1]).toEqual(second);
  if (first.attemptCount === 8) expect(chosen.items[0]?.status).toBe("needs_review");
 }
 const chosen = chooseOfflineQueueItemV1([item({ status: "recorded" }), item({ commandId: id(2) })], 0);
 expect(chosen.next?.commandId).toBe(id(2));
 expect(applyOfflineUploadResultV1(item({ attemptCount: 8 }), response("retryable", "UNAVAILABLE"), 0).status).toBe("needs_review");
});

it("restores valid entries independently, retains terminal states and quarantines duplicate identity conflicts", () => {
 const saved = [item({ status: "sending", attemptCount: 1 }), { ...item(), version: "old" },
  item({ commandId: id(2), status: "recorded" }), item({ commandId: id(3), status: "needs_review" }), item()];
 const restored = restoreOfflineQueueV1(JSON.parse(JSON.stringify(saved)));
 expect(restored.refused).toEqual([{ index: 1, code: "OFFLINE_QUEUE_INVALID_ITEM" }]);
 expect(restored.items.map(entry => entry.status)).toEqual(["queued", "recorded", "needs_review"]);
 expect(restored.items[0]).toEqual({ ...saved[0], status: "queued" });
 const conflict = restoreOfflineQueueV1([item(), item({ payloadHash: "b".repeat(64) }), item({ commandId: id(2), jobId: id(101) })]);
 expect(conflict.refused).toEqual([{ index: 1, code: "OFFLINE_QUEUE_IDENTITY_CONFLICT" }]);
 expect(conflict.items[0]?.status).toBe("needs_review");
 expect(chooseOfflineQueueItemV1(conflict.items, 0).next?.commandId).toBe(id(2));
});

it("generated retry/restart/reinstall histories preserve one identity and bound attempts", () => {
 for (let seed = 1; seed <= 64; seed++) {
  let items = [item({ expectedRevision: seed })];
  let now = 0;
  for (let step = 0; step < 12; step++) {
   items = addOfflineQueueItemV1(items, item({ expectedRevision: seed }));
   const selection = chooseOfflineQueueItemV1(items, now);
   items = selection.items;
   // Reinstall while sending recovers the same unknown-outcome command, never a new ID.
   if ((seed + step) % 3 === 0) items = restoreOfflineQueueV1(JSON.parse(JSON.stringify(items))).items;
   else if (selection.next) items = [applyOfflineUploadResultV1(selection.next, response("retryable", "UNAVAILABLE"), now, seed)];
   items = restoreOfflineQueueV1(JSON.parse(JSON.stringify(items))).items;
   expect(items).toHaveLength(1);
   expect(items[0]).toMatchObject({ commandId: id(1), jobId: id(100), payloadHash: "a".repeat(64), expectedRevision: seed });
   expect(items[0]!.attemptCount).toBeLessThanOrEqual(8);
   now += 61_000;
  }
  expect(items[0]?.status).toBe("needs_review");
 }
});

it("a lost acknowledgment recovered after reinstall records the original command once", () => {
 const original = item({ kind: "work_state", expectedRevision: 7 });
 const first = chooseOfflineQueueItemV1([original], 0);
 const saved = restoreOfflineQueueV1(JSON.parse(JSON.stringify(first.items)));
 const replay = chooseOfflineQueueItemV1(saved.items, 0);
 expect(replay.next).toMatchObject({ commandId: original.commandId, payloadHash: original.payloadHash, expectedRevision: 7, attemptCount: 2 });
 const recorded = applyOfflineUploadResultV1(replay.next, response("acknowledged", "RECORDED"), 0);
 expect(offlineQueueDisplayV1(recorded)).toBe("recorded");
 const restored = restoreOfflineQueueV1([recorded, original]);
 expect(restored.items).toEqual([recorded]);
 expect(chooseOfflineQueueItemV1(restored.items, 1000).next).toBeNull();
});
