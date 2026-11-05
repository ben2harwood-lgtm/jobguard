import { z } from "zod";
import { offlineUploadV1, offlineUploadBodyV1, offlineReconciliationV1, offlineReconciliationViewV1,
 reconcileOfflineResultV1, addOfflineQueueItemV1, chooseOfflineQueueItemV1, restoreOfflineQueueV1 } from "@jobguard/core";
import { WorkspaceDocument, type NativeAuthority } from "./workspace-document";
import { MobileClientError } from "./lifecycle-contracts";
import type { HashPort } from "./sync";
const entry = z.object({ upload: offlineUploadV1, reconciliation: offlineReconciliationV1 }).strict();
type Entry = z.infer<typeof entry>;
export type NativeReconciliationRow = ReturnType<typeof offlineReconciliationViewV1> & { commandId: string | null; jobId: string | null };
export interface NativeQueueTransport { upload(raw: unknown): Promise<unknown> }
/** Full original envelopes stay encrypted; reconciliation exposes metadata only. One owner per document. */
export class DurableNativeQueue {
 constructor(private readonly document: WorkspaceDocument, private readonly authority: NativeAuthority,
  private readonly transport: NativeQueueTransport, private readonly hash: HashPort) {}
 private async authorize() { try { await this.authority.assertCurrent(this.document.partition); } catch { throw new MobileClientError("MOBILE_DENIED"); } }
 private async checked(raw: unknown): Promise<Entry | null> {
  const parsed = entry.safeParse(raw); if (!parsed.success) return null;
  const { upload, reconciliation: { item } } = parsed.data;
  const hash = await this.hash.sha256(JSON.stringify({ jobId: upload.jobId, body: offlineUploadBodyV1.parse(upload.body) }));
  const kind = upload.body.version === "log-site-extra.v1" ? "site_extra" : upload.body.version === "job-work-state-command.v1" ? "work_state" : "commercial_intent";
  return item.commandId === upload.commandId && item.jobId === upload.jobId && item.payloadHash === upload.payloadHash
   && item.expectedRevision === upload.expectedRevision && item.kind === kind && hash === upload.payloadHash ? parsed.data : null;
 }
 private async restoreEntries(raw: unknown[]) {
  const parsed = await Promise.all(raw.map(value => this.checked(value)));
  const blockedIds = new Set<string>(), blockedJobs = new Set<string>();
  raw.forEach((value, i) => {
   if (parsed[i] || !value || typeof value !== "object" || !("upload" in value)) return;
   const upload = value.upload;
   if (!upload || typeof upload !== "object") return;
   if ("commandId" in upload && typeof upload.commandId === "string") blockedIds.add(upload.commandId);
   if ("jobId" in upload && typeof upload.jobId === "string") blockedJobs.add(upload.jobId);
  });
  const restored = restoreOfflineQueueV1(parsed.filter((v): v is Entry => v !== null).map(v => v.reconciliation.item));
  return parsed.map((v, index) => {
   if (!v) return raw[index]; // Invalid encrypted content is quarantined, never discarded or executed.
   const saved = restored.items.find(i => i.commandId === v.upload.commandId)!;
   const item = blockedIds.has(saved.commandId) || blockedJobs.has(saved.jobId) ? { ...saved, status: "needs_review" as const } : saved;
   return { ...v, reconciliation: { ...v.reconciliation, item,
    reason: item.status === "needs_review" ? v.reconciliation.reason ?? "RECOVERED_REVIEW" : v.reconciliation.reason } };
  });
 }
 async enqueue(jobId: string, body: unknown) {
  const boundary = offlineUploadBodyV1.safeParse(body); if (!boundary.success) throw new MobileClientError("MOBILE_DENIED");
  const parsed = boundary.data;
  const upload = offlineUploadV1.parse({ version: "offline-upload.v1", jobId, body: parsed, commandId: parsed.commandId,
   expectedRevision: "expectedRevision" in parsed ? parsed.expectedRevision : null,
   payloadHash: await this.hash.sha256(JSON.stringify({ jobId, body: parsed })) });
  return this.document.transaction(async data => {
   const valid = (await Promise.all(data.queue.map(v => this.checked(v)))).filter((v): v is Entry => v !== null);
   const kind = parsed.version === "log-site-extra.v1" ? "site_extra" : parsed.version === "job-work-state-command.v1" ? "work_state" : "commercial_intent";
   const item = addOfflineQueueItemV1(valid.map(v => v.reconciliation.item), { version: "offline-queue-item.v1", environment: "synthetic_demo",
    commandId: upload.commandId, jobId: upload.jobId, payloadHash: upload.payloadHash, expectedRevision: upload.expectedRevision,
    kind, attemptCount: 0, nextAttemptAtMs: 0, status: "queued" }).find(v => v.commandId === upload.commandId)!;
   const exists = valid.some(v => v.upload.commandId === upload.commandId);
   return { data: { ...data, unsyncedWork: "present" as const, queue: exists ? data.queue : [...data.queue, { upload, reconciliation: { version: "offline-reconciliation.v1", item, reason: null } }] }, result: undefined };
  });
 }
 restore() { return this.document.transaction(async data => ({ data: { ...data, queue: await this.restoreEntries(data.queue) }, result: undefined })); }
 async flushOne(nowMs: number) {
  await this.authorize();
  return this.document.transaction(async (data, checkpoint) => {
   const restoredQueue = await this.restoreEntries(data.queue);
   const valid = (await Promise.all(restoredQueue.map(v => this.checked(v)))).filter((v): v is Entry => v !== null);
   const claim = chooseOfflineQueueItemV1(valid.map(v => v.reconciliation.item), nowMs);
   if (!claim.next) return { data: { ...data, queue: restoredQueue }, result: null };
   const selected = valid.find(v => v.upload.commandId === claim.next!.commandId)!;
   const queue = restoredQueue.map(v => { const parsed = entry.safeParse(v); return parsed.success && parsed.data.upload.commandId === selected.upload.commandId
    ? { ...parsed.data, reconciliation: { ...parsed.data.reconciliation, item: claim.next! } } : v; });
   await checkpoint({ ...data, queue });
   let response: unknown;
   try { response = await this.transport.upload(selected.upload); }
   catch { response = { version: "offline-upload-result.v1", commandId: selected.upload.commandId, state: "retryable", code: "UNAVAILABLE", realExternalActions: 0 }; }
   const reconciliation = reconcileOfflineResultV1({ ...selected.reconciliation, item: claim.next }, response, nowMs);
   const next = queue.map(v => { const parsed = entry.safeParse(v); return parsed.success && parsed.data.upload.commandId === selected.upload.commandId ? { ...parsed.data, reconciliation } : v; });
   return { data: { ...data, queue: next }, result: offlineReconciliationViewV1(reconciliation) };
  });
 }
 async views(): Promise<NativeReconciliationRow[]> {
  await this.authorize();
  return this.document.transaction(async data => ({ data, result: await Promise.all(data.queue.map(async raw => {
   const value = await this.checked(raw); return value ? { ...offlineReconciliationViewV1(value.reconciliation), commandId: value.upload.commandId, jobId: value.upload.jobId }
    : { commandId: null, jobId: null, state: "needs_review" as const, reason: "INVALID_INTENT" as const, choices: ["inspect_saved_intent"] as const, requiresOnlineValidation: true, automaticCommercialActions: false };
  })) }));
 }
}
