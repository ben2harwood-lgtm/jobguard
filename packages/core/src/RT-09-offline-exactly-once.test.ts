import { describe, expect, it } from "vitest";
import { offlineCaptureItemV1, transitionOfflineCaptureV1 as move, planOfflineCaptureUploadV1 as plan, planOfflineCaptureCleanupV1 as cleanup } from "./offline-capture.js";

// HEAD_UNDER_TEST=49755b620ccf0223e64575006cd4590c77595ca2. Synthetic voice bytes only;
// the planner neither transcribes words nor proves actual network/database delivery.
const id = "a9000000-0000-4000-8000-000000000001";
const job = "a9000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64);
const item = () => offlineCaptureItemV1.parse({ version: "offline-capture-item.v1", environment: "synthetic_demo",
  uploadId: id, jobId: job, scopeItemId: null, kind: "voice", contentType: "audio/wav", clientSha256: hash,
  clientMetadata: { deviceCapturedAtMs: 0 }, byteLength: 46, status: "local_only", serverVerification: null });
const receipt = () => ({ evidenceId: id, objectVersionId: "fictional-immutable-v1", sha256: hash, byteLength: 46 });
const request = () => ({ version: "offline-capture-upload.v1", item: move(item(), { type: "start_upload" }),
  online: true, nowMs: 100, currentClientSha256: hash, deviceBytesSent: 46, server: null });
const server = (state: string, nextOffset = 46) => ({ status: { version: "resumable-evidence.v1", state, nextOffset }, expiresAtMs: 200 });

describe("RT-09 offline replay identity", () => {
  it("RT-09-O01 offline recording remains queued across restart and repeated planning", () => {
    const input = { ...request(), online: false };
    const before = structuredClone(input);
    for (let replay = 0; replay < 3; replay++) expect(plan(JSON.parse(JSON.stringify(input)))).toEqual({ uploadId: id, step: "queued" });
    expect(input).toEqual(before);
  });
  it("RT-09-O02 lost begin reply reuses the original upload ID", () => {
    expect(plan(request())).toEqual({ uploadId: id, step: "begin" });
    expect(plan({ ...request(), deviceBytesSent: 0 })).toEqual({ uploadId: id, step: "begin" });
  });
  it("RT-09-O03 interrupted upload resumes at server offset, never the phone's offset", () => {
    const input = { ...request(), server: server("pending", 12) };
    input.item = move(input.item, { type: "transfer_interrupted" });
    expect(plan(input)).toEqual({ uploadId: id, step: "append", offset: 12, byteLength: 34 });
  });
  it("RT-09-O04 lost finalize reply recovers its receipt even after expiry", () => {
    expect(plan({ ...request(), nowMs: 300, server: server("verified") })).toEqual({ uploadId: id, step: "finalize" });
  });
  it("RT-09-O05 two finalize replies preserve one original receipt after serialization", () => {
    const once = move(request().item, { type: "server_finalized", result: receipt() });
    const twice = move(JSON.parse(JSON.stringify(once)), { type: "server_finalized", result: receipt() });
    expect(twice).toEqual(once);
    expect(plan({ ...request(), item: twice })).toEqual({ uploadId: id, step: "done" });
  });
  it("RT-09-O06 changed recording bytes cannot replay under the old identity", () => {
    expect(plan({ ...request(), currentClientSha256: "b".repeat(64) })).toEqual({ uploadId: id, step: "conflict", reason: "changed_hash" });
  });
  it("RT-09-O07 a different finalized object version cannot overwrite the receipt", () => {
    const verified = move(request().item, { type: "server_finalized", result: receipt() });
    expect(() => move(verified, { type: "server_finalized", result: { ...receipt(), objectVersionId: "other-version" } })).toThrow("INVALID_TRANSITION");
    expect(verified.serverVerification).toEqual(receipt());
  });
  it("RT-09-O08 partial offline words are retained under low storage without explicit discard", () => {
    expect(cleanup({ version: "offline-capture-cleanup.v1", item: item(), lowStorage: true, personChoseDiscard: false })).toMatchObject({
      uploadId: id, mayReleaseLocalCopy: false, preserveIntent: true, needsPersonDecision: true });
  });
  it("RT-09-O09 explicit discard releases only the local copy and does not claim server deletion", () => {
    const original = item();
    expect(cleanup({ version: "offline-capture-cleanup.v1", item: original, lowStorage: false, personChoseDiscard: true })).toMatchObject({
      uploadId: id, mayReleaseLocalCopy: true, preserveIntent: false });
    expect(original.status).toBe("local_only");
  });
  it("RT-09-O10 stale finalize for a different upload produces a conflict", () => {
    expect(move(request().item, { type: "server_finalized", result: { ...receipt(), evidenceId: job } })).toMatchObject({ uploadId: id, status: "conflict", serverVerification: null });
  });
});
