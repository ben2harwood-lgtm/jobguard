import { z } from "zod";

const uuid = z.guid();
const hash = z.string().regex(/^[0-9a-f]{64}$/u);
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const offlineCaptureStatusV1 = z.enum(["local_only", "uploading", "verified", "rejected", "conflict"]);
// Normalized facts from the server finalize result, never from status or local hashing.
const verification = z.object({ evidenceId: uuid, objectVersionId: z.string().min(1).max(1024),
  sha256: hash, byteLength: z.number().int().positive().max(25_000_000) }).strict();
export const offlineCaptureItemV1 = z.object({
  version: z.literal("offline-capture-item.v1"), environment: z.literal("synthetic_demo"),
  uploadId: uuid, jobId: uuid, scopeItemId: uuid.nullable(), kind: z.enum(["text", "voice", "photo"]),
  clientSha256: hash,
  clientMetadata: z.object({ deviceCapturedAtMs: time }).strict(),
  contentType: z.enum(["text/plain", "audio/wav", "image/jpeg", "image/png", "image/webp"]),
  byteLength: z.number().int().positive().max(25_000_000), status: offlineCaptureStatusV1,
  serverVerification: verification.nullable(),
}).strict().superRefine((item, ctx) => {
  const kindMatches = item.kind === "text" ? item.contentType === "text/plain"
    : item.kind === "voice" ? item.contentType === "audio/wav" : item.contentType.startsWith("image/");
  const receipt = item.serverVerification;
  if (!kindMatches || (item.status === "verified") !== (receipt !== null) ||
    (receipt && (receipt.evidenceId !== item.uploadId || receipt.sha256 !== item.clientSha256 || receipt.byteLength !== item.byteLength)))
    ctx.addIssue({ code: "custom", message: "Inconsistent capture" });
});
export type OfflineCaptureItemV1 = z.infer<typeof offlineCaptureItemV1>;
export class OfflineCaptureError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "INVALID_TRANSITION") { super(code); this.name = "OfflineCaptureError"; }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new OfflineCaptureError("INVALID_INPUT");
  return result.data;
}
const event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start_upload") }).strict(),
  z.object({ type: z.literal("transfer_interrupted") }).strict(),
  z.object({ type: z.literal("server_rejected") }).strict(),
  z.object({ type: z.literal("conflict") }).strict(),
  z.object({ type: z.literal("server_finalized"), result: verification }).strict(),
]);

/** Pure screen reducer. The caller must supply authenticated server results, not client assertions. */
export function transitionOfflineCaptureV1(rawItem: unknown, rawEvent: unknown): OfflineCaptureItemV1 {
  const item = parse(offlineCaptureItemV1, rawItem), action = parse(event, rawEvent);
  if (action.type === "start_upload" && item.status === "local_only") return { ...item, status: "uploading" };
  if (action.type === "conflict" && (item.status === "local_only" || item.status === "uploading")) return { ...item, status: "conflict" };
  if (item.status === "uploading") {
    if (action.type === "transfer_interrupted") return item;
    if (action.type === "server_rejected") return { ...item, status: "rejected" };
    if (action.type === "server_finalized") {
      const receipt = action.result;
      if (receipt.evidenceId !== item.uploadId || receipt.sha256 !== item.clientSha256 || receipt.byteLength !== item.byteLength)
        return { ...item, status: "conflict" };
      return { ...item, status: "verified", serverVerification: receipt };
    }
  }
  // A finalize replay after restart may only reaffirm the same immutable original.
  if (item.status === "verified" && action.type === "server_finalized" &&
    JSON.stringify(item.serverVerification) === JSON.stringify(action.result)) return item;
  throw new OfflineCaptureError("INVALID_TRANSITION");
}

const serverStatus = z.object({ version: z.literal("resumable-evidence.v1"),
  state: z.enum(["pending", "quarantined", "verified", "rejected"]),
  nextOffset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict();
const uploadInput = z.object({ version: z.literal("offline-capture-upload.v1"), item: offlineCaptureItemV1,
  online: z.boolean(), nowMs: time, currentClientSha256: hash,
  deviceBytesSent: z.number().int().min(0).max(25_000_000),
  server: z.object({ status: serverStatus, expiresAtMs: time }).strict().nullable(),
}).strict();
type UploadStep = (
  { step: "begin" | "finalize" | "status" | "queued" | "done" } |
  { step: "append"; offset: number; byteLength: number } |
  { step: "review"; reason: "closed" | "expired" | "text_transport_unavailable" } |
  { step: "conflict"; reason: "changed_hash" | "offset_beyond_file" | "capture_conflict" }
);

export type OfflineCaptureUploadPlanV1 = { uploadId: string } & UploadStep;

/** No request is executed. Status/expiry must come from the same upload's server responses.
 * deviceBytesSent is deliberately not an offset authority. Begin retries retain the stored expiry.
 */
export function planOfflineCaptureUploadV1(raw: unknown): OfflineCaptureUploadPlanV1 {
  const input = parse(uploadInput, raw), { item, server } = input;
  const next = (plan: UploadStep): OfflineCaptureUploadPlanV1 =>
    ({ uploadId: item.uploadId, ...plan });
  if (input.currentClientSha256 !== item.clientSha256) return next({ step: "conflict", reason: "changed_hash" });
  if (server && server.status.nextOffset > item.byteLength) return next({ step: "conflict", reason: "offset_beyond_file" });
  if (item.status === "conflict") return next({ step: "conflict", reason: "capture_conflict" });
  if (item.status === "rejected") return next({ step: "review", reason: "closed" });
  if (item.status === "verified") return next({ step: "done" });
  if (!input.online) return next({ step: "queued" });
  if (item.kind === "text") return next({ step: "review", reason: "text_transport_unavailable" });
  if (!server) return next({ step: "begin" });
  // Verified status alone is not proof; replay finalize to recover the original result.
  if (server.status.state === "verified") return next({ step: "finalize" });
  if (server.status.state === "rejected") return next({ step: "review", reason: "closed" });
  if (input.nowMs >= server.expiresAtMs) return next({ step: "review", reason: "expired" });
  if (server.status.state === "quarantined") return next({ step: "status" });
  const remaining = item.byteLength - server.status.nextOffset;
  return remaining === 0 ? next({ step: "finalize" })
    : next({ step: "append", offset: server.status.nextOffset, byteLength: Math.min(1_000_000, remaining) });
}

/** Screen eligibility only; the server proof command must still revalidate finalized evidence. */
export function canOfflineCaptureSatisfyStageV1(raw: unknown): boolean {
  return parse(offlineCaptureItemV1, raw).status === "verified";
}

const cleanupInput = z.object({ version: z.literal("offline-capture-cleanup.v1"), item: offlineCaptureItemV1,
  lowStorage: z.boolean(), personChoseDiscard: z.boolean() }).strict();
/** No deletion, gateway call or automatic loss of intent. Voice stays queued until online. */
export function planOfflineCaptureCleanupV1(raw: unknown) {
  const { item, lowStorage, personChoseDiscard } = parse(cleanupInput, raw);
  const mayReleaseLocalCopy = item.status === "verified" || personChoseDiscard;
  return { version: "offline-capture-cleanup-plan.v1" as const, environment: "synthetic_demo" as const,
    uploadId: item.uploadId, mayReleaseLocalCopy, preserveIntent: !personChoseDiscard,
    needsPersonDecision: lowStorage && !mayReleaseLocalCopy,
    voiceProcessing: item.kind === "voice" ? "queued_until_online" as const : "not_applicable" as const };
}
