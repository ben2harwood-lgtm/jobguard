import { afterEach, describe, expect, it, vi } from "vitest";
import { EncryptedMediaStore, OfflineCaptureLease, OFFLINE_CAPTURE_WINDOW_MS, webCryptoMediaCipher,
 type MediaCipherPort, type MediaFilePort } from "./encrypted-media";
import { NativeCaptureUpload } from "./capture-upload";
import { NativeCaptures } from "./capture";
import { MobileClient } from "./lifecycle";
import { localData, MEDIA_CHUNK_BYTES, MEDIA_MAX_BYTES, type LocalData, type MobileAuthProvider, type MobileSession,
 type Partition, type PartitionResources, type SecureVault } from "./lifecycle-contracts";
import { WorkspaceDocument } from "./workspace-document";
import type { EncryptedStore } from "./store";

// Practice-only synthetic adapters. No camera, no network, no real customer data.
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HOUR = 60 * 60 * 1000;
const digest = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
 b => b.toString(16).padStart(2, "0")).join("");
const MARKER = new TextEncoder().encode("FICTIONAL-PLAINTEXT-PHOTO-BYTES!");
function photo(length: number) {
 const bytes = new Uint8Array(length);
 for (let i = 0; i < length; i += MARKER.length) bytes.set(MARKER.subarray(0, Math.min(MARKER.length, length - i)), i);
 return bytes;
}
function containsMarker(bytes: Uint8Array) {
 const needle = MARKER.subarray(0, 16);
 outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
  for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
  return true;
 }
 return false;
}
const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Synthetic file system: records every write (any path, including temp or spool) so plaintext can be searched for. */
function syntheticFiles() {
 const disk = new Map<string, Uint8Array>(), writes: { path: string; bytes: Uint8Array }[] = [];
 let failRemoveAfter = Infinity, removes = 0;
 const port: MediaFilePort = {
  write: async (path, bytes) => { const copy = bytes.slice(); writes.push({ path, bytes: copy }); disk.set(path, copy); },
  read: async path => { const value = disk.get(path); if (!value) throw new Error("missing"); return value.slice(); },
  remove: async path => { if (++removes > failRemoveAfter) throw new Error("fictional crash during delete"); disk.delete(path); },
  list: async prefix => [...disk.keys()].filter(path => path.startsWith(prefix)),
 };
 return { port, disk, writes, crashDeletesAfter: (n: number) => { failRemoveAfter = n; removes = 0; } };
}
function syntheticVault() {
 const keys = new Map<string, string>();
 const vault: SecureVault = { get: async k => keys.get(k) ?? null, set: async (k, v) => { keys.set(k, v); }, remove: async k => { keys.delete(k); } };
 return { vault, keys };
}
const partition: Partition = { userId: id(1), tenantId: id(2), membershipId: id(3), mobileSessionId: id(4), deviceInstanceId: "fictional-device" };
const empty = () => JSON.stringify(localData.parse({ version: "mobile-cache.v1", metadata: { version: "mobile-local-metadata.v1", partition, localSchemaVersion: 1 },
 notes: [], files: [], unsyncedWork: "none" }));

/** Synthetic resumable-evidence server: verifies the exact bytes it received. */
function syntheticServer(jobId: string) {
 // Received bytes go into one preallocated buffer per upload (no per-byte arrays), keeping the 20 MiB test light in CI.
 const uploads = new Map<string, { meta: Record<string, unknown>; buffer: Uint8Array; length: number; state: "pending" | "verified" }>();
 let largestAppend = 0;
 const transport = { transfer: vi.fn(async (raw: unknown) => {
  const { version: _v, action, uploadId, ...fields } = raw as Record<string, unknown> & { action: string; uploadId: string };
  if (action === "begin") { uploads.set(uploadId, { meta: fields, buffer: new Uint8Array(fields.byteLength as number), length: 0, state: "pending" }); const { jobId: j, ...rest } = fields; return { uploadId, jobId: j, ...rest }; }
  const upload = uploads.get(uploadId)!;
  if (action === "status") return { status: { version: "resumable-evidence.v1", state: upload.state, nextOffset: upload.length }, checkedAtMs: 1 };
  if (action === "append") { const bytes = fields.bytes as Uint8Array; largestAppend = Math.max(largestAppend, bytes.length); upload.buffer.set(bytes, upload.length); upload.length += bytes.length; return { nextOffset: upload.length }; }
  if (action === "finalize") { upload.state = "verified"; return { jobId, scopeItemId: null, evidenceId: uploadId, objectVersionId: "fictional-object-version",
   sha256: await digest(upload.buffer.slice(0, upload.length)), byteLength: upload.length }; }
  throw new Error("unknown action");
 }) };
 return { transport, uploads, largestAppend: () => largestAppend };
}

function rig(options: { saved?: { value: string }; files?: ReturnType<typeof syntheticFiles>; vault?: ReturnType<typeof syntheticVault>;
 cipher?: MediaCipherPort; monotonic?: () => number; store?: EncryptedStore; part?: Partition } = {}) {
 const saved = options.saved ?? { value: empty() };
 const files = options.files ?? syntheticFiles(), vault = options.vault ?? syntheticVault();
 const store: EncryptedStore = options.store ?? { encryption: "sqlcipher", read: async () => saved.value, write: async v => { saved.value = v; }, close: async () => {} };
 const document = new WorkspaceDocument(store, options.part ?? partition);
 let mono = 0;
 const lease = new OfflineCaptureLease(options.monotonic ?? (() => mono));
  const cipher = options.cipher ?? webCryptoMediaCipher(crypto.subtle, a => crypto.getRandomValues(a));
 const media = new EncryptedMediaStore(document, vault.vault, files.port, cipher, lease, () => crypto.randomUUID(), digest);
 const jobId = id(50), sessionId = id(60);
 const server = syntheticServer(jobId);
 const upload = new NativeCaptureUpload(document, { assertCurrent: async () => {} }, server.transport, digest, media);
 const data = () => localData.parse(JSON.parse(saved.value)); // default store only
 const shoot = (bytes: Uint8Array, session = sessionId) => media.capture({ version: "encrypted-photo-capture.v1", environment: "synthetic_demo",
  jobId, sessionId: session, contentType: "image/jpeg", scopeItemId: null, requestedExpiresAtMs: 10_000, deviceCapturedAtMs: 5, bytes });
 return { saved, files, vault, document, lease, media, upload, server, data, shoot, jobId, sessionId,
  advance: (ms: number) => { mono += ms; }, signIn: (serverMs = 1_000_000) => lease.confirmSignIn(serverMs) };
}

afterEach(() => { vi.useRealTimers(); });

describe("V2-B2B1 encrypted media store (synthetic adapter, practice only)", () => {
 it("stores a 20 MB photo encrypted, uploads it in chunks, verifies it, and refuses 20 MB + 1 byte", async () => {
  const r = rig(); r.signIn();
  const { mediaId } = await r.shoot(photo(MEDIA_MAX_BYTES));
  await expect(r.shoot(photo(MEDIA_MAX_BYTES + 1))).rejects.toMatchObject({ code: "MEDIA_TOO_LARGE" });
  expect(r.data().media).toHaveLength(1);
  expect(r.files.disk.size).toBe(MEDIA_MAX_BYTES / MEDIA_CHUNK_BYTES);
  const rows = await r.upload.transfer(mediaId);
  expect(rows.find(row => row.uploadId === mediaId)).toMatchObject({ status: "verified", isServerProof: true, byteLength: MEDIA_MAX_BYTES });
  expect(r.server.largestAppend()).toBeLessThanOrEqual(32 * 1024);
  expect(sameBytes(r.server.uploads.get(mediaId)!.buffer, photo(MEDIA_MAX_BYTES))).toBe(true);
 }, 60_000);

 it("never writes plaintext anywhere: chunk files, any other path, or the SQLCipher row; encryption failure stores nothing", async () => {
  const r = rig(); r.signIn();
  await r.shoot(photo(3 * MEDIA_CHUNK_BYTES + 7));
  expect(r.files.writes.length).toBe(4);
  for (const { path, bytes } of r.files.writes) { expect(path).toMatch(/^media\/[0-9a-f-]{36}\/\d+\.enc$/u); expect(containsMarker(bytes)).toBe(false); }
  expect(r.saved.value).not.toContain("FICTIONAL-PLAINTEXT");
  expect(r.saved.value).not.toContain(base64(MARKER.subarray(0, 15)));
  expect([...r.vault.keys.keys()]).toEqual([expect.stringMatching(/^m32\.mediakey\./u)]);

  const real = webCryptoMediaCipher(crypto.subtle, a => crypto.getRandomValues(a));
  let seals = 0;
  const failing: MediaCipherPort = { ...real, seal: async (...args) => { if (++seals === 3) throw new Error("fictional cipher failure"); return real.seal(...args); } };
  const f = rig({ cipher: failing }); f.signIn();
  const before = f.saved.value;
  await expect(f.shoot(photo(4 * MEDIA_CHUNK_BYTES))).rejects.toMatchObject({ code: "MEDIA_ENCRYPTION_FAILED" });
  expect(f.files.disk.size).toBe(0); expect(f.vault.keys.size).toBe(0); expect(f.saved.value).toBe(before);
  for (const { bytes } of f.files.writes) expect(containsMarker(bytes)).toBe(false);
  const leaky: MediaCipherPort = { ...real, seal: async (_k, _iv, _a, plain) => plain }; // wrong-length output = not sealed
  const g = rig({ cipher: leaky }); g.signIn();
  await expect(g.shoot(photo(100))).rejects.toMatchObject({ code: "MEDIA_ENCRYPTION_FAILED" });
  expect(g.files.writes).toHaveLength(0); expect(g.vault.keys.size).toBe(0);
 });

 it("after verification the bytes and key are gone, a receipt remains, and it still reads verified after restart", async () => {
  const r = rig(); r.signIn();
  const { mediaId, captureOrder } = await r.shoot(photo(2 * MEDIA_CHUNK_BYTES + 1));
  await r.upload.transfer(mediaId);
  expect(r.files.disk.size).toBe(0); expect(r.vault.keys.size).toBe(0);
  const receipt = r.data().media.filter(m => m.mediaId === mediaId);
  expect(receipt).toEqual([expect.objectContaining({ state: "verified_receipt", jobId: r.jobId, captureOrder,
   serverVerification: expect.objectContaining({ evidenceId: mediaId, byteLength: 2 * MEDIA_CHUNK_BYTES + 1 }) })]);
  const restarted = rig({ saved: r.saved, files: r.files, vault: r.vault });
  expect((await new NativeCaptures(restarted.document, { assertCurrent: async () => {} }, { sha256: async () => "0".repeat(64) }).views()))
   .toEqual([expect.objectContaining({ uploadId: mediaId, status: "verified", isServerProof: true })]);
  const replay = await restarted.upload.transfer(mediaId);
  expect(replay[0]).toMatchObject({ status: "verified" });
  expect(restarted.data().media).toHaveLength(1);
  expect(r.data().unsyncedWork).toBe("none");
 });

 it("B: receipt is durable before deletion; a cleanup interrupted before or midway through deletion finishes on restart, once", async () => {
  for (const crashAfter of [0, 2]) {
   const r = rig(); r.signIn();
   const { mediaId } = await r.shoot(photo(4 * MEDIA_CHUNK_BYTES));
   r.files.crashDeletesAfter(crashAfter);
   const rows = await r.upload.transfer(mediaId);
   expect(rows[0]).toMatchObject({ status: "verified" });
   expect(r.data().media.filter(m => m.mediaId === mediaId).map(m => m.state)).toEqual(["verified_receipt"]);
   expect(r.files.disk.size).toBe(4 - crashAfter); expect(r.vault.keys.size).toBe(1);
   expect(r.data().unsyncedWork).toBe("present"); // not settled while bytes or key remain
   r.files.crashDeletesAfter(Infinity);
   const restarted = rig({ saved: r.saved, files: r.files, vault: r.vault });
   await restarted.media.cleanup(); await restarted.media.cleanup();
   expect(r.files.disk.size).toBe(0); expect(r.vault.keys.size).toBe(0);
   expect(restarted.data().media.filter(m => m.mediaId === mediaId)).toHaveLength(1);
   expect(restarted.data().media[0]!.state).toBe("verified_receipt");
   expect(restarted.data().unsyncedWork).toBe("none");
  }
 });

 it("cleanup never touches unsent media", async () => {
  const r = rig(); r.signIn();
  await r.shoot(photo(10)); await r.media.cleanup();
  expect(r.files.disk.size).toBe(1); expect(r.vault.keys.size).toBe(1);
 });

 it("old inline-attachment fixtures still queue and upload unchanged next to the encrypted store", async () => {
  const r = rig(); r.signIn();
  const legacy = JSON.parse(empty());
  delete legacy.media; delete legacy.mediaSequences; // shape saved before this piece
  r.saved.value = JSON.stringify(legacy);
  const inline = new NativeCaptureUpload(r.document, { assertCurrent: async () => {} }, r.server.transport, digest, r.media);
  const uploadId = id(70);
  await inline.keep({ version: "native-capture-upload.v1", environment: "synthetic_demo", attachment: { id: uploadId, base64: "AQID" },
   jobId: r.jobId, scopeItemId: null, capturedAtMs: 1, expiresAtMs: 3, contentType: "image/png", finalizeCommandId: id(71) });
  expect(r.data().files).toEqual([{ id: uploadId, base64: "AQID" }]);
  expect((await inline.transfer(uploadId))[0]).toMatchObject({ status: "verified" });
  expect(r.data().files).toEqual([{ id: uploadId, base64: "AQID" }]);
  expect(r.data().media).toEqual([]);
  expect(r.data().unsyncedWork).toBe("present");
 });

 it("C: capture order is reserved atomically; concurrent captures never repeat and an offline restart continues the counter", async () => {
  const r = rig(); r.signIn();
  const first = await Promise.all([1, 2, 3, 4, 5].map(() => r.shoot(photo(64))));
  expect(first.map(c => c.captureOrder.sequence).sort()).toEqual([1, 2, 3, 4, 5]);
  // A second store instance on the same document shares the writer queue: both captures land, never with the same number.
  const other = new EncryptedMediaStore(r.document, r.vault.vault, r.files.port, webCryptoMediaCipher(crypto.subtle, a => crypto.getRandomValues(a)),
   r.lease, () => crypto.randomUUID(), digest);
  const raced = await Promise.allSettled([r.shoot(photo(64)), other.capture({ version: "encrypted-photo-capture.v1", environment: "synthetic_demo",
   jobId: r.jobId, sessionId: r.sessionId, contentType: "image/png", scopeItemId: null, requestedExpiresAtMs: 1, deviceCapturedAtMs: 1, bytes: photo(64) })]);
  const numbers = r.data().media.map(m => m.captureOrder.sequence);
  expect(new Set(numbers).size).toBe(numbers.length);
  expect(raced.map(x => x.status)).toEqual(["fulfilled", "fulfilled"]);
  expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  // Offline restart: new process, new lease. Capture refused until a sign-in check; then the counter continues.
  const restarted = rig({ saved: r.saved, files: r.files, vault: r.vault });
  await expect(restarted.shoot(photo(64))).rejects.toMatchObject({ code: "SIGN_IN_CHECK_REQUIRED" });
  restarted.signIn();
  const next = await restarted.shoot(photo(64));
  expect(next.captureOrder.sequence).toBe(Math.max(...numbers) + 1);
  expect((await restarted.shoot(photo(64), id(61))).captureOrder).toEqual({ sessionId: id(61), sequence: 1 });
  expect(localData.safeParse({ ...restarted.data(), mediaSequences: [{ sessionId: r.sessionId, last: 1 }] }).success).toBe(false);
 });

 it("72-hour rule uses only the monotonic clock: a phone clock 24 hours wrong either way changes nothing", async () => {
  for (const skew of [-24 * HOUR, 0, 24 * HOUR]) {
   vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(Date.UTC(2026, 10, 24)) .getTime() + skew);
   const r = rig(); r.signIn(5_000_000);
   r.advance(OFFLINE_CAPTURE_WINDOW_MS - 1);
   await expect(r.shoot(photo(8))).resolves.toMatchObject({ captureOrder: { sequence: 1 } });
   expect(r.data().media[0]).toMatchObject({ timing: { signInCheckServerMs: 5_000_000, elapsedSinceCheckMs: OFFLINE_CAPTURE_WINDOW_MS - 1 } });
   r.advance(1);
   await expect(r.shoot(photo(8))).rejects.toMatchObject({ code: "OFFLINE_LEASE_EXPIRED" });
   vi.setSystemTime(Date.now() - 100 * HOUR); // winding the phone clock back does not reopen capture
   await expect(r.shoot(photo(8))).rejects.toMatchObject({ code: "OFFLINE_LEASE_EXPIRED" });
   r.signIn(5_000_000 + OFFLINE_CAPTURE_WINDOW_MS);
   await expect(r.shoot(photo(8))).resolves.toMatchObject({ captureOrder: { sequence: 2 } });
   vi.useRealTimers();
  }
  let backwards = 10;
  const b = rig({ monotonic: () => backwards }); b.signIn(); backwards = 9;
  await expect(b.shoot(photo(8))).rejects.toMatchObject({ code: "OFFLINE_LEASE_EXPIRED" });
 });

 it("an offline restart keeps captured work and refuses only NEW capture until a sign-in check", async () => {
  const r = rig(); r.signIn();
  const { mediaId } = await r.shoot(photo(10));
  const restarted = rig({ saved: r.saved, files: r.files, vault: r.vault });
  await expect(restarted.shoot(photo(10))).rejects.toMatchObject({ code: "SIGN_IN_CHECK_REQUIRED" });
  expect(restarted.data().media.map(m => m.mediaId)).toEqual([mediaId]);
  expect(r.files.disk.size).toBe(1);
  expect((await restarted.media.views())[0]).toMatchObject({ mediaId, retention: "age_unknown" });
 });

 it("unsent media is kept up to 14 days with a warning from day 7 and is never cleared automatically", async () => {
  const r = rig(); r.signIn(0);
  await r.shoot(photo(10));
  const at = async (days: number) => { r.advance(days * 24 * HOUR); await r.media.cleanup(); return (await r.media.views())[0]!.retention; };
  expect(await at(6.9)).toBe("kept");
  expect(await at(0.2)).toBe("warn_send_soon");
  expect(await at(7)).toBe("send_or_discard");
  expect(await at(30)).toBe("send_or_discard");
  expect(r.data().media).toHaveLength(1); expect(r.files.disk.size).toBe(1); expect(r.vault.keys.size).toBe(1);
 });

 it("discard needs two confirmations; a wrong or missing second confirmation removes nothing", async () => {
  const r = rig(); r.signIn();
  const { mediaId } = await r.shoot(photo(MEDIA_CHUNK_BYTES + 1));
  await expect(r.media.confirmDiscard(mediaId, id(999))).rejects.toMatchObject({ code: "DISCARD_NOT_CONFIRMED" });
  const token = await r.media.requestDiscard(mediaId);
  await expect(r.media.confirmDiscard(mediaId, id(999))).rejects.toMatchObject({ code: "DISCARD_NOT_CONFIRMED" });
  expect(r.data().media).toHaveLength(1); expect(r.files.disk.size).toBe(2);
  expect((await r.media.views())[0]).toMatchObject({ discardPending: true });
  await r.media.confirmDiscard(mediaId, token);
  expect(r.data().media).toEqual([]); expect(r.data().captures).toEqual([]);
  expect(r.files.disk.size).toBe(0); expect(r.vault.keys.size).toBe(0);
  expect(r.data().unsyncedWork).toBe("none");
  // A verified receipt is not unsent work and cannot be "discarded".
  // Codex P2 (repair 1): key deletion fails after the record is gone; the tombstone keeps it discoverable until removed.
  const k = rig(); k.signIn();
  const kept = await k.shoot(photo(MEDIA_CHUNK_BYTES + 1));
  const remove = k.vault.vault.remove; let failKey = true;
  k.vault.vault.remove = async key => { if (failKey) { failKey = false; throw new Error("fictional key store failure"); } return remove(key); };
  await k.media.confirmDiscard(kept.mediaId, await k.media.requestDiscard(kept.mediaId));
  expect(k.vault.keys.size).toBe(1); expect(k.data().mediaCleanup).toEqual([{ mediaId: kept.mediaId, chunkCount: 2 }]);
  expect(k.data().unsyncedWork).toBe("present"); // Codex P2 (repair 2): hold stays on until the key is really gone
  const again = rig({ saved: k.saved, files: k.files, vault: k.vault });
  await again.media.cleanup();
  expect(k.vault.keys.size).toBe(0); expect(k.files.disk.size).toBe(0); expect(again.data().mediaCleanup).toEqual([]);
  expect(again.data().unsyncedWork).toBe("none");
  const v = rig(); v.signIn(); const shot = await v.shoot(photo(10)); await v.upload.transfer(shot.mediaId);
  await expect(v.media.requestDiscard(shot.mediaId)).rejects.toThrow();
 });

 it("photo capture from the device camera is still held everywhere", () => {
  const r = rig();
  const captures = new NativeCaptures(r.document, { assertCurrent: async () => {} }, { sha256: async () => "0".repeat(64) });
  for (const permission of ["granted", "denied", "unavailable"] as const)
   expect(captures.media("photo", permission)).toMatchObject({ state: "held", realExternalActions: 0 });
  expect(captures.media("photo", "granted").reason).toBe("D08_ENCRYPTED_MEDIA_REQUIRED");
 });
});

it("Codex P1 (repair 1): a hold set by other local work is never cleared by settling media", async () => {
 for (const other of ["note", "marker"] as const) {
  const r = rig(); r.signIn();
  const base = localData.parse(JSON.parse(r.saved.value));
  // Another part of the app (MobileClient.save) marked unsent work before or after the photo.
  r.saved.value = JSON.stringify({ ...base, unsyncedWork: "present", notes: other === "note" ? [{ id: id(90), text: "Fictional unsent note" }] : [] });
  const shot = await r.shoot(photo(10)); await r.upload.transfer(shot.mediaId);
  expect(r.data().unsyncedWork).toBe("present");
  const d = await r.shoot(photo(10)); await r.media.confirmDiscard(d.mediaId, await r.media.requestDiscard(d.mediaId));
  expect(r.data().unsyncedWork).toBe("present");
 }
 // Media turned the hold on, then a note was saved: settling the photo keeps the hold.
 const m = rig(); m.signIn();
 const first = await m.shoot(photo(10));
 m.saved.value = JSON.stringify({ ...m.data(), notes: [{ id: id(91), text: "Fictional unsent note" }] });
 await m.upload.transfer(first.mediaId);
 expect(m.data().unsyncedWork).toBe("present");
});

it("Codex P2 (repair 3): a failed capture whose undo also fails leaves a cleanup reservation, not an orphan key", async () => {
 const real = webCryptoMediaCipher(crypto.subtle, a => crypto.getRandomValues(a));
 let seals = 0;
 const failing: MediaCipherPort = { ...real, seal: async (...args) => { if (++seals === 2) throw new Error("fictional cipher failure"); return real.seal(...args); } };
 const r = rig({ cipher: failing }); r.signIn();
 const remove = r.vault.vault.remove; let failKey = true;
 r.vault.vault.remove = async key => { if (failKey) { failKey = false; throw new Error("fictional key store failure"); } return remove(key); };
 await expect(r.shoot(photo(3 * MEDIA_CHUNK_BYTES))).rejects.toMatchObject({ code: "MEDIA_ENCRYPTION_FAILED" });
 expect(r.vault.keys.size).toBe(1);
 const [reservation] = r.data().mediaCleanup;
 expect(reservation).toMatchObject({ chunkCount: 3 });
 expect([...r.vault.keys.keys()]).toEqual([`m32.mediakey.${reservation!.mediaId}`]);
 expect(r.data().media).toEqual([]); expect(r.data().captures).toEqual([]);
 expect(r.data().unsyncedWork).toBe("present"); // logout stays locked while the key is still in the key store
 const again = rig({ saved: r.saved, files: r.files, vault: r.vault });
 await again.media.cleanup();
 expect(r.vault.keys.size).toBe(0); expect(r.files.disk.size).toBe(0);
 expect(again.data().mediaCleanup).toEqual([]); expect(again.data().unsyncedWork).toBe("none");
 // A clean failure (undo works) leaves no reservation and no hold behind.
 seals = 0; failKey = false;
 const c = rig({ cipher: failing }); c.signIn();
 await expect(c.shoot(photo(3 * MEDIA_CHUNK_BYTES))).rejects.toMatchObject({ code: "MEDIA_ENCRYPTION_FAILED" });
 expect(c.data().mediaCleanup).toEqual([]); expect(c.data().unsyncedWork).toBe("none"); expect(c.vault.keys.size).toBe(0);
 // A successful capture keeps no reservation.
 const ok = rig(); ok.signIn(); await ok.shoot(photo(10));
 expect(ok.data().mediaCleanup).toEqual([]); expect(ok.data().media).toHaveLength(1);
});

it("Codex P2 (repair 3): a receipt written while a sweep runs keeps the hold until its own bytes and key are gone", async () => {
 const r = rig(); r.signIn();
 const first = await r.shoot(photo(10)), second = await r.shoot(photo(10));
 await r.upload.transfer(first.mediaId); // first is a receipt with nothing left; second is still unsent
 // Pause a sweep after it has read the row, then let a transfer write the second receipt in the gap.
 const list = r.files.port.list; let release!: () => void; let paused = true;
 const gate = new Promise<void>(resolve => { release = resolve; });
 r.files.port.list = async prefix => { if (paused && prefix === "media/") { paused = false; await gate; } return list(prefix); };
 const sweep = r.media.cleanup();
 await new Promise(resolve => setTimeout(resolve, 0));
 const transfer = r.upload.transfer(second.mediaId);
 await vi.waitFor(() => expect(r.data().media.find(m => m.mediaId === second.mediaId)?.state).toBe("verified_receipt"));
 const leftovers = () => [...r.files.disk.keys()].filter(path => path.includes(second.mediaId)).length + r.vault.keys.size;
 expect(leftovers()).toBeGreaterThan(0);
 release(); await sweep;
 expect(leftovers()).toBeGreaterThan(0); expect(r.data().unsyncedWork).toBe("present"); // never settled for a receipt this sweep did not clean
 await transfer;
 expect(leftovers()).toBe(0); expect(r.data().unsyncedWork).toBe("none");
});

describe("A: logout and firm switch with verified receipts and pending items on the same device", () => {
 const policy = { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1",
  accessDurationMs: 100, refreshDurationMs: 500, sessionDurationMs: 1000, readLeaseDurationMs: 200 };
 function device() {
  let n = 100;
  const secure = syntheticVault(), files = syntheticFiles(), data = new Map<string, string | null>(), destroyed: string[] = [];
  const key = async (p: Partition) => [p.userId, p.tenantId, p.membershipId, p.mobileSessionId].join("_");
  const resources: PartitionResources = { open: async (p, create) => {
   const k = await key(p); if (!data.has(k)) { if (!create) throw new Error("missing"); data.set(k, null); }
   return { encryption: "sqlcipher", read: async () => data.get(k) ?? null, write: async v => { data.set(k, v); }, close: async () => {} };
  }, destroy: async p => { const k = await key(p); data.delete(k); destroyed.push(k); } };
  let session: MobileSession;
  const issue = (tenantId: string): MobileSession => {
   const p = { userId: id(1), tenantId, membershipId: id(++n), mobileSessionId: id(++n), deviceInstanceId: "fictional-device" };
   session = { version: "mobile-session.v1", environment: "synthetic_demo", partition: p,
    access: { version: "mobile-access.v1", credential: String(++n).padStart(43, "a") }, refresh: { version: "mobile-refresh.v1", credential: String(++n).padStart(43, "b") },
    accessExpiresAtMs: 1100, refreshExpiresAtMs: 1500,
    lease: { version: "mobile-read-lease.v1", environment: "synthetic_demo", leaseId: id(++n), partition: p, policyVersion: "fictional_mobile_auth_policy_v1", issuedAtMs: 1000, expiresAtMs: 1200 } };
   return structuredClone(session);
  };
  const provider: MobileAuthProvider = { exchange: async i => issue(i.requestedTenantId), rotate: async () => session, reconnect: async () => session.lease,
   deviceCommand: async i => i.action === "tenant_switch" ? issue(i.nextTenantId!) : { version: "mobile-device-revoked.v1", environment: "synthetic_demo" } };
  const client = new MobileClient(provider, secure.vault, resources, { enabled: true, environment: "synthetic_demo", policy, uuid: () => id(++n),
   deviceInstanceId: "fictional-device", clock: () => ({ status: "trusted_fixture", nowMs: 1000 }), partitionKey: key });
  const media = async () => {
   const k = await key(session.partition);
   const store: EncryptedStore = { encryption: "sqlcipher", read: async () => data.get(k) ?? null, write: async v => { data.set(k, v); }, close: async () => {} };
   return rig({ store, files, vault: secure, part: session.partition });
  };
  const local = async (): Promise<LocalData | null> => { const raw = data.get(await key(session.partition)); return raw ? localData.parse(JSON.parse(raw)) : null; };
  return { client, media, local, destroyed, files };
 }

 it("verified + pending keeps logout locked; verified only lets logout erase", async () => {
  const d = device(); await d.client.exchange(id(2));
  const r = await d.media(); r.signIn();
  const verified = await r.shoot(photo(10)); await r.upload.transfer(verified.mediaId);
  await r.shoot(photo(10)); // pending
  await expect(d.client.logout()).rejects.toMatchObject({ code: "MOBILE_UNSYNCED_POLICY_HOLD" });
  expect(d.destroyed).toEqual([]);
  expect((await d.local())!.media.map(m => m.state).sort()).toEqual(["stored", "verified_receipt"]);
  expect(d.files.disk.size).toBe(1);

  const e = device(); await e.client.exchange(id(2));
  const s = await e.media(); s.signIn();
  const only = await s.shoot(photo(10)); await s.upload.transfer(only.mediaId);
  expect((await e.local())!.unsyncedWork).toBe("none");
  await e.client.logout();
  expect(e.destroyed).toHaveLength(1);
 });

 it("verified + pending blocks firm switch; verified only lets it switch", async () => {
  const d = device(); await d.client.exchange(id(2));
  const r = await d.media(); r.signIn();
  const verified = await r.shoot(photo(10)); await r.upload.transfer(verified.mediaId);
  const pending = await r.shoot(photo(10));
  await expect(d.client.switchTenant(id(9))).rejects.toMatchObject({ code: "MOBILE_UNSYNCED_POLICY_HOLD" });
  expect(d.destroyed).toEqual([]);
  // The builder sends the pending photo; with only verified receipts left, the switch goes ahead.
  await r.upload.transfer(pending.mediaId);
  await d.client.switchTenant(id(9));
  expect(d.destroyed).toHaveLength(1);
 });
});
