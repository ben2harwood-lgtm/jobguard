import { z } from "zod";
import { offlineCaptureItemV1 } from "@jobguard/core";
import { MEDIA_CHUNK_BYTES, MEDIA_MAX_BYTES, MobileClientError, nothingUnsynced, storedMediaV1, type LocalData, type MediaRecord,
 type SecureVault } from "./lifecycle-contracts";
import type { WorkspaceDocument } from "./workspace-document";

/**
 * V2-B2B1 (practice only). Encrypted on-device photo store, reached only through injected adapters.
 * The camera stays held (`NativeCaptures.media` still returns `held`); nothing here opens a device camera.
 *
 * - Bytes: encrypted chunks outside the SQLCipher row, one random AES-256-GCM key per photo held by the
 *   platform key store (`SecureVault`). No plaintext byte is ever handed to the file port.
 * - Index, capture-order counter and verified receipts: inside the SQLCipher row (`LocalData.media`).
 * - Clock: the phone's wall clock is never read. Offline capture needs a server-confirmed sign-in check made
 *   in THIS run, measured by a monotonic clock; after a restart the elapsed time is unknown, so capture is refused.
 */
export class MediaRefusal extends Error {
 constructor(readonly code: "MEDIA_TOO_LARGE" | "MEDIA_EMPTY" | "MEDIA_ENCRYPTION_FAILED" | "SIGN_IN_CHECK_REQUIRED"
  | "OFFLINE_LEASE_EXPIRED" | "MEDIA_BUSY" | "MEDIA_DENIED" | "DISCARD_NOT_CONFIRMED") { super(code); this.name = "MediaRefusal"; }
}

/** Encrypted chunk files only. Native adapter (app sandbox, excluded from backup) arrives with B2B1-device. */
export interface MediaFilePort {
 write(path: string, bytes: Uint8Array): Promise<void>;
 read(path: string): Promise<Uint8Array>;
 remove(path: string): Promise<void>; // Removing a missing path is not an error.
 list(prefix: string): Promise<string[]>;
}
/** Authenticated encryption port. `sealed` = ciphertext with its tag; `open` throws on any tampering. */
export interface MediaCipherPort {
 randomBytes(length: number): Promise<Uint8Array>;
 seal(key: Uint8Array, iv: Uint8Array, aad: Uint8Array, plain: Uint8Array): Promise<Uint8Array>;
 open(key: Uint8Array, iv: Uint8Array, aad: Uint8Array, sealed: Uint8Array): Promise<Uint8Array>;
}
type Subtle = Pick<SubtleCrypto, "importKey" | "encrypt" | "decrypt">;
const ab = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;
/** AES-256-GCM over WebCrypto (tests and any runtime that provides it). */
export function webCryptoMediaCipher(subtle: Subtle, getRandomValues: (array: Uint8Array<ArrayBuffer>) => Uint8Array): MediaCipherPort {
 const key = (raw: Uint8Array, use: KeyUsage) => subtle.importKey("raw", ab(raw), { name: "AES-GCM" }, false, [use]);
 return {
  randomBytes: async length => getRandomValues(new Uint8Array(length)),
  seal: async (raw, iv, aad, plain) => new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: ab(iv), additionalData: ab(aad) }, await key(raw, "encrypt"), ab(plain))),
  open: async (raw, iv, aad, sealed) => new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: ab(iv), additionalData: ab(aad) }, await key(raw, "decrypt"), ab(sealed))),
 };
}

export const OFFLINE_CAPTURE_WINDOW_MS = 72 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Offline capture lease. Lives in memory for one run only. `confirmSignIn` takes the SERVER's time from a successful
 * sign-in check; elapsed time comes only from the injected monotonic clock. The server re-checks timing on reconnect.
 */
export class OfflineCaptureLease {
 #anchor: { serverMs: number; monotonicMs: number } | null = null;
 constructor(private readonly monotonic: () => number) {}
 confirmSignIn(serverNowMs: number) {
  this.#anchor = { serverMs: z.number().int().nonnegative().safe().parse(serverNowMs), monotonicMs: this.monotonic() };
 }
 /** Server-anchored timing for a capture now, or a refusal. Never reads the phone's wall clock. */
 timing(): { signInCheckServerMs: number; elapsedSinceCheckMs: number } {
  if (!this.#anchor) throw new MediaRefusal("SIGN_IN_CHECK_REQUIRED");
  const elapsed = this.monotonic() - this.#anchor.monotonicMs;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= OFFLINE_CAPTURE_WINDOW_MS) throw new MediaRefusal("OFFLINE_LEASE_EXPIRED");
  return { signInCheckServerMs: this.#anchor.serverMs, elapsedSinceCheckMs: Math.floor(elapsed) };
 }
 /** Best server-anchored "now" in this run, or null when unknown (no sign-in check since the app started). */
 serverNowMs() {
  if (!this.#anchor) return null;
  const elapsed = this.monotonic() - this.#anchor.monotonicMs;
  return Number.isFinite(elapsed) && elapsed >= 0 ? this.#anchor.serverMs + Math.floor(elapsed) : null;
 }
}

export type RetentionState = "kept" | "warn_send_soon" | "send_or_discard" | "age_unknown";
/** Unsent media is kept up to 14 days, warned from day 7, and NEVER cleared automatically. */
export function retentionState(record: MediaRecord, serverNowMs: number | null): RetentionState | "verified" {
 if (record.state === "verified_receipt") return "verified";
 if (serverNowMs === null) return "age_unknown";
 const age = serverNowMs - (record.timing.signInCheckServerMs + record.timing.elapsedSinceCheckMs);
 return age >= 14 * DAY_MS ? "send_or_discard" : age >= 7 * DAY_MS ? "warn_send_soon" : "kept";
}

const captureInput = z.object({ version: z.literal("encrypted-photo-capture.v1"), environment: z.literal("synthetic_demo"),
 jobId: z.guid(), sessionId: z.guid(), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
 scopeItemId: z.guid().nullable(), requestedExpiresAtMs: z.number().int().nonnegative().safe(),
 deviceCapturedAtMs: z.number().int().nonnegative().safe() }).strict();
export type EncryptedPhotoCapture = z.infer<typeof captureInput> & { bytes: Uint8Array };
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) => Uint8Array.from(value.match(/../gu) ?? [], pair => Number.parseInt(pair, 16));
const keyName = (mediaId: string) => `m32.mediakey.${mediaId}`;
const chunkPath = (mediaId: string, index: number) => `media/${mediaId}/${index}.enc`;
const PATH = /^media\/([0-9a-f-]{36})\/\d+\.enc$/u;
const aad = (mediaId: string, index: number, chunkCount: number, byteLength: number) =>
 new TextEncoder().encode(`jobguard-media.v1:${mediaId}:${index}:${chunkCount}:${byteLength}`);

/**
 * Settles `unsyncedWork` to none only when encrypted media set the hold itself, no other local notes or inline files
 * exist, and the hold rule allows it. A hold set by anything else (for example `MobileClient.save`) is never cleared.
 */
export function settleUnsynced(data: LocalData): LocalData {
 return data.unsyncedWork === "present" && data.mediaOwnsUnsyncedHold && data.notes.length === 0 && data.files.length === 0
  && nothingUnsynced(data) ? { ...data, unsyncedWork: "none", mediaOwnsUnsyncedHold: false } : data;
}

// One writer queue per workspace document, shared by every store instance over it, so a sweep can never
// remove chunks that another instance has written but not yet recorded.
const queues = new WeakMap<WorkspaceDocument, Promise<unknown>>();
export class EncryptedMediaStore {
 constructor(private readonly document: WorkspaceDocument, private readonly vault: SecureVault,
  private readonly files: MediaFilePort, private readonly cipher: MediaCipherPort, private readonly lease: OfflineCaptureLease,
  private readonly uuid: () => string, private readonly sha256: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>) {}

 /** One writer at a time per document, so concurrent captures queue instead of racing for a sequence number. */
 private exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = (queues.get(this.document) ?? Promise.resolve()).then(work, work);
  queues.set(this.document, run.catch(() => undefined));
  return run;
 }

 /** Encrypts, writes chunks, then reserves the sequence number and records the capture in ONE encrypted-store write. */
 capture(raw: EncryptedPhotoCapture) {
  return this.exclusive(async () => {
   const { bytes, ...fields } = raw;
   const value = captureInput.parse(fields);
   if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new MediaRefusal("MEDIA_EMPTY");
   if (bytes.length > MEDIA_MAX_BYTES) throw new MediaRefusal("MEDIA_TOO_LARGE");
   const timing = this.lease.timing();
   const mediaId = z.guid().parse(this.uuid()).toLowerCase(), finalizeCommandId = z.guid().parse(this.uuid()).toLowerCase();
   const chunkCount = Math.ceil(bytes.length / MEDIA_CHUNK_BYTES);
   const written: string[] = [];
   let keyStored = false;
   const undo = async () => {
    for (const path of written) await this.files.remove(path).catch(() => undefined);
    if (keyStored) await this.vault.remove(keyName(mediaId)).catch(() => undefined);
   };
   try {
    const key = await this.cipher.randomBytes(32);
    if (key.length !== 32) throw new Error("key");
    await this.vault.set(keyName(mediaId), hex(key)); keyStored = true;
    for (let index = 0; index < chunkCount; index++) {
     const plain = bytes.subarray(index * MEDIA_CHUNK_BYTES, Math.min(bytes.length, (index + 1) * MEDIA_CHUNK_BYTES));
     const iv = await this.cipher.randomBytes(12);
     const sealed = await this.cipher.seal(key, iv, aad(mediaId, index, chunkCount, bytes.length), plain);
     if (iv.length !== 12 || sealed.length !== plain.length + 16) throw new Error("cipher");
     const file = new Uint8Array(12 + sealed.length); file.set(iv, 0); file.set(sealed, 12);
     const path = chunkPath(mediaId, index); written.push(path);
     await this.files.write(path, file);
    }
   } catch {
    await undo();
    throw new MediaRefusal("MEDIA_ENCRYPTION_FAILED"); // Refuse rather than ever store in the clear.
   }
   try {
    const sha256 = await this.sha256(bytes.slice());
    const item = offlineCaptureItemV1.parse({ version: "offline-capture-item.v1", environment: "synthetic_demo", uploadId: mediaId,
     jobId: value.jobId, scopeItemId: value.scopeItemId, kind: "photo", contentType: value.contentType, clientSha256: sha256,
     clientMetadata: { deviceCapturedAtMs: value.deviceCapturedAtMs }, byteLength: bytes.length, status: "local_only", serverVerification: null });
    return await this.document.transaction(async data => {
     if (data.media.some(m => m.mediaId === mediaId) || data.captures.some(c => c.item.uploadId === mediaId)) throw new MediaRefusal("MEDIA_DENIED");
     const counter = data.mediaSequences.find(s => s.sessionId === value.sessionId);
     const sequence = (counter?.last ?? 0) + 1;
     const record = storedMediaV1.parse({ state: "stored", mediaId, jobId: value.jobId, captureOrder: { sessionId: value.sessionId, sequence },
      contentType: value.contentType, chunks: { byteLength: bytes.length, chunkBytes: MEDIA_CHUNK_BYTES, chunkCount }, sha256, timing,
      discardRequestId: null });
     const mediaSequences = counter ? data.mediaSequences.map(s => s === counter ? { ...s, last: sequence } : s)
      : [...data.mediaSequences, { sessionId: value.sessionId, last: sequence }];
     return { data: { ...data, unsyncedWork: data.unsyncedWork === "none" ? "present" as const : data.unsyncedWork,
      mediaOwnsUnsyncedHold: data.unsyncedWork === "none" ? true : data.mediaOwnsUnsyncedHold, mediaSequences,
      media: [...data.media, record], captures: [...data.captures, { item, upload: { finalizeCommandId,
       requestedExpiresAtMs: value.requestedExpiresAtMs, serverExpiresAtMs: null, nextOffset: 0 } }] },
      result: { mediaId, captureOrder: record.captureOrder } };
    });
   } catch (error) {
    await undo(); // Nothing was recorded, so the encrypted chunks and key are not anyone's unsent work yet.
    if (error instanceof MediaRefusal) throw error;
    throw new MediaRefusal(error instanceof MobileClientError && error.code === "MOBILE_BUSY" ? "MEDIA_BUSY" : "MEDIA_DENIED");
   }
  });
 }

 /** Upload source over one stored photo: decrypts one chunk at a time and holds at most one chunk in memory. */
 async source(record: MediaRecord) {
  if (record.state !== "stored") throw new MediaRefusal("MEDIA_DENIED");
  const raw = await this.vault.get(keyName(record.mediaId));
  if (!raw || !/^[0-9a-f]{64}$/u.test(raw)) throw new MediaRefusal("MEDIA_DENIED");
  const key = unhex(raw), { byteLength, chunkBytes, chunkCount } = record.chunks;
  let cached: { index: number; bytes: Uint8Array } | null = null;
  const chunk = async (index: number) => {
   if (cached?.index === index) return cached.bytes;
   cached = null;
   const file = await this.files.read(chunkPath(record.mediaId, index));
   const plain = await this.cipher.open(key, file.subarray(0, 12), aad(record.mediaId, index, chunkCount, byteLength), file.subarray(12));
   const expected = index === chunkCount - 1 ? byteLength - index * chunkBytes : chunkBytes;
   if (plain.length !== expected) throw new MediaRefusal("MEDIA_DENIED");
   cached = { index, bytes: plain };
   return plain;
  };
  return {
   byteLength,
   // Integrity is enforced per chunk by the AEAD tag; the digest was computed once, at capture.
   sha256: async () => record.sha256,
   /** Bytes from `start`, never past `maxEnd` nor across a stored chunk boundary. */
   read: async (start: number, maxEnd: number) => {
    const index = Math.floor(start / chunkBytes), within = start - index * chunkBytes;
    const plain = await chunk(index);
    return plain.slice(within, within + Math.min(maxEnd - start, plain.length - within));
   },
  };
 }

 /** First confirmation: marks an UNSENT photo for discard and returns the id the second confirmation must repeat. */
 requestDiscard(mediaId: string) {
  return this.exclusive(() => this.document.transaction(async data => {
   const record = data.media.find(m => m.mediaId === mediaId);
   if (!record || record.state !== "stored") throw new MediaRefusal("MEDIA_DENIED");
   const discardRequestId = z.guid().parse(this.uuid()).toLowerCase();
   return { data: { ...data, media: data.media.map(m => m === record ? { ...record, discardRequestId } : m) }, result: discardRequestId };
  }));
 }

 /** Second confirmation: removes the record durably, then the encrypted bytes and key. */
 confirmDiscard(mediaId: string, discardRequestId: string) {
  return this.exclusive(async () => {
   await this.document.transaction(async data => {
    const record = data.media.find(m => m.mediaId === mediaId);
    if (!record || record.state !== "stored" || record.discardRequestId === null || record.discardRequestId !== discardRequestId)
     throw new MediaRefusal("DISCARD_NOT_CONFIRMED");
    return { data: ({ ...data, media: data.media.filter(m => m !== record),
     mediaCleanup: [...data.mediaCleanup, { mediaId, chunkCount: record.chunks.chunkCount }],
     captures: data.captures.filter(c => c.item.uploadId !== mediaId) }), result: undefined };
   }).catch(error => { throw error instanceof MediaRefusal ? error : new MediaRefusal("DISCARD_NOT_CONFIRMED"); });
   await this.sweep().catch(() => undefined); // The record is gone; leftover chunks and key are retried by cleanup().
  });
 }

 /** Retryable cleanup: deletes bytes and keys of verified receipts and of chunks no record owns. Never touches stored media. */
 cleanup() { return this.exclusive(() => this.sweep()); }
 private async sweep() {
  const { records, tombstones } = await this.document.transaction(async data => ({ data, result: { records: data.media, tombstones: data.mediaCleanup } }));
  const stored = new Set(records.filter(m => m.state === "stored").map(m => m.mediaId));
  const targets = new Set([...records.filter(m => m.state === "verified_receipt").map(m => m.mediaId), ...tombstones.map(t => t.mediaId)]);
  for (const path of await this.files.list("media/")) {
   const owner = PATH.exec(path)?.[1];
   if (owner && !stored.has(owner)) targets.add(owner);
  }
  for (const mediaId of targets) {
   const chunkCount = records.find(m => m.mediaId === mediaId)?.chunks.chunkCount ?? tombstones.find(t => t.mediaId === mediaId)?.chunkCount ?? 0;
   const paths = new Set((await this.files.list(`media/${mediaId}/`)));
   for (let i = 0; i < chunkCount; i++) paths.add(chunkPath(mediaId, i));
   for (const path of paths) await this.files.remove(path);
   await this.vault.remove(keyName(mediaId));
  }
  // A discard tombstone is dropped only after its chunks AND key were removed above without error.
  const done = new Set(tombstones.map(t => t.mediaId));
  // The hold may clear only here, after every receipt and discard target lost its bytes AND key without error, so a
  // logout or firm switch can never erase the partition while a media key or chunk is still waiting to be removed.
  await this.document.transaction(async data => ({ data: settleUnsynced({ ...data, mediaCleanup: data.mediaCleanup.filter(t => !done.has(t.mediaId)) }), result: undefined }));
 }

 /** Screen rows: capture order, retention warning and whether the server verified it. No bytes. */
 async views() {
  const serverNowMs = this.lease.serverNowMs();
  return this.document.transaction(async data => ({ data, result: data.media.map(m => ({ mediaId: m.mediaId, jobId: m.jobId,
   captureOrder: m.captureOrder, retention: retentionState(m, serverNowMs), discardPending: m.state === "stored" && m.discardRequestId !== null })) }));
 }
}

/** Replaces a stored record with its verified receipt in the same write as the verified capture item. */
export function receiptFor(data: LocalData, mediaId: string): LocalData {
 const capture = data.captures.find(c => c.item.uploadId === mediaId);
 const record = data.media.find(m => m.mediaId === mediaId);
 if (!capture || !record || record.state !== "stored" || capture.item.status !== "verified" || !capture.item.serverVerification) return data;
 const receipt: MediaRecord = { state: "verified_receipt", mediaId, jobId: record.jobId, captureOrder: record.captureOrder,
  chunks: record.chunks, serverVerification: capture.item.serverVerification };
 return { ...data, media: data.media.map(m => m === record ? receipt : m) }; // hold settles in sweep() after deletion
}
