import { z } from "zod";
import { logSiteExtraV1, siteExtraLoggedV1 } from "@jobguard/core";
import type { SyncTransport } from "./sync";
export type LocalRequest = (url: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;
const noteUpload = z.object({ version: z.literal("offline-upload.v1"), commandId: z.guid(), jobId: z.guid(),
 payloadHash: z.string().regex(/^[a-f0-9]{64}$/u), expectedRevision: z.null(), body: logSiteExtraV1 }).strict();
/** Injected authenticated request owns ephemeral session transport; no sign-in substitute.
 * M3-1 note transport uses the contractor's owning route. M3-4 /offline/uploads requires
 * a separate small-builder practice principal and must not be used to bypass that boundary.
 */
export function localApi(base: string, request: LocalRequest): SyncTransport {
 const url = new URL(base);
 if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("LOCAL_API_ONLY");
 return {
  assignedJobs: async () => { const r = await request(new URL("contractor/site/jobs", url).href, { cache: "no-store", redirect: "error" }); if (!r.ok) throw new Error("AUTHORIZED_READ_REFUSED"); return r.json(); },
  upload: async raw => {
   const envelope = noteUpload.parse(raw);
   if (envelope.commandId !== envelope.body.commandId) throw new Error("QUEUE_BINDING_INVALID");
   const r = await request(new URL(`contractor/jobs/${envelope.jobId}/site-extras`, url).href, { method: "POST", redirect: "error", cache: "no-store", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify(envelope.body) });
   const reply = await r.json();
   if (r.status === 201 || r.status === 200) {
    const result = siteExtraLoggedV1.parse(reply);
    if (result.jobId !== envelope.jobId) throw new Error("READ_BINDING_INVALID");
    return { version: "offline-upload-result.v1", commandId: envelope.commandId, state: "acknowledged", code: "RECORDED", realExternalActions: 0 };
   }
   const code = reply && typeof reply === "object" && "code" in reply ? reply.code : null;
   const mapped = r.status === 401 || r.status === 403 || r.status === 404 ? ["rejected", "PERMISSION_REVOKED"]
    : r.status === 409 && code === "IDEMPOTENCY_CONFLICT" ? ["conflict", "IDEMPOTENCY_CONFLICT"]
    : r.status === 409 && code === "JOB_NOT_LIVE" ? ["conflict", "COMPLETION_CONFLICT"]
    : r.status === 400 || r.status === 422 ? ["rejected", "INVALID_INTENT"] : ["retryable", "UNAVAILABLE"];
   return { version: "offline-upload-result.v1", commandId: envelope.commandId, state: mapped[0], code: mapped[1], realExternalActions: 0 };
  },
 };
}
