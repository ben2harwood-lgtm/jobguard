import { z } from "zod";
import { offlineCaptureItemV1, planOfflineCaptureUploadV1, transitionOfflineCaptureV1 } from "@jobguard/core";
import { inlineAttachmentV1, MobileClientError, type LocalData } from "./lifecycle-contracts";
import type { NativeAuthority, WorkspaceDocument } from "./workspace-document";

export interface NativeCaptureTransport {
 // The injected transport owns credentials. No tenant or actor is accepted in a capture request.
 transfer(request: unknown): Promise<unknown>;
}
export type FictionalAttachment = { base64: string; contentType: "image/png" | "image/jpeg" | "image/webp" | "audio/wav" };
export type CaptureView = ReturnType<typeof captureViews>[number];

const version = "native-capture-upload.v1" as const;
const time = z.number().int().nonnegative().max(8_640_000_000_000_000);
const offset = z.number().int().nonnegative().max(25_000_000);
const digest = z.string().regex(/^[0-9a-f]{64}$/u);
const guid = z.guid().transform(id => id.toLowerCase());
const contentType = z.enum(["image/png", "image/jpeg", "image/webp", "audio/wav"]);
const input = z.object({ version: z.literal(version), environment: z.literal("synthetic_demo"),
 attachment: inlineAttachmentV1.extend({ id: guid }), jobId: guid, scopeItemId: guid.nullable(),
 capturedAtMs: time, expiresAtMs: time, finalizeCommandId: guid, contentType }).strict();
const beginReply = z.object({ uploadId: z.guid(), jobId: z.guid(), scopeItemId: z.guid().nullable(),
 clientSha256: digest, capturedAtMs: time, expiresAtMs: time, byteLength: offset, contentType }).strict();
const statusReply = z.object({ version: z.literal("resumable-evidence.v1"),
 state: z.enum(["pending", "quarantined", "verified", "rejected"]), nextOffset: offset }).strict();
const checkedStatus = z.object({ status: statusReply, checkedAtMs: time }).strict();
const appendReply = z.object({ nextOffset: offset }).strict();
const finalizeReply = z.object({ jobId: z.guid(), scopeItemId: z.guid().nullable(), evidenceId: z.guid(),
 objectVersionId: z.string().min(1).max(1024), sha256: digest, byteLength: offset.positive() }).strict();
const refusal = z.object({ outcome: z.enum(["conflict", "rejected", "retry"]) }).strict();
// One bounded inline attachment fits at most three chunks. Use binary bytes on the injected port.
const chunkBytes = 32 * 1024;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decode(base64: string) {
 const length = base64.length * 3 / 4 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
 const bytes = new Uint8Array(length);
 let target = 0;
 for (let source = 0; source < base64.length; source += 4) {
  const a = alphabet.indexOf(base64[source]!), b = alphabet.indexOf(base64[source + 1]!);
  const c = alphabet.indexOf(base64[source + 2]!), d = alphabet.indexOf(base64[source + 3]!);
  bytes[target++] = (a << 2) | (b >> 4);
  if (c >= 0) bytes[target++] = (b << 4) | (c >> 2);
  if (d >= 0) bytes[target++] = (c << 6) | d;
 }
 return bytes;
}

export function captureViews(data: LocalData) {
 return data.captures.map(({ item, upload }) => ({
  uploadId: item.uploadId, jobId: item.jobId, scopeItemId: item.scopeItemId, kind: item.kind,
  status: item.status, isServerProof: item.status === "verified", nextOffset: upload?.nextOffset ?? 0,
  byteLength: item.byteLength,
 }));
}

type DigestBytes = (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
export class NativeCaptureUpload {
 constructor(private readonly document: WorkspaceDocument, private readonly authority: NativeAuthority,
  private readonly transport: NativeCaptureTransport, private readonly sha256: DigestBytes) {}

 async keep(raw: unknown) {
  const value = input.parse(raw);
  const bytes = decode(value.attachment.base64);
  if (!bytes.length || value.finalizeCommandId === value.attachment.id) throw new MobileClientError("MOBILE_DENIED");
  const item = offlineCaptureItemV1.parse({ version: "offline-capture-item.v1", environment: value.environment,
   uploadId: value.attachment.id, jobId: value.jobId, scopeItemId: value.scopeItemId,
   kind: value.contentType === "audio/wav" ? "voice" : "photo", contentType: value.contentType,
   clientSha256: await this.sha256(bytes), clientMetadata: { deviceCapturedAtMs: value.capturedAtMs },
   byteLength: bytes.length, status: "local_only", serverVerification: null });
  const intent = { finalizeCommandId: value.finalizeCommandId, requestedExpiresAtMs: value.expiresAtMs, serverExpiresAtMs: null, nextOffset: 0 };
  await this.document.transaction(async data => {
   const previous = data.captures.find(c => c.item.uploadId === item.uploadId);
   const file = data.files.find(f => f.id === item.uploadId);
   if (previous) {
    const original = { ...previous.item, status: "local_only", serverVerification: null };
    if (JSON.stringify(original) !== JSON.stringify(item) || file?.base64 !== value.attachment.base64 ||
      previous.upload?.finalizeCommandId !== intent.finalizeCommandId || previous.upload.requestedExpiresAtMs !== intent.requestedExpiresAtMs) {
     throw new MobileClientError("MOBILE_DENIED");
    }
    return { data, result: undefined };
   }
   if (file || data.captures.some(c => c.upload?.finalizeCommandId === intent.finalizeCommandId)) throw new MobileClientError("MOBILE_DENIED");
   return { data: { ...data, unsyncedWork: "present", files: [...data.files, value.attachment],
    captures: [...data.captures, { item, upload: intent }] }, result: undefined };
  });
 }

 async transfer(rawUploadId: string, onProgress?: (rows: CaptureView[]) => void) {
  const uploadId = guid.parse(rawUploadId);
  const partition = this.document.partition;
  await this.authority.assertCurrent(partition);
  return this.document.transaction(async (data, checkpoint) => {
   const index = data.captures.findIndex(c => c.item.uploadId === uploadId);
   const capture = data.captures[index];
   if (!capture?.upload) throw new MobileClientError("MOBILE_DENIED");
   let { item, upload } = capture;
   const updated = () => ({ ...data, captures: data.captures.map((saved, i) => i === index ? { item, upload } : saved) });
   const finish = () => ({ data: updated(), result: captureViews(updated()) });
   if (item.status !== "local_only" && item.status !== "uploading") return finish();
   const bytes = decode(data.files.find(f => f.id === uploadId)!.base64);
   const currentClientSha256 = await this.sha256(bytes);
   let status: z.infer<typeof statusReply> | null = null;
   let checkedAtMs = 0;
   const plan = () => planOfflineCaptureUploadV1({ version: "offline-capture-upload.v1", item, online: true,
    nowMs: checkedAtMs, currentClientSha256, deviceBytesSent: upload.nextOffset,
    server: status && upload.serverExpiresAtMs !== null ? { status, expiresAtMs: upload.serverExpiresAtMs } : null });
   if (plan().step === "conflict" || bytes.length !== item.byteLength) {
    item = transitionOfflineCaptureV1(item, { type: "conflict" });
    return finish();
   }
   const saveProgress = async () => {
    await checkpoint(updated());
    onProgress?.(captureViews(updated()));
   };
   if (item.status === "local_only") {
    item = transitionOfflineCaptureV1(item, { type: "start_upload" });
    await saveProgress();
   }
   const access = { version, uploadId, jobId: item.jobId };
   const send = async <T>(action: string, fields: object, schema: z.ZodType<T>) => {
    await this.authority.assertCurrent(partition);
    let reply: unknown;
    try { reply = await this.transport.transfer({ ...access, action, ...fields }); }
    catch { /* An unknown outcome keeps the same intent for status/replay. */ }
    await this.authority.assertCurrent(partition);
    const refused = refusal.safeParse(reply);
    if (refused.success) {
     if (refused.data.outcome === "rejected") item = transitionOfflineCaptureV1(item, { type: "server_rejected" });
     if (refused.data.outcome === "conflict") item = transitionOfflineCaptureV1(item, { type: "conflict" });
     return null;
    }
    const parsed = schema.safeParse(reply);
    return parsed.success ? parsed.data : null;
   };
   if (upload.serverExpiresAtMs === null) {
    const metadata = { scopeItemId: item.scopeItemId, clientSha256: item.clientSha256,
     capturedAtMs: item.clientMetadata.deviceCapturedAtMs, byteLength: item.byteLength, contentType: item.contentType };
    const begun = await send("begin", { ...metadata, expiresAtMs: upload.requestedExpiresAtMs }, beginReply);
    if (!begun) return finish();
    if (begun.uploadId !== uploadId || begun.jobId !== item.jobId || begun.expiresAtMs > upload.requestedExpiresAtMs ||
      begun.scopeItemId !== metadata.scopeItemId || begun.clientSha256 !== metadata.clientSha256 ||
      begun.capturedAtMs !== metadata.capturedAtMs || begun.byteLength !== metadata.byteLength || begun.contentType !== metadata.contentType) {
     item = transitionOfflineCaptureV1(item, { type: "conflict" });
     return finish();
    }
    upload = { ...upload, serverExpiresAtMs: begun.expiresAtMs };
    await saveProgress();
   }
   const checked = await send("status", {}, checkedStatus);
   if (!checked) return finish();
   status = checked.status;
   checkedAtMs = checked.checkedAtMs;
   while (true) {
    const step = plan();
    if (step.step === "conflict") { item = transitionOfflineCaptureV1(item, { type: "conflict" }); break; }
    upload = { ...upload, nextOffset: status.nextOffset };
    if (step.step === "review") { item = transitionOfflineCaptureV1(item, { type: "server_rejected" }); break; }
    await saveProgress();
    if (step.step === "append") {
     const end = step.offset + Math.min(step.byteLength, chunkBytes);
     const reply = await send("append", { offset: step.offset, bytes: bytes.slice(step.offset, end) }, appendReply);
     if (!reply || reply.nextOffset !== end) break;
     status = { ...status, nextOffset: reply.nextOffset };
     continue;
    }
    // The service quarantines only a complete file. Replay also recovers interruption during validation.
    if (step.step === "finalize" || (step.step === "status" && status.nextOffset === item.byteLength)) {
     const reply = await send("finalize", { commandId: upload.finalizeCommandId }, finalizeReply);
     if (reply) {
      const { jobId, scopeItemId, ...result } = reply;
      item = transitionOfflineCaptureV1(item, jobId === item.jobId && scopeItemId === item.scopeItemId
       ? { type: "server_finalized", result } : { type: "conflict" });
     }
    }
    break;
   }
   return finish();
  });
 }
}
