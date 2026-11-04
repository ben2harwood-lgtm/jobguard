import { describe, expect, it } from "vitest";
import { offlineCaptureItemV1, transitionOfflineCaptureV1 as move, planOfflineCaptureUploadV1 as plan,
  canOfflineCaptureSatisfyStageV1 as proof, planOfflineCaptureCleanupV1 as cleanup } from "./offline-capture.js";

const id = "10000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const digest = "a".repeat(64);
const capture = () => offlineCaptureItemV1.parse({ version: "offline-capture-item.v1", environment: "synthetic_demo",
  uploadId: id, jobId: other, scopeItemId: id, kind: "photo", clientSha256: digest,
  clientMetadata: { deviceCapturedAtMs: 0 }, contentType: "image/png", byteLength: 2_500_001,
  status: "local_only", serverVerification: null });
const receipt = () => ({ evidenceId: id, objectVersionId: `synthetic-${digest}`, sha256: digest, byteLength: 2_500_001 });
const uploading = () => move(capture(), { type: "start_upload" });
const verified = () => move(uploading(), { type: "server_finalized", result: receipt() });
const request = () => ({ version: "offline-capture-upload.v1", item: uploading(), online: true,
  nowMs: 100, currentClientSha256: digest, deviceBytesSent: 0,
  server: { status: { version: "resumable-evidence.v1", state: "pending", nextOffset: 1_000_000 }, expiresAtMs: 200 } });

describe("M3-5 pure device capture specimens", () => {
  it("restarts and interrupted/short transfers resume from server bytes with unchanged identity", () => {
    const original = request();
    for (const deviceBytesSent of [0, 100, 2_500_001]) {
      const input = JSON.parse(JSON.stringify({ ...original, deviceBytesSent }));
      input.item = move(input.item, { type: "transfer_interrupted" });
      expect(plan(input)).toEqual({ uploadId: id, step: "append", offset: 1_000_000, byteLength: 1_000_000 });
      expect(input.item).toEqual(original.item);
    }
    expect(plan({ ...original, server: null })).toEqual({ uploadId: id, step: "begin" });
    original.server.status.nextOffset = 2_000_000;
    expect(plan(original)).toEqual({ uploadId: id, step: "append", offset: 2_000_000, byteLength: 500_001 });
    original.server.status.nextOffset = original.item.byteLength;
    expect(plan(original)).toEqual({ uploadId: id, step: "finalize" });
    expect(proof(original.item)).toBe(false);
    const confirmed = verified();
    expect(move(JSON.parse(JSON.stringify(confirmed)), { type: "server_finalized", result: receipt() })).toEqual(confirmed);
    expect(plan({ ...original, item: confirmed }).step).toBe("done");
    expect(original.item.scopeItemId).toBe(confirmed.scopeItemId);
    expect(original.item.uploadId).toBe(confirmed.serverVerification?.evidenceId);
  });

  it("exhaustively refuses every event/state combination except the defined moves", () => {
    const states = [capture(), uploading(), verified(), move(uploading(), { type: "server_rejected" }), move(capture(), { type: "conflict" })];
    const actions = [{ type: "start_upload" }, { type: "transfer_interrupted" }, { type: "server_rejected" },
      { type: "conflict" }, { type: "server_finalized", result: receipt() }];
    const allowed: Record<string, string> = { "local_only:start_upload": "uploading", "local_only:conflict": "conflict",
      "uploading:transfer_interrupted": "uploading", "uploading:server_rejected": "rejected",
      "uploading:conflict": "conflict", "uploading:server_finalized": "verified", "verified:server_finalized": "verified" };
    for (const item of states) for (const action of actions) {
      const target = allowed[`${item.status}:${action.type}`];
      if (target) expect(move(item, action).status).toBe(target);
      else expect(() => move(item, action)).toThrow("INVALID_TRANSITION");
      expect(proof(item)).toBe(item.status === "verified");
    }
    expect(() => move(uploading(), { type: "transfer_complete" })).toThrow("INVALID_INPUT");
  });

  it("client hash/time never confer proof and server digest, identity and version remain authoritative", () => {
    for (const deviceCapturedAtMs of [0, 1, Number.MAX_SAFE_INTEGER]) {
      const item = { ...uploading(), clientMetadata: { deviceCapturedAtMs } };
      expect(proof(item)).toBe(false);
      expect(move(item, { type: "server_finalized", result: receipt() }).serverVerification).toEqual(receipt());
      expect(move({ ...item, clientSha256: "b".repeat(64) }, { type: "server_finalized", result: receipt() }).status).toBe("conflict");
    }
    for (const result of [{ ...receipt(), evidenceId: other }, { ...receipt(), byteLength: 1 }, { ...receipt(), sha256: "b".repeat(64) }])
      expect(move(uploading(), { type: "server_finalized", result }).status).toBe("conflict");
    expect(() => move(verified(), { type: "server_finalized", result: { ...receipt(), objectVersionId: "changed-version" } })).toThrow("INVALID_TRANSITION");
    expect(() => proof({ ...capture(), status: "verified" })).toThrow("INVALID_INPUT");
  });

  it("plans conflicts and review rather than renewing closed uploads or inventing identities", () => {
    const raw = request();
    expect(plan({ ...raw, currentClientSha256: "b".repeat(64) })).toEqual({ uploadId: id, step: "conflict", reason: "changed_hash" });
    expect(plan({ ...raw, server: { ...raw.server, status: { ...raw.server.status, nextOffset: raw.item.byteLength + 1 } } }).step).toBe("conflict");
    for (const nowMs of [200, 201]) expect(plan({ ...raw, nowMs })).toEqual({ uploadId: id, step: "review", reason: "expired" });
    for (const state of ["rejected", "quarantined", "verified"]) {
      const input = { ...raw, server: { ...raw.server, status: { ...raw.server.status, state } } };
      expect(plan(input).step).toBe(state === "rejected" ? "review" : state === "verified" ? "finalize" : "status");
      expect(proof(input.item)).toBe(false);
    }
    expect(plan({ ...raw, online: false }).step).toBe("queued");
    expect(plan({ ...raw, item: { ...raw.item, kind: "voice", contentType: "audio/wav" }, online: false }).step).toBe("queued");
    expect(plan({ ...raw, item: { ...raw.item, kind: "text", contentType: "text/plain" } })).toEqual({ uploadId: id, step: "review", reason: "text_transport_unavailable" });
    for (const type of ["server_rejected", "conflict"]) expect(["review", "conflict"]).toContain(plan({ ...raw, item: move(raw.item, { type }) }).step);
  });

  it("low storage and failed uploads retain the person's local copy and intent until explicit discard", () => {
    const items = [capture(), uploading(), move(uploading(), { type: "server_rejected" }), move(uploading(), { type: "conflict" }), verified()];
    for (const item of items) for (const lowStorage of [false, true]) for (const personChoseDiscard of [false, true]) {
      const input = { version: "offline-capture-cleanup.v1", item, lowStorage, personChoseDiscard };
      const snapshot = structuredClone(input), result = cleanup(input);
      expect(result.mayReleaseLocalCopy).toBe(item.status === "verified" || personChoseDiscard);
      expect(result.preserveIntent).toBe(!personChoseDiscard);
      expect(result.needsPersonDecision).toBe(lowStorage && !result.mayReleaseLocalCopy);
      expect(result.uploadId).toBe(id);
      expect(input).toEqual(snapshot);
    }
    expect(cleanup({ version: "offline-capture-cleanup.v1", item: { ...capture(), kind: "voice", contentType: "audio/wav" }, lowStorage: true, personChoseDiscard: false }).voiceProcessing).toBe("queued_until_online");
  });

  it("strict versioned boundaries reject authority fields, invalid sizes, types and hidden overrides", () => {
    for (const field of ["tenantId", "actorId", "price", "approval", "proofAuthority"])
      expect(offlineCaptureItemV1.safeParse({ ...capture(), [field]: id }).success).toBe(false);
    for (const patch of [{ version: "offline-capture-item.v2" }, { environment: "production" }, { byteLength: 25_000_001 },
      { byteLength: 0 }, { byteLength: 1.5 }, { kind: "voice" }, { clientSha256: "wrong" },
      { clientMetadata: { deviceCapturedAtMs: 0, trusted: true } }])
      expect(offlineCaptureItemV1.safeParse({ ...capture(), ...patch }).success).toBe(false);
    expect(offlineCaptureItemV1.safeParse({ ...capture(), byteLength: 25_000_000 }).success).toBe(true);
    expect(() => plan({ ...request(), forceOffset: 0 })).toThrow("INVALID_INPUT");
    expect(() => move(uploading(), { type: "server_finalized", result: { ...receipt(), approval: true } })).toThrow("INVALID_INPUT");
    expect(() => cleanup({ version: "offline-capture-cleanup.v1", item: capture(), lowStorage: true, personChoseDiscard: false, delete: true })).toThrow("INVALID_INPUT");
  });
});
