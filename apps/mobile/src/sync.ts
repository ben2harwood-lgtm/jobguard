import { z } from "zod";
import { parseOfflineIntentV1, toLogSiteExtraV1, siteAssignedJobsV1, offlineQueueItemV1,
 addOfflineQueueItemV1, restoreOfflineQueueV1, chooseOfflineQueueItemV1, applyOfflineUploadResultV1 } from "@jobguard/core";
import type { EncryptedStore } from "./store";
/** PowerSync replacement seam: no hosted replication SDK, credentials, table writes or LWW. */
export interface SyncTransport {
 assignedJobs(): Promise<unknown>;
 upload(body: unknown): Promise<unknown>;
}
export interface HashPort { sha256(value: string): Promise<string> }
const savedV1 = z.object({ version: z.literal("native-probe.v1"), item: offlineQueueItemV1, intent: z.unknown() }).strict();
export class NativeProbe {
 private busy = false;
 private async exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (this.busy) throw new Error("PROBE_BUSY");
  this.busy = true;
  try { return await work(); } finally { this.busy = false; }
 }
 queue(raw: unknown) { return this.exclusive(() => this.queueOne(raw)); }
 recover() { return this.exclusive(() => this.recoverOne()); }
 roundTrip(nowMs: number) { return this.exclusive(() => this.roundTripOne(nowMs)); }
 constructor(private readonly store: EncryptedStore, private readonly transport: SyncTransport, private readonly hash: HashPort) {
  if (store.encryption !== "sqlcipher") throw new Error("SQLCIPHER_REQUIRED");
 }
 private async decode(value: string) {
  const saved = savedV1.parse(JSON.parse(value));
  const intent = parseOfflineIntentV1(saved.intent);
  const semantic = toLogSiteExtraV1(intent);
  const payloadHash = await this.hash.sha256(JSON.stringify(semantic));
  if (saved.item.commandId !== intent.body.commandId || saved.item.jobId !== intent.jobId || saved.item.payloadHash !== payloadHash
   || saved.item.expectedRevision !== null || saved.item.kind !== "site_extra") throw new Error("QUEUE_BINDING_INVALID");
  return { ...saved, intent };
 }
 async readAuthorized() { return siteAssignedJobsV1.parse(await this.transport.assignedJobs()); }
 /** Exactly one synthetic intent; never replace unsynced work. Caller serializes access. */
 private async queueOne(raw: unknown) {
  const intent = parseOfflineIntentV1(raw);
  if (await this.store.read() !== null) throw new Error("PROBE_ALREADY_QUEUED");
  const payloadHash = await this.hash.sha256(JSON.stringify(toLogSiteExtraV1(intent)));
  const item = addOfflineQueueItemV1([], { version: "offline-queue-item.v1", environment: "synthetic_demo",
   commandId: intent.body.commandId, jobId: intent.jobId, payloadHash, expectedRevision: null, kind: "site_extra", attemptCount: 0, nextAttemptAtMs: 0, status: "queued" })[0]!;
  await this.store.write(JSON.stringify({ version: "native-probe.v1", item, intent }));
  return item;
 }
 /** Call once on open, never concurrently with an upload. Restores an interrupted attempt unchanged. */
 private async recoverOne() {
  const raw = await this.store.read(); if (!raw) return null;
  const saved = await this.decode(raw), restored = restoreOfflineQueueV1([saved.item]);
  if (restored.refused.length) throw new Error("QUEUE_RESTORE_REFUSED");
  await this.store.write(JSON.stringify({ ...saved, item: restored.items[0]! }));
  return restored.items[0]!;
 }
 private async roundTripOne(nowMs: number) {
  const raw = await this.store.read(); if (!raw) throw new Error("QUEUE_EMPTY");
  const saved = await this.decode(raw), claim = chooseOfflineQueueItemV1([saved.item], nowMs);
  if (!claim.next) return saved.item;
  // Persist sending before the request; a lost response retains the original command for replay.
  await this.store.write(JSON.stringify({ ...saved, item: claim.next }));
  let result: unknown;
  try { result = await this.transport.upload({ version: "offline-upload.v1", commandId: saved.item.commandId,
   jobId: saved.intent.jobId, body: saved.intent.body, expectedRevision: null, payloadHash: saved.item.payloadHash }); }
  catch { result = { version: "offline-upload-result.v1", commandId: saved.item.commandId, state: "retryable", code: "UNAVAILABLE", realExternalActions: 0 }; }
  const item = applyOfflineUploadResultV1(claim.next, result, nowMs);
  await this.store.write(JSON.stringify({ ...saved, item }));
  return item;
 }
}
