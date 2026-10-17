// ENT-3d fixtures. Photos are made by the merged evidence pipeline (beginUpload, then finalize) with a small in-memory byte store.
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { siteExtraContentSha256V1, residentConfirmationDocumentV1 } from "@jobguard/core";
import { EvidenceService, derivedUuid, sha256Hex, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { ownerTx, note, description, counts } from "./site-extra-fixtures.js"; import type { Cluster } from "./extra-fixtures.js";
import type { Fixture } from "./extra-fixtures.js";
export * from "./site-extra-fixtures.js";

export class MemoryStorage implements PrivateVersionedStorage {
 versions = new Map<string, StoredObject>();
 put(key: string, versionId: string, bytes: Uint8Array, contentType = "image/png") { this.versions.set(`${key}:${versionId}`, { key, versionId, bytes, byteLength: bytes.length, contentType }); }
 async createUploadUrl({ key, expiresInSeconds }: { key: string; contentType: string; expiresInSeconds: number }) { return `memory://put/${key}?expires=${expiresInSeconds}`; }
 async createDownloadUrl({ key, versionId, expiresInSeconds }: { key: string; versionId: string; expiresInSeconds: number }) { return `memory://get/${key}?version=${versionId}&expires=${expiresInSeconds}`; }
 async readExactVersion(key: string, versionId: string) { const value = this.versions.get(`${key}:${versionId}`); if (!value) throw new Error("not found"); return value; }
 async deleteExactVersion(key: string, versionId: string) { this.versions.delete(`${key}:${versionId}`); }
}
/** A complete PNG whose pixel bytes depend on the seed, so each photo has its own SHA-256. */
export function pngBytes(seed: number): Uint8Array {
 const crc = (bytes: Buffer) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
 const chunk = (type: string, data: Buffer) => { const name = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([name, data])), 8 + data.length); return out; };
 const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
 return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, seed & 255, (seed >> 8) & 255, 40]))), chunk("IEND", Buffer.alloc(0))]);
}
const hashOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let seedCounter = 1;
export type Where = { ctx: VerifiedTenantContext; jobId: string };
export type Photo = { id: string; sha256: string; objectKey: string };
export const storage = new MemoryStorage();
export const evidenceService = (c: Cluster) => new EvidenceService(c.runtime, storage);

/** begin (and, unless pending, finalise) a photo through the merged pipeline. */
export async function photo(c: Cluster, where: Where, options: { type?: string; finalize?: boolean; wrongBytes?: boolean } = {}): Promise<Photo> {
 const bytes = pngBytes(seedCounter++), service = evidenceService(c);
 const upload = await service.beginUpload(where.ctx, { jobId: where.jobId, scopeItemId: null, expectedSha256: hashOf(bytes), contentType: "image/png", maximumBytes: 10_000, retentionClass: "standard_evidence", expiresAt: new Date(Date.now() + 3_600_000) });
 const result: Photo = { id: upload.id, sha256: hashOf(bytes), objectKey: upload.objectKey };
 if (options.finalize === false) return result;
 storage.put(upload.objectKey, "v1", options.wrongBytes ? pngBytes(seedCounter++) : bytes);
 const done = service.finalize(where.ctx, { uploadId: upload.id, objectVersionId: "v1", evidenceType: options.type ?? "site_photo" });
 if (options.wrongBytes) await done.then(() => { throw new Error("expected the upload to be rejected"); }, () => undefined); else await done;
 return result;
}
export const pendingPhoto = (c: Cluster, where: Where) => photo(c, where, { finalize: false });
export const rejectedPhoto = (c: Cluster, where: Where) => photo(c, where, { wrongBytes: true });
/** A raw object row placed over a pending upload by the table owner (as merged extra-fixtures.ts does). */
export async function rawObjectOverPending(c: Cluster, f: Fixture, where: Where): Promise<Photo> {
 const pending = await pendingPhoto(c, where), sha = sha256Hex(`fictional raw ${pending.id}`);
 await ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$2,$3,'original','site_photo',$4,'fictional-v1',$5,1,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())", [f.p.tenantId, pending.id, where.jobId, pending.objectKey, sha]));
 return { ...pending, sha256: sha };
}
export async function previewOf(c: Cluster, where: Where, original: Photo): Promise<string> {
 const id = randomUUID(), key = `${original.objectKey}/preview`, bytes = pngBytes(seedCounter++);
 storage.put(key, "pv1", bytes);
 await evidenceService(c).registerPreview(where.ctx, { id, originalEvidenceId: original.id, objectKey: key, objectVersionId: "pv1", contentType: "image/png", maximumBytes: 10_000 });
 return id;
}
export async function invalidate(c: Cluster, f: Fixture, evidenceId: string): Promise<void> {
 await ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO app.evidence_invalidation(tenant_id,id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'wrong_subject')", [f.p.tenantId, randomUUID(), evidenceId, f.p.membershipId]));
}
/** The v3 command body the repository receives (the application strips the version and flattens the confirmation). */
export const v3 = (f: Fixture, fields: Record<string, unknown> = {}) => ({ commandId: randomUUID(), jobId: f.jobId, note, description, ...fields });
export const shownFor = (f: Fixture, photoSha256: string | null, fields: { description?: string; note?: string; jobId?: string } = {}) => siteExtraContentSha256V1({ jobId: fields.jobId ?? f.jobId, description: fields.description ?? description, note: fields.note ?? note, photoSha256 });
export const confirmationIdFor = (f: Fixture, commandId: string) => derivedUuid(`resident-confirmation:${f.p.tenantId.toLowerCase()}:${f.jobId.toLowerCase()}:${commandId.toLowerCase()}`);
export const documentFor = (f: Fixture, confirmationId: string, content: string) => residentConfirmationDocumentV1({ tenantId: f.p.tenantId, jobId: f.jobId, confirmationId, contentSha256: content });
export const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export async function evidenceCounts(c: Cluster, f: Fixture) {
 const result = await counts(c, f);
 for (const table of ["evidence_upload", "evidence_object"]) result[table] = (await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rows[0]!.n;
 result.recorded = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.resident_confirmation_recorded'", [f.p.tenantId])).rows[0]!.n;
 result.commandRows = (await c.admin.query("SELECT count(*)::int n FROM app.watchdog_command_identity WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n;
 return result;
}
/** Canonical text of every existing evidence row, by identity, for before/after comparison. */
export async function evidenceRowsText(c: Cluster, f: Fixture): Promise<Record<string, string>> {
 const rows: Record<string, string> = {};
 for (const table of ["evidence_upload", "evidence_object"]) for (const r of (await c.admin.query(`SELECT id::text,row_to_json(t)::text body FROM app.${table} t WHERE tenant_id=$1`, [f.p.tenantId])).rows) rows[`${table}:${r.id}`] = r.body;
 return rows;
}
export const refusalEvents = async (c: Cluster, f: Fixture, commandId: string) => (await c.admin.query("SELECT payload->'references'->>'reason' reason FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.refused' AND subject_ref=$2", [f.p.tenantId, commandId])).rows.map(r => r.reason as string);
export const runtimeCall = <T>(c: Cluster, f: Fixture, work: (query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>) => Promise<T>) => withTenant(c.runtime, f.ctx, db => work((sql, values) => db.$client.query(sql, values)));
