import { createHash } from "node:crypto";
import { offlineUploadBodyV1, type OfflineUploadV1 } from "@jobguard/core";
export { offlineCommercialIntentV1, offlineUploadV1, offlineUploadResultV1, type OfflineUploadV1 } from "@jobguard/core";
export class OfflineUploadError extends Error {
 constructor(readonly code: "SYNTHETIC_MODE_REQUIRED" | "INVALID_OFFLINE_UPLOAD") { super(code); this.name = "OfflineUploadError"; }
}
/** Parsed schemas fix object order; hash only the semantic selector/body, never credentials or capture clocks. */
export function offlineUploadPayloadHash(jobId: string, body: OfflineUploadV1["body"]): string {
 const parsed = offlineUploadBodyV1.parse(body);
 return createHash("sha256").update(JSON.stringify({ jobId, body: parsed })).digest("hex");
}
