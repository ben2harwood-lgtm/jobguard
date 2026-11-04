import { expect, it } from "vitest";
import { offlineQueueResultCodesV1, applyOfflineUploadResultV1, offlineQueueItemV1 } from "@jobguard/core";
import { offlineUploadResultV1 } from "./offline-upload.contracts.js";

it("M3-4 client rules explicitly know every API result code and handle every state", () => {
 expect([...offlineQueueResultCodesV1].sort()).toEqual([...offlineUploadResultV1.shape.code.options].sort());
 const item = offlineQueueItemV1.parse({ version: "offline-queue-item.v1", environment: "synthetic_demo",
  commandId: "00000000-0000-7000-8000-000000000001", jobId: "00000000-0000-7000-8000-000000000002",
  payloadHash: "a".repeat(64), expectedRevision: null, kind: "site_extra", attemptCount: 1, nextAttemptAtMs: 0, status: "sending" });
 for (const code of offlineUploadResultV1.shape.code.options) {
  for (const state of offlineUploadResultV1.shape.state.options) {
   const response = offlineUploadResultV1.parse({ version: "offline-upload-result.v1", commandId: item.commandId, state, code, realExternalActions: 0 });
   const expected = state === "acknowledged" && code === "RECORDED" ? "recorded"
    : state === "retryable" && code === "UNAVAILABLE" ? "queued" : "needs_review";
   expect(applyOfflineUploadResultV1(item, response, 0).status, `${state}/${code}`).toBe(expected);
  }
 }
});
