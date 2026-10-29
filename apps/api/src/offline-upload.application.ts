import type { Pool } from "pg";
import { reviewOfflineCommercialIntent } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { SiteExtraApplication } from "./contractor/site-extra.application.js";
import { JobWorkStateApplication } from "./job-work-state.application.js";
import { OfflineUploadError, offlineUploadV1, offlineUploadPayloadHash, offlineUploadResultV1 } from "./offline-upload.contracts.js";

const failures: Record<string, "IDEMPOTENCY_CONFLICT" | "PERMISSION_REVOKED" | "STALE_REVISION" | "COMPLETION_CONFLICT" | "LOCKED_BILL"> = {
 COMMAND_CONFLICT: "IDEMPOTENCY_CONFLICT", IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT", WORK_STATE_CONFLICT: "IDEMPOTENCY_CONFLICT",
 UNAUTHENTICATED: "PERMISSION_REVOKED", NOT_FOUND: "PERMISSION_REVOKED", EXTRA_FORBIDDEN: "PERMISSION_REVOKED", TRACK_FORBIDDEN: "PERMISSION_REVOKED", WORK_STATE_FORBIDDEN: "PERMISSION_REVOKED",
 WORK_STATE_STALE_REVISION: "STALE_REVISION", JOB_NOT_LIVE: "COMPLETION_CONFLICT", JOB_WORK_CLOSED: "COMPLETION_CONFLICT", INVALID_WORK_STATE_INPUT: "COMPLETION_CONFLICT", CAPACITY_ADMISSION_UNAVAILABLE: "COMPLETION_CONFLICT",
 POST_LOCK_WORK_REQUIRES_LINKED_JOB: "LOCKED_BILL",
};
export class OfflineUploadApplication {
 constructor(private readonly pool: Pool, private readonly sessionId?: string) {}
 async upload(raw: unknown) {
  // This is an unconditional server gate, including direct service callers. D08/G3 remain held.
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new OfflineUploadError("SYNTHETIC_MODE_REQUIRED");
  const parsed = offlineUploadV1.safeParse(raw);
  if (!parsed.success) throw new OfflineUploadError("INVALID_OFFLINE_UPLOAD");
  const intent = parsed.data;
  const result = (state: "acknowledged" | "rejected" | "conflict" | "retryable", code: string) => offlineUploadResultV1.parse({
   version: "offline-upload-result.v1", commandId: intent.commandId, state, code, realExternalActions: 0,
  });
  try {
   // Recheck persisted membership/job ownership for every upload, including identical replays.
   const access = await new PracticeAccess(this.pool, this.sessionId).job(intent.jobId);
   if (intent.payloadHash !== offlineUploadPayloadHash(intent.jobId, intent.body)) return result("rejected", "PAYLOAD_HASH_MISMATCH");
   if (intent.body.version === "offline-commercial-intent.v1") {
    const code = await reviewOfflineCommercialIntent(this.pool, access.context, access.membershipId, intent.jobId, intent.body);
    return result("conflict", code);
   }
   // Dispatch only to existing owning commands: their transaction/receipt/revision checks remain authoritative.
   if (intent.body.version === "log-site-extra.v1") {
    await new SiteExtraApplication(this.pool).log({ version: "contractor-principal.v1", sessionId: this.sessionId }, intent.jobId, intent.body);
   } else {
    await new JobWorkStateApplication(this.pool, this.sessionId).command(intent.jobId, intent.body);
   }
   return result("acknowledged", "RECORDED");
  } catch (error) {
   const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
   const mapped = failures[code];
   if (mapped) return result(mapped === "PERMISSION_REVOKED" ? "rejected" : "conflict", mapped);
   // Lost response/unknown commit outcome: retry the same identity, never acknowledge optimistically.
   return result("retryable", "UNAVAILABLE");
  }
 }
}
