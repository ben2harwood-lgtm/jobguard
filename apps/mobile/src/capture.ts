import { z } from "zod";
import { offlineCaptureItemV1, planOfflineCaptureUploadV1 } from "@jobguard/core";
import { MobileClientError } from "./lifecycle-contracts";
import { WorkspaceDocument, type NativeAuthority } from "./workspace-document";
import type { HashPort } from "./sync";
const input = z.object({ uploadId: z.guid(), jobId: z.guid(), scopeItemId: z.guid().nullable(), text: z.string().startsWith("Fictional ").max(5000), capturedAtMs: z.number().int().nonnegative().safe() }).strict();
/** Bounded synthetic text persists inside SQLCipher. General voice/photo bytes never enter this adapter. */
export class NativeCaptures {
 constructor(private readonly document: WorkspaceDocument, private readonly authority: NativeAuthority, private readonly hash: HashPort) {}
 async text(raw: unknown) {
  const parsed = input.safeParse(raw); if (!parsed.success) throw new MobileClientError("MOBILE_DENIED");
  const value = parsed.data;
  let byteLength = 0;
  for (const char of value.text) { const code = char.codePointAt(0)!; byteLength += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  const item = offlineCaptureItemV1.parse({ version: "offline-capture-item.v1", environment: "synthetic_demo", uploadId: value.uploadId,
   jobId: value.jobId, scopeItemId: value.scopeItemId, kind: "text", clientSha256: await this.hash.sha256(value.text),
   clientMetadata: { deviceCapturedAtMs: value.capturedAtMs }, contentType: "text/plain", byteLength, status: "local_only", serverVerification: null });
  return this.document.transaction(async data => {
   const previous = data.captures.find(c => c.item.uploadId === item.uploadId);
   if (previous && JSON.stringify(previous) !== JSON.stringify({ item, text: value.text })) throw new Error("capture identity conflict");
   return { data: { ...data, unsyncedWork: "present" as const, captures: previous ? data.captures : [...data.captures, { item, text: value.text }] }, result: undefined };
  });
 }
 media(kind: "voice" | "photo", permission: "granted" | "denied" | "unavailable") {
  z.enum(["voice", "photo"]).parse(kind); z.enum(["granted", "denied", "unavailable"]).parse(permission);
  return { state: "held" as const, kind, reason: permission === "granted" ? "D08_ENCRYPTED_MEDIA_REQUIRED" : "PERMISSION_REQUIRED", realExternalActions: 0 as const };
 }
 async views() {
  try { await this.authority.assertCurrent(this.document.partition); } catch { throw new MobileClientError("MOBILE_DENIED"); }
  return this.document.transaction(async data => ({ data, result: data.captures.map(c => ({ uploadId: c.item.uploadId, jobId: c.item.jobId, status: c.item.status, isServerProof: false as const })) }));
 }
 async planTextUpload(uploadId: string, nowMs: number) {
  try { await this.authority.assertCurrent(this.document.partition); } catch { throw new MobileClientError("MOBILE_DENIED"); }
  return this.document.transaction(async data => {
   const capture = data.captures.find(c => c.item.uploadId === uploadId); if (!capture) throw new Error("missing capture");
   return { data, result: planOfflineCaptureUploadV1({ version: "offline-capture-upload.v1", item: capture.item, online: true,
    nowMs, currentClientSha256: await this.hash.sha256(capture.text), deviceBytesSent: 0, server: null }) };
  });
 }
}
