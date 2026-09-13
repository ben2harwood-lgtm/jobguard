import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const retentionClassSchema = z.enum([
  "temporary_upload",
  "pilot_evidence",
  "derived_preview",
]);
export type RetentionClass = z.infer<typeof retentionClassSchema>;

export const evidenceTypeSchema = z.enum(["site_photo", "document"]);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const uploadRequestV1Schema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().uuid(),
  jobId: z.string().uuid(),
  scopeId: z.string().uuid().nullable(),
  evidenceType: evidenceTypeSchema,
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  retentionClass: retentionClassSchema,
  captureTime: z.string().datetime().nullable(),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  expectedBytes: z.number().int().positive().max(20 * 1024 * 1024),
  idempotencyKey: z.string().min(1).max(200),
});
export type UploadRequestV1 = z.infer<typeof uploadRequestV1Schema>;

export interface TenantAccess {
  readonly tenantId: string;
}

export class EvidenceStoreError extends Error {
  constructor(readonly code: "ACCESS_DENIED" | "INVALID_UPLOAD" | "NOT_FOUND" | "EXPIRED" | "CONFLICT" | "POLICY_REVIEW_REQUIRED", message: string) {
    super(message);
    this.name = "EvidenceStoreError";
  }
}

interface ObjectVersion {
  key: string;
  versionId: string;
  bytes: Uint8Array;
  contentType: string;
  createdAt: Date;
}

/** Contract fake for a private, version-aware object store. It intentionally has no public URL API. */
export class InMemoryVersionedObjectStore {
  readonly #objects = new Map<string, ObjectVersion[]>();

  put(key: string, bytes: Uint8Array, contentType: string, now = new Date()): ObjectVersion {
    const version = { key, versionId: randomUUID(), bytes: Uint8Array.from(bytes), contentType, createdAt: now };
    const versions = this.#objects.get(key) ?? [];
    versions.push(version);
    this.#objects.set(key, versions);
    return version;
  }

  getExact(key: string, versionId: string): ObjectVersion | undefined {
    const found = this.#objects.get(key)?.find((value) => value.versionId === versionId);
    return found && { ...found, bytes: Uint8Array.from(found.bytes) };
  }

  deleteExact(key: string, versionId: string): boolean {
    const versions = this.#objects.get(key);
    if (!versions) return false;
    const remaining = versions.filter((value) => value.versionId !== versionId);
    if (remaining.length === versions.length) return false;
    if (remaining.length === 0) this.#objects.delete(key);
    else this.#objects.set(key, remaining);
    return true;
  }
}

export interface EvidenceRecord {
  evidenceId: string;
  tenantId: string;
  jobId: string;
  scopeId: string | null;
  evidenceType: EvidenceType;
  role: "original" | "preview";
  originalEvidenceId: string | null;
  retentionClass: RetentionClass;
  state: "verified" | "rejected";
  objectKey: string;
  objectVersionId: string;
  sha256: string;
  byteLength: number;
  contentType: string;
  captureTime: string | null;
  receivedAt: string;
  verifiedAt: string;
}

interface UploadSession {
  uploadId: string;
  request: UploadRequestV1;
  objectKey: string;
  versionId: string | null;
  expiresAt: Date;
  state: "pending" | "quarantined" | "verified" | "rejected";
  evidenceId: string | null;
  receivedAt: Date | null;
}

interface Capability { tenantId: string; uploadId?: string; evidenceId?: string; expiresAt: Date; operation: "upload" | "download" }

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const safeEqual = (left: string, right: string) => left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));

export class EvidenceService {
  readonly #uploads = new Map<string, UploadSession>();
  readonly #evidence = new Map<string, EvidenceRecord>();
  readonly #idempotency = new Map<string, { fingerprint: string; uploadId: string }>();
  readonly #capabilities = new Map<string, Capability>();
  readonly #deletions = new Map<string, { tenantId: string; evidenceId: string; status: "policy_review_required" }>();

  constructor(readonly objects = new InMemoryVersionedObjectStore()) {}

  beginUpload(context: TenantAccess, input: unknown, now = new Date()): { uploadId: string; uploadToken: string; expiresAt: string } {
    const request = uploadRequestV1Schema.parse(input);
    this.#assertTenant(context, request.tenantId);
    if (request.retentionClass === "derived_preview") throw new EvidenceStoreError("INVALID_UPLOAD", "A preview must be derived from a verified original");
    const fingerprint = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    const idempotencyId = `${request.tenantId}:${request.idempotencyKey}`;
    const prior = this.#idempotency.get(idempotencyId);
    if (prior) {
      if (!safeEqual(prior.fingerprint, fingerprint)) throw new EvidenceStoreError("CONFLICT", "Idempotency key payload differs");
      const session = this.#uploads.get(prior.uploadId)!;
      return { uploadId: session.uploadId, ...this.#capability(session, "upload", now) };
    }
    const uploadId = randomUUID();
    const session: UploadSession = { uploadId, request, objectKey: `tenants/${request.tenantId}/evidence/${randomUUID()}`, versionId: null, expiresAt: new Date(now.getTime() + 5 * 60_000), state: "pending", evidenceId: null, receivedAt: null };
    this.#uploads.set(uploadId, session);
    this.#idempotency.set(idempotencyId, { fingerprint, uploadId });
    return { uploadId, ...this.#capability(session, "upload", now) };
  }

  upload(context: TenantAccess, token: string, bytes: Uint8Array, contentType: string, now = new Date()): string {
    const capability = this.#useCapability(context, token, "upload", now);
    const session = this.#uploads.get(capability.uploadId!);
    if (!session || session.state !== "pending") throw new EvidenceStoreError("INVALID_UPLOAD", "Upload is not pending");
    this.#assertTenant(context, session.request.tenantId);
    const object = this.objects.put(session.objectKey, bytes, contentType, now);
    session.versionId = object.versionId;
    session.receivedAt = now;
    session.state = "quarantined";
    return object.versionId;
  }

  finalize(context: TenantAccess, uploadId: string, now = new Date()): EvidenceRecord {
    const session = this.#uploads.get(uploadId);
    if (!session) throw new EvidenceStoreError("NOT_FOUND", "Upload not found");
    this.#assertTenant(context, session.request.tenantId);
    if (session.evidenceId) return this.getMetadata(context, session.evidenceId);
    if (session.state !== "quarantined" || !session.versionId || !session.receivedAt) throw new EvidenceStoreError("INVALID_UPLOAD", "Upload has no complete object version");
    const object = this.objects.getExact(session.objectKey, session.versionId);
    if (!object) throw new EvidenceStoreError("INVALID_UPLOAD", "Exact uploaded object version is missing");
    const actualHash = digest(object.bytes);
    const valid = object.bytes.byteLength === session.request.expectedBytes && object.contentType === session.request.contentType && safeEqual(actualHash, session.request.expectedSha256);
    const evidenceId = randomUUID();
    const record: EvidenceRecord = { evidenceId, tenantId: session.request.tenantId, jobId: session.request.jobId, scopeId: session.request.scopeId, evidenceType: session.request.evidenceType, role: "original", originalEvidenceId: null, retentionClass: session.request.retentionClass, state: valid ? "verified" : "rejected", objectKey: object.key, objectVersionId: object.versionId, sha256: actualHash, byteLength: object.bytes.byteLength, contentType: object.contentType, captureTime: session.request.captureTime, receivedAt: session.receivedAt.toISOString(), verifiedAt: now.toISOString() };
    session.state = record.state;
    session.evidenceId = evidenceId;
    this.#evidence.set(evidenceId, record);
    if (!valid) throw new EvidenceStoreError("INVALID_UPLOAD", "Server verification rejected hash, size, or type");
    return { ...record };
  }

  createPreview(context: TenantAccess, originalId: string, bytes: Uint8Array, contentType: "image/jpeg" | "image/png", now = new Date()): EvidenceRecord {
    const original = this.getMetadata(context, originalId);
    if (original.state !== "verified" || original.role !== "original") throw new EvidenceStoreError("INVALID_UPLOAD", "Preview requires a verified original");
    const object = this.objects.put(`${original.objectKey}/previews/${randomUUID()}`, bytes, contentType, now);
    const preview: EvidenceRecord = { ...original, evidenceId: randomUUID(), role: "preview", originalEvidenceId: original.evidenceId, retentionClass: "derived_preview", objectKey: object.key, objectVersionId: object.versionId, sha256: digest(bytes), byteLength: bytes.byteLength, contentType, captureTime: null, receivedAt: now.toISOString(), verifiedAt: now.toISOString() };
    this.#evidence.set(preview.evidenceId, preview);
    return { ...preview };
  }

  authorizeDownload(context: TenantAccess, evidenceId: string, now = new Date()): { downloadToken: string; expiresAt: string } {
    const record = this.getMetadata(context, evidenceId);
    if (record.state !== "verified") throw new EvidenceStoreError("ACCESS_DENIED", "Rejected evidence cannot be downloaded");
    const token = randomUUID();
    const expiresAt = new Date(now.getTime() + 60_000);
    this.#capabilities.set(token, { tenantId: record.tenantId, evidenceId, expiresAt, operation: "download" });
    return { downloadToken: token, expiresAt: expiresAt.toISOString() };
  }

  download(context: TenantAccess, token: string, now = new Date()): Uint8Array {
    const capability = this.#useCapability(context, token, "download", now);
    const record = this.getMetadata(context, capability.evidenceId!);
    const object = this.objects.getExact(record.objectKey, record.objectVersionId);
    if (!object || !safeEqual(digest(object.bytes), record.sha256)) throw new EvidenceStoreError("INVALID_UPLOAD", "Registered object version is missing or altered");
    return object.bytes;
  }

  isValidProof(context: TenantAccess, evidenceId: string, expected: { jobId: string; scopeId: string | null; evidenceType: EvidenceType }): boolean {
    try {
      const record = this.getMetadata(context, evidenceId);
      return record.state === "verified" && record.role === "original" && record.jobId === expected.jobId && record.scopeId === expected.scopeId && record.evidenceType === expected.evidenceType && !!this.objects.getExact(record.objectKey, record.objectVersionId);
    } catch { return false; }
  }

  requestDeletion(context: TenantAccess, evidenceId: string): { requestId: string; status: "policy_review_required" } {
    const record = this.getMetadata(context, evidenceId);
    const requestId = randomUUID();
    // D07 is proposed: retained evidence cannot be automatically erased until policy approval.
    this.#deletions.set(requestId, { tenantId: record.tenantId, evidenceId, status: "policy_review_required" });
    return { requestId, status: "policy_review_required" };
  }

  exportTenant(context: TenantAccess): { manifest: Omit<EvidenceRecord, "tenantId">[]; files: Map<string, Uint8Array> } {
    const records = [...this.#evidence.values()].filter((record) => record.tenantId === context.tenantId);
    const files = new Map<string, Uint8Array>();
    for (const record of records) {
      const object = this.objects.getExact(record.objectKey, record.objectVersionId);
      if (object) files.set(`${record.evidenceId}/${record.objectVersionId}`, object.bytes);
    }
    return { manifest: records.map(({ tenantId: _, ...record }) => ({ ...record })), files };
  }

  cleanupOrphanUploads(now = new Date()): number {
    let removed = 0;
    for (const [uploadId, session] of this.#uploads) {
      if (session.evidenceId || session.expiresAt > now || session.request.retentionClass !== "temporary_upload") continue;
      if (session.versionId) this.objects.deleteExact(session.objectKey, session.versionId);
      this.#uploads.delete(uploadId);
      removed++;
    }
    return removed;
  }

  getMetadata(context: TenantAccess, evidenceId: string): EvidenceRecord {
    const record = this.#evidence.get(evidenceId);
    if (!record || record.tenantId !== context.tenantId) throw new EvidenceStoreError("NOT_FOUND", "Evidence not found");
    return { ...record };
  }

  #capability(session: UploadSession, operation: "upload", now: Date): { uploadToken: string; expiresAt: string } {
    const token = randomUUID();
    session.expiresAt = new Date(now.getTime() + 5 * 60_000);
    this.#capabilities.set(token, { tenantId: session.request.tenantId, uploadId: session.uploadId, expiresAt: session.expiresAt, operation });
    return { uploadToken: token, expiresAt: session.expiresAt.toISOString() };
  }

  #useCapability(context: TenantAccess, token: string, operation: "upload" | "download", now: Date): Capability {
    const capability = this.#capabilities.get(token);
    if (!capability || capability.operation !== operation || capability.tenantId !== context.tenantId) throw new EvidenceStoreError("ACCESS_DENIED", "Capability is absent or unauthorized");
    if (capability.expiresAt <= now) throw new EvidenceStoreError("EXPIRED", "Capability expired");
    return capability;
  }

  #assertTenant(context: TenantAccess, tenantId: string): void {
    if (!context || context.tenantId !== tenantId) throw new EvidenceStoreError("ACCESS_DENIED", "Tenant access denied");
  }
}
