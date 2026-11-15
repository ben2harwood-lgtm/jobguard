import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { customerSigninLink, ShadowDemoGuideRepository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";

export class ShadowDemoGuideError extends Error {
 constructor(readonly code: "SYNTHETIC_MODE_REQUIRED" | "INVALID_SHADOW_GUIDE_COMMAND") { super(code); }
}
const linkCommandV1 = z.object({ version: z.literal("shadow-guide-customer-link.v1"), customerId: z.string().uuid(), documentId: z.string().uuid().optional() }).strict();
/** Demo-only (shadow-30000 guide). Refused outside synthetic_demo here and in every route and SQL routine. */
export class ShadowDemoGuideApplication {
 private readonly access: PracticeAccess; private readonly repository: ShadowDemoGuideRepository;
 constructor(pool: Pool, sessionId?: string, private readonly environment = process.env.JOBGUARD_ENV) {
  this.access = new PracticeAccess(pool, sessionId); this.repository = new ShadowDemoGuideRepository(pool);
 }
 private authorize(jobId: string) {
  if (this.environment !== "synthetic_demo") throw new ShadowDemoGuideError("SYNTHETIC_MODE_REQUIRED");
  return this.access.job(jobId);
 }
 async requestSourceHold(jobId: string) { const auth = await this.authorize(jobId); return this.repository.requestSourceHold(auth.context, jobId, auth.digest); }
 async sourceHoldState(jobId: string) { const auth = await this.authorize(jobId); return this.repository.sourceHoldState(auth.context, jobId, auth.digest); }
 async reviewInputs(jobId: string) { const auth = await this.authorize(jobId); return this.repository.reviewInputs(auth.context, jobId, auth.digest); }
 /** Fake delivery: the practice builder is shown the one link it just asked for. */
 async issueCustomerLink(jobId: string, raw: unknown, linkDigest: (secret: string) => string) {
  const auth = await this.authorize(jobId), input = linkCommandV1.safeParse(raw);
  if (!input.success) throw new ShadowDemoGuideError("INVALID_SHADOW_GUIDE_COMMAND");
  const prefix = `${auth.context.tenantId}/${jobId}/${input.data.customerId}`;
  const nonce = randomBytes(32).toString("base64url");
  const reference = `customer-signin-reference.v1:${prefix}/${nonce}`;
  const path = customerSigninLink(reference, linkDigest);
  const secret = path.split("/").at(-1)!;
  const issuanceReference = input.data.documentId
   ? `customer-quote-signin-reference.v1:${prefix}/${input.data.documentId}/${nonce}` : reference;
  await this.repository.issueCustomerLink(auth.context, jobId, input.data.customerId, auth.digest, linkDigest(`customer-link:${secret}`), issuanceReference);
  return { version: "shadow-guide-customer-link-issued.v1" as const, path, delivery: "simulated_delivery" as const, realExternalActions: 0 as const };
 }
}
/** Closed list: SQL diagnostics never reach the page. */
export function shadowDemoGuideFailure(error: unknown): { status: number; code: string } {
 const code = error instanceof Error ? ("code" in error && typeof error.code === "string" && !/^[0-9A-Z]{5}$/u.test(error.code) ? error.code : error.message) : "";
 if (code === "UNAUTHENTICATED") return { status: 401, code };
 if (code === "NOT_FOUND" || code === "FINAL_CHECK_FORBIDDEN") return { status: 404, code: "NOT_FOUND" };
 if (code === "SYNTHETIC_MODE_REQUIRED") return { status: 403, code };
 if (code === "INVALID_SHADOW_GUIDE_COMMAND") return { status: 400, code };
 if (["CUSTOMER_LINK_RATE_LIMITED", "CUSTOMER_REFUSED", "DEMO_SOURCE_HOLD_LOCKED", "DEMO_SOURCE_HOLD_TERMS_REQUIRED", "FINAL_ACCOUNT_LOCK_REQUIRED"].includes(code)) return { status: 409, code };
 return { status: 503, code: "SHADOW_GUIDE_UNAVAILABLE" };
}
