import type { Pool } from "pg";
import { z } from "zod";
import { SiteExtraError, logSiteExtraV1, logSiteExtraV3, siteExtraLoggedV1, siteExtraLoggedV3, siteExtraFailureV1, siteExtraHttpStatus, siteExtraContentSha256V1 } from "@jobguard/core";
import { ContractorRepository, SiteExtraRepository, WatchdogError, contractorSessionContext, type AuthenticatedMembership, type VerifiedTenantContext } from "@jobguard/db";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";
export function assertSiteExtraMode(): void {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new SiteExtraError("MODE_FORBIDDEN");
}
export class SiteExtraApplication {
 private readonly repository: SiteExtraRepository;
 constructor(private readonly pool: Pool) { this.repository = new SiteExtraRepository(pool); }
 private async resolveContext(sessionId: string, member: AuthenticatedMembership): Promise<VerifiedTenantContext> {
  try {
   const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
   const tenantId = context.tenantId;
   if (tenantId.toLowerCase() !== member.tenantId.toLowerCase()) throw new SiteExtraError("UNAUTHENTICATED");
   return context;
  } catch (error) {
   if ((error as { code?: string } | null)?.code === "UNAUTHENTICATED") throw new SiteExtraError("UNAUTHENTICATED");
   throw error;
  }
 }
 async log(principal: unknown, jobId: string, raw: unknown) {
  assertSiteExtraMode();
  const session = workOrderPrincipalV1.safeParse(principal); if (!session.success) throw new SiteExtraError("UNAUTHENTICATED");
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(session.data.sessionId);
   // v1 and v3 are separate extensions of one command, not a sequence: a body is exactly one of them.
   const body = logSiteExtraV1.safeParse(raw), bodyV3 = body.success ? undefined : logSiteExtraV3.safeParse(raw);
   if (!body.success && !bodyV3?.success) throw new SiteExtraError("INVALID_COMMAND");
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(session.data.sessionId, member);
   if (bodyV3?.success) {
    const v3 = bodyV3.data, shown = v3.residentConfirmation?.shownContentSha256;
    const result = await this.repository.logSiteExtra(context, member, { commandId: v3.commandId, jobId: job.data, note: v3.note, description: v3.description, ...(v3.photoEvidenceId === undefined ? {} : { photoEvidenceId: v3.photoEvidenceId }), ...(shown === undefined ? {} : { shownContentSha256: shown }) });
    // With no photo and no hash shown the content hash is the pure function of the request; otherwise the database's answer.
    const evidence = result.evidence ?? { photoEvidenceId: null, residentConfirmationEvidenceId: null, contentSha256: siteExtraContentSha256V1({ jobId: job.data, description: v3.description, note: v3.note, photoSha256: null }) };
    return siteExtraLoggedV3.parse({ version: "site-extra-logged.v3", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, extraId: result.variationId, state: "logged", evidence: { ...evidence, contentFormat: "site-extra-content.v1" } });
   }
   if (!body.success) throw new SiteExtraError("INVALID_COMMAND");
   const result = await this.repository.logSiteExtra(context, member, { commandId: body.data.commandId, jobId: job.data, note: body.data.note, description: body.data.description });
   return siteExtraLoggedV1.parse({ version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, extraId: result.variationId, state: "logged" });
  } catch (error) {
   if (error instanceof SiteExtraError || error instanceof WatchdogError) throw error;
   if ((error as { code?: string } | null)?.code === "UNAUTHENTICATED") throw new SiteExtraError("UNAUTHENTICATED");
   throw new SiteExtraError("SITE_EXTRA_UNAVAILABLE");
  }
 }
}
export function siteExtraHttpFailure(error: unknown) {
 if (error instanceof WatchdogError) return { status: error.code === "JOB_NOT_FOUND" ? 404 : 409, body: { code: error.code } };
 if (error instanceof SiteExtraError && error.code === "COMMAND_CONFLICT") return { status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } };
 const code = error instanceof SiteExtraError ? error.code : "SITE_EXTRA_UNAVAILABLE";
 return { status: siteExtraHttpStatus(code), body: siteExtraFailureV1.parse({ version: "site-extra-error.v1", code }) };
}
