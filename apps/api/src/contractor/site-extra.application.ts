import type { Pool } from "pg";
import { z } from "zod";
import { SiteExtraError, logSiteExtraV1, logSiteExtraV3, siteExtraLoggedV1, siteExtraLoggedV3, siteExtraFailureV1, siteExtraHttpStatus, siteExtraContentSha256V1 } from "@jobguard/core";
import { ContractorRepository, SiteExtraRepository, WatchdogError, contractorSessionContext, type AuthenticatedMembership, type VerifiedTenantContext } from "@jobguard/db";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";
import { SorSiteExtraError, parseLogSorSiteExtra, parseOrderCheckQuery, parseSorItemsQuery, siteOrderCheckV1, siteSorItemsV1, sorSiteExtraFailureV1, sorSiteExtraHttpStatus, sorSiteExtraLoggedV1 } from "@jobguard/core";
import { SiteVisitRepository } from "@jobguard/db";
import { SiteVisitError, logSiteExtraV2, startSiteVisitV1, parseCompleteSiteVisit, siteVisitStartedV1, siteVisitCompletedV1, siteAssignedJobsV1, siteOrderLinesV1, siteVisitFailureV1, siteVisitHttpStatus, type SiteVisitErrorCode } from "@jobguard/core";
export function assertSiteExtraMode(): void {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new SiteExtraError("MODE_FORBIDDEN");
}
export class SiteExtraApplication {
 private readonly repository: SiteExtraRepository;
 private readonly visits: SiteVisitRepository;
 constructor(private readonly pool: Pool) { this.repository = new SiteExtraRepository(pool); this.visits = new SiteVisitRepository(pool); }
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
   // v2 and v3 are separate extensions of v1, not a sequence: a body is exactly one of them.
   const body = logBodyOf(raw), bodyV3 = body ? undefined : logSiteExtraV3.safeParse(raw);
   if (!body && !bodyV3?.success) throw new SiteExtraError("INVALID_COMMAND");
   const job = z.guid({ error: "Invalid uuid" }).safeParse(jobId); if (!job.success) throw new SiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(session.data.sessionId, member);
   if (bodyV3?.success) {
    const v3 = bodyV3.data, shown = v3.residentConfirmation?.shownContentSha256;
    const result = await this.repository.logSiteExtra(context, member, { commandId: v3.commandId, jobId: job.data, note: v3.note, description: v3.description, ...(v3.photoEvidenceId === undefined ? {} : { photoEvidenceId: v3.photoEvidenceId }), ...(shown === undefined ? {} : { shownContentSha256: shown }) });
    // With no photo and no hash shown the content hash is the pure function of the request; otherwise the database's answer.
    const evidence = result.evidence ?? { photoEvidenceId: null, residentConfirmationEvidenceId: null, contentSha256: siteExtraContentSha256V1({ jobId: job.data, description: v3.description, note: v3.note, photoSha256: null }) };
    return siteExtraLoggedV3.parse({ version: "site-extra-logged.v3", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, extraId: result.variationId, state: "logged", evidence: { ...evidence, contentFormat: "site-extra-content.v1" } });
   }
   if (!body) throw new SiteExtraError("INVALID_COMMAND");
   const result = await this.repository.logSiteExtra(context, member, { commandId: body.commandId, jobId: job.data, note: body.note, description: body.description, ...("siteVisitId" in body ? { siteVisitId: body.siteVisitId } : {}) });
   return siteExtraLoggedV1.parse({ version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, extraId: result.variationId, state: "logged" });
  } catch (error) {
   if (error instanceof SiteExtraError || error instanceof WatchdogError) throw error;
   if ((error as { code?: string } | null)?.code === "UNAUTHENTICATED") throw new SiteExtraError("UNAUTHENTICATED");
   throw new SiteExtraError("SITE_EXTRA_UNAVAILABLE");
  }
 }
 // ---- ENT-3c additions (append-only): the priced log and the two site reads, each in the same order as `log`: mode, principal, session, input, path, context, repository. ----
 // The context is bound to a const in each method and handed straight to the repository (the boundary scanner refuses it inside a callback or a container).
 private sorEntry(principal: unknown): string {
  try { assertSiteExtraMode(); } catch { throw new SorSiteExtraError("MODE_FORBIDDEN"); }
  const session = workOrderPrincipalV1.safeParse(principal); if (!session.success) throw new SorSiteExtraError("UNAUTHENTICATED");
  return session.data.sessionId;
 }
 private sorError(error: unknown): SorSiteExtraError {
  if (error instanceof SorSiteExtraError) return error;
  if (error instanceof SiteExtraError && error.code === "UNAUTHENTICATED") return new SorSiteExtraError("UNAUTHENTICATED");
  if ((error as { code?: string } | null)?.code === "UNAUTHENTICATED") return new SorSiteExtraError("UNAUTHENTICATED");
  return new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
 }
 async logSor(principal: unknown, jobId: string, raw: unknown) {
  const sessionId = this.sorEntry(principal);
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(sessionId);
   const body = parseLogSorSiteExtra(raw);
   const job = z.guid({ error: "Invalid uuid" }).safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.repository.logSorSiteExtra(context, member, { commandId: body.commandId, jobId: job.data, sorCode: body.sorCode, quantity: body.quantity, ...(body.orderLineScopeItemId ? { orderLineScopeItemId: body.orderLineScopeItemId } : {}), note: body.note });
   return sorSiteExtraLoggedV1.parse({ version: "sor-site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, extraId: result.variationId, state: "logged", priceSource: result.priceSource,
    orderCheck: { outcome: result.coverage === "new" ? "new" : "more_than_ordered", sorCode: result.sorCode, unit: result.unit, claimedQuantity: result.claimedQuantity, instructedQuantity: result.instructedQuantity, extraQuantity: result.extraQuantity, orderLineScopeItemId: result.orderLineScopeItemId } });
  } catch (error) { throw this.sorError(error); }
 }
 async sorItems(principal: unknown, jobId: string, query: unknown) {
  const sessionId = this.sorEntry(principal);
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(sessionId);
   const parsed = parseSorItemsQuery(query);
   const job = z.guid({ error: "Invalid uuid" }).safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.repository.sorItems(context, member, job.data, parsed);
   return siteSorItemsV1.parse({ version: "site-sor-items.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, sorVersionId: result.sorVersionId, items: result.items, truncated: result.truncated });
  } catch (error) { throw this.sorError(error); }
 }
 async orderCheck(principal: unknown, jobId: string, query: unknown) {
  const sessionId = this.sorEntry(principal);
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(sessionId);
   const parsed = parseOrderCheckQuery(query);
   const job = z.guid({ error: "Invalid uuid" }).safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.repository.orderCheck(context, member, job.data, parsed);
   return siteOrderCheckV1.parse({ version: "site-order-check.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, orderCheck: result });
  } catch (error) { throw this.sorError(error); }
 }
 /** ENT-3b: each method keeps the order of `log`: mode, principal, persisted session, body, path ids, context (the one resolver above), repository, result. */
 private async visitRequest<T>(principal: unknown, work: (sessionId: string, member: AuthenticatedMembership) => Promise<T>): Promise<T> {
  visitMode();
  const session = workOrderPrincipalV1.safeParse(principal); if (!session.success) throw new SiteVisitError("UNAUTHENTICATED");
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(session.data.sessionId);
   return await work(session.data.sessionId, member);
  } catch (error) { throw siteVisitError(error); }
 }
 async startVisit(principal: unknown, jobId: string, raw: unknown) {
  return this.visitRequest(principal, async (sessionId, member) => {
   const body = startSiteVisitV1.safeParse(raw); if (!body.success) throw new SiteVisitError("INVALID_COMMAND");
   const job = z.guid({ error: "Invalid uuid" }).safeParse(jobId); if (!job.success) throw new SiteVisitError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.visits.startVisit(context, member, { commandId: body.data.commandId, jobId: job.data });
   return siteVisitStartedV1.parse({ version: "site-visit-started.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, visitId: result.visitId, startedAt: result.startedAt });
  });
 }
 async completeVisit(principal: unknown, jobId: string, visitId: string, raw: unknown) {
  return this.visitRequest(principal, async (sessionId, member) => {
   const body = parseCompleteSiteVisit(raw); if (!body.ok) throw new SiteVisitError(body.code);
   const job = z.guid({ error: "Invalid uuid" }).safeParse(jobId), visit = z.guid({ error: "Invalid uuid" }).safeParse(visitId); if (!job.success || !visit.success) throw new SiteVisitError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.visits.completeVisit(context, member, { commandId: body.data.commandId, jobId: job.data, visitId: visit.data, closeoutAnswer: body.data.closeoutAnswer });
   return siteVisitCompletedV1.parse({ version: "site-visit-completed.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, visitId: result.visitId, completedAt: result.completedAt, closeoutAnswer: result.closeoutAnswer });
  });
 }
 async assignedJobs(principal: unknown) {
  return this.visitRequest(principal, async (sessionId, member) => {
   const context = await this.resolveContext(sessionId, member);
   const result = await this.visits.assignedJobs(context, member);
   return siteAssignedJobsV1.parse({ version: "site-assigned-jobs.v1", environment: "synthetic_demo", realExternalActions: 0, jobs: result.jobs, truncated: result.truncated });
  });
 }
 async orderLines(principal: unknown, jobId: string) {
  return this.visitRequest(principal, async (sessionId, member) => {
   const job = z.guid({ error: "Invalid uuid" }).safeParse(jobId); if (!job.success) throw new SiteVisitError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.visits.orderLines(context, member, job.data);
   return siteOrderLinesV1.parse({ version: "site-order-lines.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: result.jobId, workOrderId: result.workOrderId, revision: result.revision, lines: result.lines });
  });
 }
}
export function siteExtraHttpFailure(error: unknown) {
 if (error instanceof WatchdogError) return { status: error.code === "JOB_NOT_FOUND" ? 404 : 409, body: { code: error.code } };
 if (error instanceof SiteExtraError && error.code === "COMMAND_CONFLICT") return { status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } };
 const code = error instanceof SiteExtraError ? error.code : "SITE_EXTRA_UNAVAILABLE";
 return { status: siteExtraHttpStatus(code), body: siteExtraFailureV1.parse({ version: "site-extra-error.v1", code }) };
}
/** ENT-3c: the failure answer of the priced log and the two reads. Version and code only; anything unexpected, PostgreSQL text included, is SITE_PRICING_UNAVAILABLE. */
export function sorSiteExtraHttpFailure(error: unknown) {
 const code = error instanceof SorSiteExtraError ? error.code : "SITE_PRICING_UNAVAILABLE";
 return { status: sorSiteExtraHttpStatus(code), body: sorSiteExtraFailureV1.parse({ version: "sor-site-extra-error.v1", code }) };
}

function visitMode(): void { try { assertSiteExtraMode(); } catch { throw new SiteVisitError("MODE_FORBIDDEN"); } }
/** Version 1 or version 2 of the log body; null when neither is valid. */
function logBodyOf(raw: unknown) {
 const parsed = (raw as { version?: unknown } | null)?.version === "log-site-extra.v2" ? logSiteExtraV2.safeParse(raw) : logSiteExtraV1.safeParse(raw);
 return parsed.success ? parsed.data : null;
}
const sharedCodes: readonly SiteVisitErrorCode[] = ["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN"];
/** Only the closed codes survive; nothing from the database does. */
function siteVisitError(error: unknown): SiteVisitError {
 if (error instanceof SiteVisitError) return error;
 if (error instanceof SiteExtraError && sharedCodes.includes(error.code as SiteVisitErrorCode)) return new SiteVisitError(error.code as SiteVisitErrorCode);
 if (error instanceof WatchdogError) return new SiteVisitError(error.code === "JOB_NOT_LIVE" ? "JOB_NOT_LIVE" : error.code === "IDEMPOTENCY_CONFLICT" ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND");
 if ((error as { code?: string } | null)?.code === "UNAUTHENTICATED") return new SiteVisitError("UNAUTHENTICATED");
 return new SiteVisitError("SITE_VISIT_UNAVAILABLE");
}
export function siteVisitHttpFailure(error: unknown) {
 const code = siteVisitError(error).code;
 return { status: siteVisitHttpStatus(code), body: siteVisitFailureV1.parse({ version: "site-visit-error.v1", code }) };
}
