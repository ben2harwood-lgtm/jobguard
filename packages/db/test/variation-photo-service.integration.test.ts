// QW-1 builder photo attach (pilot-extra-photo.v1) on real PostgreSQL with in-memory object storage.
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { priceVariation } from "@jobguard/core";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";
import { insertPricedVariation, insertVariationProposal } from "../src/variation-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { EvidenceService } from "../src/evidence.js";
import { MAX_EXTRA_PHOTOS, VariationPhotoService, type ExtraPhotoCommand } from "../src/variation-photo.js";
import { workTenant } from "./job-work-state-fixtures.js";

class MemoryVersionedStorage implements PrivateVersionedStorage {
  versions = new Map<string, StoredObject>();
  put(key: string, versionId: string, bytes: Uint8Array) { this.versions.set(`${key}:${versionId}`, { key, versionId, bytes, byteLength: bytes.length, contentType: "image/png" }); }
  async createUploadUrl({ key }: { key: string }) { return `memory://put/${key}`; }
  async createDownloadUrl({ key, versionId }: { key: string; versionId: string }) { return `memory://get/${key}?version=${versionId}`; }
  async readExactVersion(key: string, versionId: string) { const value = this.versions.get(`${key}:${versionId}`); if (!value) throw new Error("not found"); return value; }
  async deleteExactVersion(key: string, versionId: string) { this.versions.delete(`${key}:${versionId}`); }
}
const storage = new MemoryVersionedStorage();
let f: FinalCheckFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let pngs = 0;
function png() {
  const crc = (bytes: Buffer) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const name = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([name, data])), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  const n = ++pngs;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, n & 255, (n >> 8) & 255, 40]))), chunk("IEND", Buffer.alloc(0))]);
}

async function extra() {
  const a = await seedFinalCheckJob(f), variationId = randomUUID();
  await withTenant(f.runtime, a.context, db => insertVariationProposal(db, a.tenantId, { version: "variation-proposal.v1", id: variationId, jobId: a.jobId, scopeItemId: variationId, existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: "Fictional extra socket", description: "Fictional extra socket", suggestion: null }));
  const service = new VariationPhotoService(f.runtime, a.jobId, storage);
  return { ...a, variationId, service };
}
type Extra = Awaited<ReturnType<typeof extra>>;
const begin = (x: Extra, bytes: Uint8Array, commandId = randomUUID(), variationId = x.variationId) =>
  x.service.save(x.context, { version: "pilot-extra-photo.v1", action: "begin", commandId, variationId, expectedSha256: sha(bytes), contentType: "image/png", byteLength: bytes.length } satisfies ExtraPhotoCommand);
const finalize = (x: Extra, uploadId: string, commandId = randomUUID()) =>
  x.service.save(x.context, { version: "pilot-extra-photo.v1", action: "finalize", commandId, uploadId, objectVersionId: "v1" });
async function attach(x: Extra) {
  const bytes = png(), started = await begin(x, bytes);
  storage.put(`tenants/${x.tenantId}/uploads/${started.uploadId}/original`, "v1", bytes);
  return { ...(await finalize(x, started.uploadId)), sha256: sha(bytes) };
}
const scopeOf = async (x: Extra) => (await f.admin.query("SELECT scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2", [x.tenantId, x.variationId])).rows[0].scope_item_id as string;
async function price(x: Extra) {
  const row = (await f.admin.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND id=$2", [x.tenantId, x.variationId])).rows[0];
  const priced = priceVariation({ id: randomUUID(), variationId: x.variationId, previous: null, proposal: { version: "variation-proposal.v1", id: x.variationId, jobId: x.jobId, scopeItemId: row.scope_item_id, existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: row.description, description: row.description, suggestion: null }, description: row.description, contentHash: "e".repeat(64), confirmed: { quantity: "1", unit: "item", unitRatePence: 50000, direction: "addition", confirmedByMembershipId: FINAL_CHECK_ACTOR, rateProvenance: { kind: "human_entered", sourceRef: "synthetic://builder-entered", sourceHash: "8".repeat(64), rateVersion: "builder-price-v1" } } });
  await withTenant(f.runtime, x.context, db => insertPricedVariation(db, x.tenantId, priced));
  return priced;
}

it("attaches verified photos to a logged extra, lists them and freezes them at pricing", async () => {
  const x = await extra(), first = await attach(x), second = await attach(x);
  const listed = await x.service.list(x.context);
  expect(listed.map(photo => photo.evidenceId)).toEqual([first.evidenceId, second.evidenceId]);
  expect(listed[0]).toEqual({ variationId: x.variationId, evidenceId: first.evidenceId, sha256: first.sha256, receivedAt: expect.stringMatching(/Z$/u), revisionIds: [] });
  const object = (await f.admin.query("SELECT evidence_type,scope_item_id FROM app.evidence_object WHERE tenant_id=$1 AND id=$2", [x.tenantId, first.evidenceId])).rows[0];
  expect(object).toEqual({ evidence_type: "variation_photo", scope_item_id: await scopeOf(x) });
  const priced = await price(x);
  expect((await x.service.list(x.context)).map(photo => photo.revisionIds)).toEqual([[priced.id], [priced.id]]);
  // A priced extra still takes photos; they go on the next revision only.
  const late = await attach(x);
  expect((await x.service.list(x.context)).find(photo => photo.evidenceId === late.evidenceId)?.revisionIds).toEqual([]);
});

it("refuses a seventh photo at begin, and at finalize when uploads raced past the cap", async () => {
  const x = await extra();
  for (let n = 0; n < MAX_EXTRA_PHOTOS - 1; n++) await attach(x);
  const a = png(), b = png(), ua = await begin(x, a), ub = await begin(x, b);
  storage.put(`tenants/${x.tenantId}/uploads/${ua.uploadId}/original`, "v1", a);
  storage.put(`tenants/${x.tenantId}/uploads/${ub.uploadId}/original`, "v1", b);
  await finalize(x, ua.uploadId);
  await expect(finalize(x, ub.uploadId)).rejects.toThrow("PHOTO_LIMIT_REACHED");
  expect(await x.service.list(x.context)).toHaveLength(MAX_EXTRA_PHOTOS);
  await expect(begin(x, png())).rejects.toThrow("PHOTO_LIMIT_REACHED");
});

it("an invalidated photo frees its place and leaves the list", async () => {
  const x = await extra(), photos = [];
  for (let n = 0; n < MAX_EXTRA_PHOTOS; n++) photos.push(await attach(x));
  await workTenant(f.admin, x.tenantId, db => db.query("INSERT INTO app.evidence_invalidation(tenant_id,id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [x.tenantId, randomUUID(), photos[0]!.evidenceId, FINAL_CHECK_ACTOR]));
  expect((await x.service.list(x.context)).map(photo => photo.evidenceId)).not.toContain(photos[0]!.evidenceId);
  await attach(x);
  expect(await x.service.list(x.context)).toHaveLength(MAX_EXTRA_PHOTOS);
});

it("replays begin and finalize idempotently", async () => {
  const x = await extra(), bytes = png(), beginId = randomUUID(), finalizeId = randomUUID();
  const first = await begin(x, bytes, beginId), again = await begin(x, bytes, beginId);
  expect(again.uploadId).toBe(first.uploadId);
  await expect(begin(x, png(), beginId)).rejects.toThrow();
  storage.put(`tenants/${x.tenantId}/uploads/${first.uploadId}/original`, "v1", bytes);
  const done = await finalize(x, first.uploadId, finalizeId), replay = await finalize(x, first.uploadId, finalizeId);
  expect(replay.evidenceId).toBe(done.evidenceId);
  expect(await x.service.list(x.context)).toHaveLength(1);
});

it("refuses another job's extra, an unknown extra and a closed job", async () => {
  const x = await extra(), y = await extra();
  await expect(begin(x, png(), randomUUID(), y.variationId)).rejects.toThrow("NOT_FOUND");
  await expect(begin(x, png(), randomUUID(), randomUUID())).rejects.toThrow("NOT_FOUND");
  // A service bound to job X cannot finalize job Y's upload.
  const bytes = png(), upload = await begin(y, bytes);
  storage.put(`tenants/${y.tenantId}/uploads/${upload.uploadId}/original`, "v1", bytes);
  await expect(finalize(x, upload.uploadId)).rejects.toMatchObject({ code: "UPLOAD_NOT_FOUND" });
  const z = await extra();
  await z.lock();
  await expect(begin(z, png())).rejects.toThrow();
  expect(await z.service.list(z.context)).toEqual([]);
});

it("keeps the completion-proof flow and the photo flow apart", async () => {
  const x = await extra(), baseline = new EvidenceService(f.runtime, storage, false, x.jobId);
  // Proof uploads may not begin on an extra's scope item...
  await expect(baseline.beginUpload(x.context, { jobId: x.jobId, scopeItemId: await scopeOf(x), expectedSha256: "a".repeat(64), contentType: "image/png", maximumBytes: 100, expiresAt: new Date(Date.now() + 60_000) })).rejects.toThrow("NOT_FOUND");
  // ...and an upload on baseline scope cannot be finalized as a variation photo.
  const uploadId = randomUUID();
  await workTenant(f.admin, x.tenantId, db => db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,'image/png',100,'transient_upload',clock_timestamp()+interval '1 hour')`, [x.tenantId, uploadId, x.jobId, x.scopeItemId, `tenants/${x.tenantId}/uploads/${uploadId}/original`, "b".repeat(64)]));
  await expect(finalize(x, uploadId)).rejects.toMatchObject({ code: "UPLOAD_NOT_FOUND" });
});
