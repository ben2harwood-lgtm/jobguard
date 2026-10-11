import type { Pool } from "pg";
import { z } from "zod";
import { SiteExtraError, logSiteExtraV1, siteExtraLoggedV1, siteExtraFailureV1, siteExtraHttpStatus } from "@jobguard/core";
import { ContractorRepository, SiteExtraRepository, type AuthenticatedMembership } from "@jobguard/db";
import { AuthError, type AuthProvider } from "../auth/auth-provider.js";
import { resolveVerifiedTenantContext } from "../auth/principal-bridge.js";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";
export function assertSiteExtraMode(): void {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new SiteExtraError("MODE_FORBIDDEN");
}
/** Second copy of ENT-10b's persisted-session adapter; replacement is confined to this function. */
async function contextForContractorSession(sessionId: string, member: AuthenticatedMembership) {
 const denied = async (): Promise<never> => { throw new AuthError("UNAUTHENTICATED"); };
 const credential = "ent3a-internal-bridge" + "-credential";
 const origin = "https://site-extra.fictional.invalid";
 const provider: AuthProvider = {
  requestCode: denied, verifyCode: denied,
  authenticate: async value => value === sessionId ? { identityUserId: member.identityUserId, sessionId, csrfToken: credential } : undefined,
  findMembership: async (principal, tenantId) => principal.identityUserId === member.identityUserId && tenantId === member.tenantId ? { id: member.membershipId, identityUserId: member.identityUserId, tenantId: member.tenantId, role: "read_only", email: "generated@fictional.invalid" } : undefined,
 };
 return resolveVerifiedTenantContext(provider, { sessionToken: sessionId, requestedTenantId: member.tenantId, csrfToken: credential, origin }, origin);
}
export class SiteExtraApplication {
 private readonly repository: SiteExtraRepository;
 constructor(private readonly pool: Pool) { this.repository = new SiteExtraRepository(pool); }
 async log(principal: unknown, jobId: string, raw: unknown) {
  assertSiteExtraMode();
  const session = workOrderPrincipalV1.safeParse(principal); if (!session.success) throw new SiteExtraError("UNAUTHENTICATED");
  try {
   const member = await new ContractorRepository(this.pool).resolveSession(session.data.sessionId);
   const body = logSiteExtraV1.safeParse(raw); if (!body.success) throw new SiteExtraError("INVALID_COMMAND");
   const job = z.string().uuid().safeParse(jobId); if (!job.success) throw new SiteExtraError("NOT_FOUND");
   const context = await contextForContractorSession(session.data.sessionId, member);
   const result = await this.repository.logSiteExtra(context, member, { commandId: body.data.commandId, jobId: job.data, note: body.data.note, description: body.data.description });
   return siteExtraLoggedV1.parse({ version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job.data, extraId: result.variationId, state: "logged" });
  } catch (error) {
   if (error instanceof SiteExtraError) throw error;
   if ((error as { code?: string } | null)?.code === "UNAUTHENTICATED") throw new SiteExtraError("UNAUTHENTICATED");
   throw new SiteExtraError("SITE_EXTRA_UNAVAILABLE");
  }
 }
}
export function siteExtraHttpFailure(error: unknown) {
 const code = error instanceof SiteExtraError ? error.code : "SITE_EXTRA_UNAVAILABLE";
 return { status: siteExtraHttpStatus(code), body: siteExtraFailureV1.parse({ version: "site-extra-error.v1", code }) };
}
