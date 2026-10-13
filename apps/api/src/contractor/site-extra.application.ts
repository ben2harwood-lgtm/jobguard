import type { Pool } from "pg";
import { z } from "zod";
import { SiteExtraError, logSiteExtraV1, siteExtraLoggedV1, siteExtraFailureV1, siteExtraHttpStatus } from "@jobguard/core";
import { ContractorRepository, SiteExtraRepository, WatchdogError, contractorSessionContext, type AuthenticatedMembership, type VerifiedTenantContext } from "@jobguard/db";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";
import { SorSiteExtraError, parseLogSorSiteExtra, parseOrderCheckQuery, parseSorItemsQuery, siteOrderCheckV1, siteSorItemsV1, sorSiteExtraFailureV1, sorSiteExtraHttpStatus, sorSiteExtraLoggedV1 } from "@jobguard/core";
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
   const body = logSiteExtraV1.safeParse(raw); if (!body.success) throw new SiteExtraError("INVALID_COMMAND");
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(session.data.sessionId, member);
   const result = await this.repository.logSiteExtra(context, member, { commandId: body.data.commandId, jobId: job.data, note: body.data.note, description: body.data.description });
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
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
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
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
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
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SorSiteExtraError("NOT_FOUND");
   const context = await this.resolveContext(sessionId, member);
   const result = await this.repository.orderCheck(context, member, job.data, parsed);
   return siteOrderCheckV1.parse({ version: "site-order-check.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, orderCheck: result });
  } catch (error) { throw this.sorError(error); }
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
