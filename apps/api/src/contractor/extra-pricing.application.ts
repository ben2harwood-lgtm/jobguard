// EP-CC-S1: contractor HTTP adapter for pricing contract v2 (docs/contracts/extra-price-rules-v2.md). Thin: the session names the actor,
// the path names the job and extra, and the repository and database do everything else (basis, money, permission, state). No amount is computed here.
import type { Pool } from "pg";
import { z } from "zod";
import { ContractorRepository, ExtraApprovalError, ExtraApprovalRepository, contractorSessionContext, extraApprovalErrorCodes, type AuthenticatedMembership, type VerifiedTenantContext } from "@jobguard/db";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";

export const extraPricingErrorCodes = ["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", ...extraApprovalErrorCodes] as const;
export type ExtraPricingErrorCode = typeof extraPricingErrorCodes[number];
export class ExtraPricingError extends Error {
 constructor(readonly code: ExtraPricingErrorCode) { super(code); this.name = "ExtraPricingError"; }
}
export const extraPricingFailureV1 = z.object({ version: z.literal("extra-pricing-error.v1"), code: z.enum(extraPricingErrorCodes) }).strict();
export function assertExtraPricingMode(): void {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ExtraPricingError("MODE_FORBIDDEN");
}
const refused = new Set<ExtraPricingErrorCode>(["MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "PERMISSION_DENIED"]);
const missing = new Set<ExtraPricingErrorCode>(["NOT_FOUND", "RATE_NOT_FOUND", "EVIDENCE_NOT_FOUND"]);
const malformed = new Set<ExtraPricingErrorCode>(["INVALID_COMMAND", "BASIS_REQUIRED", "INVALID_BASIS", "INVALID_QUANTITY", "REVISION_REASON_REQUIRED", "MONEY_OUT_OF_RANGE"]);
export function extraPricingHttpStatus(code: ExtraPricingErrorCode): number {
 return code === "UNAUTHENTICATED" ? 401 : refused.has(code) ? 403 : missing.has(code) ? 404 : malformed.has(code) ? 422 : code === "DATABASE_UNAVAILABLE" ? 503 : 409;
}
/** Version and closed code only; anything unexpected, PostgreSQL text included, is DATABASE_UNAVAILABLE. */
export function extraPricingHttpFailure(error: unknown) {
 const code = error instanceof ExtraPricingError || error instanceof ExtraApprovalError ? error.code : "DATABASE_UNAVAILABLE";
 return { status: extraPricingHttpStatus(code), body: extraPricingFailureV1.parse({ version: "extra-pricing-error.v1", code }) };
}
const pathIds = (jobId: string, extraId: string) => {
 const job = z.guid().safeParse(jobId), extra = z.guid().safeParse(extraId);
 if (!job.success || !extra.success) throw new ExtraPricingError("NOT_FOUND");
 return { jobId: job.data.toLowerCase(), extraId: extra.data.toLowerCase() };
};
/** The body names its version and its own fields; the job and extra come only from the path. The repository parses the rest strictly. */
const bodyOf = (raw: unknown, version: "price-extra.v2" | "revise-extra.v2") => {
 if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new ExtraPricingError("INVALID_COMMAND");
 const body = raw as Record<string, unknown>;
 if (body.version !== version || "jobId" in body || "extraId" in body) throw new ExtraPricingError("INVALID_COMMAND");
 return body;
};

export class ExtraPricingApplication {
 private readonly repository: ExtraApprovalRepository;
 constructor(private readonly pool: Pool) { this.repository = new ExtraApprovalRepository(pool); }
 private async session(principal: unknown): Promise<{ member: AuthenticatedMembership; sessionId: string }> {
  assertExtraPricingMode();
  const session = workOrderPrincipalV1.safeParse(principal); if (!session.success) throw new ExtraPricingError("UNAUTHENTICATED");
  try { return { member: await new ContractorRepository(this.pool).resolveSession(session.data.sessionId), sessionId: session.data.sessionId }; }
  catch { throw new ExtraPricingError("UNAUTHENTICATED"); }
 }
 private async resolveContext(sessionId: string, member: AuthenticatedMembership): Promise<VerifiedTenantContext> {
  try {
   const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
   if (context.tenantId.toLowerCase() !== member.tenantId.toLowerCase()) throw new ExtraPricingError("UNAUTHENTICATED");
   return context;
  } catch { throw new ExtraPricingError("UNAUTHENTICATED"); }
 }
 /** POST price-extra.v2: first or late pricing with a stated basis. */
 async price(principal: unknown, jobId: string, extraId: string, raw: unknown) {
  const { member, sessionId } = await this.session(principal);
  const ids = pathIds(jobId, extraId), body = bodyOf(raw, "price-extra.v2");
  const context = await this.resolveContext(sessionId, member);
  return this.repository.priceExtra(context, member, { ...body, ...ids });
 }
 /** POST revise-extra.v2: a new price with a reason and the request it answers. */
 async revise(principal: unknown, jobId: string, extraId: string, raw: unknown) {
  const { member, sessionId } = await this.session(principal);
  const ids = pathIds(jobId, extraId), body = bodyOf(raw, "revise-extra.v2");
  const context = await this.resolveContext(sessionId, member);
  return this.repository.reviseExtra(context, member, { ...body, ...ids });
 }
 /** GET: each price's recorded basis, or "basis_not_recorded" for a price made before v2 without one. */
 async basis(principal: unknown, jobId: string, extraId: string) {
  const { member, sessionId } = await this.session(principal);
  const ids = pathIds(jobId, extraId);
  const context = await this.resolveContext(sessionId, member);
  return this.repository.pricingBasis(context, member, { version: "extra-pricing-basis-query.v1", ...ids });
 }
}
