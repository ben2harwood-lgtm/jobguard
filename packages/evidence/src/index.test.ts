import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EvidenceService, EvidenceStoreError, InMemoryVersionedObjectStore } from "./index.js";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";
const JOB_A = "30000000-0000-4000-8000-000000000003";
const SCOPE_A = "40000000-0000-4000-8000-000000000004";
const context = (tenantId: string) => ({ tenantId });
const photo = new TextEncoder().encode("synthetic jpeg fixture, not real customer data");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const request = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  tenantId: TENANT_A,
  jobId: JOB_A,
  scopeId: SCOPE_A,
  evidenceType: "site_photo",
  contentType: "image/jpeg",
  retentionClass: "pilot_evidence",
  captureTime: "2026-09-12T10:00:00.000Z",
  expectedSha256: sha256(photo),
  expectedBytes: photo.byteLength,
  idempotencyKey: "upload-1",
  ...overrides,
});

function verified(service: EvidenceService, input = request()) {
  const started = service.beginUpload(context(TENANT_A), input, new Date("2026-09-13T10:00:00Z"));
  service.upload(context(TENANT_A), started.uploadToken, photo, "image/jpeg", new Date("2026-09-13T10:01:00Z"));
  return service.finalize(context(TENANT_A), started.uploadId, new Date("2026-09-13T10:02:00Z"));
}

describe("private versioned evidence storage", () => {
  it("registers and fetches the exact verified version even after the key is overwritten", () => {
    const objects = new InMemoryVersionedObjectStore();
    const service = new EvidenceService(objects);
    const evidence = verified(service);
    const replacement = objects.put(evidence.objectKey, new TextEncoder().encode("later version"), "image/jpeg");
    expect(replacement.versionId).not.toBe(evidence.objectVersionId);

    const capability = service.authorizeDownload(context(TENANT_A), evidence.evidenceId);
    expect(service.download(context(TENANT_A), capability.downloadToken)).toEqual(photo);
    expect(evidence.sha256).toBe(sha256(photo));
    expect(evidence.captureTime).toBe("2026-09-12T10:00:00.000Z");
    expect(evidence.receivedAt).toBe("2026-09-13T10:01:00.000Z");
    expect(evidence.verifiedAt).toBe("2026-09-13T10:02:00.000Z");
  });

  it("fails closed across tenants for metadata, capabilities, proof and exports", () => {
    const service = new EvidenceService();
    const evidence = verified(service);
    const download = service.authorizeDownload(context(TENANT_A), evidence.evidenceId);
    expect(() => service.getMetadata(context(TENANT_B), evidence.evidenceId)).toThrow(EvidenceStoreError);
    expect(() => service.download(context(TENANT_B), download.downloadToken)).toThrowError(expect.objectContaining({ code: "ACCESS_DENIED" }));
    expect(service.isValidProof(context(TENANT_B), evidence.evidenceId, { jobId: JOB_A, scopeId: SCOPE_A, evidenceType: "site_photo" })).toBe(false);
    expect(service.exportTenant(context(TENANT_B))).toMatchObject({ manifest: [] });
  });

  it("rejects unfinished, expired, wrong hash/type/size, wrong subject, and preview proof", () => {
    const service = new EvidenceService();
    const pending = service.beginUpload(context(TENANT_A), request({ idempotencyKey: "pending" }), new Date("2026-09-13T10:00:00Z"));
    expect(() => service.finalize(context(TENANT_A), pending.uploadId)).toThrowError(expect.objectContaining({ code: "INVALID_UPLOAD" }));
    expect(() => service.upload(context(TENANT_A), pending.uploadToken, photo, "image/jpeg", new Date("2026-09-13T10:06:00Z"))).toThrowError(expect.objectContaining({ code: "EXPIRED" }));

    for (const [idempotencyKey, override, actualType] of [
      ["bad-hash", { expectedSha256: "0".repeat(64) }, "image/jpeg"],
      ["bad-size", { expectedBytes: photo.byteLength + 1 }, "image/jpeg"],
      ["bad-type", {}, "image/png"],
    ] as const) {
      const upload = service.beginUpload(context(TENANT_A), request({ idempotencyKey, ...override }));
      service.upload(context(TENANT_A), upload.uploadToken, photo, actualType);
      expect(() => service.finalize(context(TENANT_A), upload.uploadId)).toThrowError(expect.objectContaining({ code: "INVALID_UPLOAD" }));
    }

    const evidence = verified(service, request({ idempotencyKey: "proof" }));
    expect(service.isValidProof(context(TENANT_A), evidence.evidenceId, { jobId: randomDifferent(JOB_A), scopeId: SCOPE_A, evidenceType: "site_photo" })).toBe(false);
    const preview = service.createPreview(context(TENANT_A), evidence.evidenceId, new TextEncoder().encode("derived"), "image/jpeg");
    expect(service.isValidProof(context(TENANT_A), preview.evidenceId, { jobId: JOB_A, scopeId: SCOPE_A, evidenceType: "site_photo" })).toBe(false);
    expect(service.getMetadata(context(TENANT_A), evidence.evidenceId).sha256).toBe(sha256(photo));
  });

  it("makes finalization retry idempotent and rejects changed idempotency payloads", () => {
    const service = new EvidenceService();
    const initial = service.beginUpload(context(TENANT_A), request());
    const retry = service.beginUpload(context(TENANT_A), request());
    expect(retry.uploadId).toBe(initial.uploadId);
    expect(() => service.beginUpload(context(TENANT_A), request({ expectedBytes: photo.byteLength + 1 }))).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    service.upload(context(TENANT_A), initial.uploadToken, photo, "image/jpeg");
    const first = service.finalize(context(TENANT_A), initial.uploadId);
    expect(service.finalize(context(TENANT_A), initial.uploadId).evidenceId).toBe(first.evidenceId);
  });

  it("handles retention classes without pretending proposed D07 is approved", () => {
    const service = new EvidenceService();
    const retained = verified(service);
    expect(service.requestDeletion(context(TENANT_A), retained.evidenceId).status).toBe("policy_review_required");

    const temporary = service.beginUpload(context(TENANT_A), request({ retentionClass: "temporary_upload", idempotencyKey: "orphan" }), new Date("2026-09-13T10:00:00Z"));
    service.upload(context(TENANT_A), temporary.uploadToken, photo, "image/jpeg", new Date("2026-09-13T10:01:00Z"));
    const retainedOrphan = service.beginUpload(context(TENANT_A), request({ idempotencyKey: "retained-orphan" }), new Date("2026-09-13T10:00:00Z"));
    service.upload(context(TENANT_A), retainedOrphan.uploadToken, photo, "image/jpeg", new Date("2026-09-13T10:01:00Z"));
    expect(service.cleanupOrphanUploads(new Date("2026-09-13T10:06:00Z"))).toBe(1);

    const exported = service.exportTenant(context(TENANT_A));
    expect(exported.manifest).toHaveLength(1);
    expect(exported.files.get(`${retained.evidenceId}/${retained.objectVersionId}`)).toEqual(photo);
  });
});

function randomDifferent(value: string): string {
  return value === "50000000-0000-4000-8000-000000000005" ? JOB_A : "50000000-0000-4000-8000-000000000005";
}
