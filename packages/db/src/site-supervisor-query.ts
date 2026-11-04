import type { Pool } from "pg";
import { recordSiteSupervisorQueryV1, siteSupervisorQueryV1, siteSupervisorQueriesV1, SorSiteExtraError, sorSiteExtraErrorCodes } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type AuthenticatedMembership } from "./tenant-context.js";

async function call(pool: Pool, context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string, raw: unknown) {
 if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) throw new SorSiteExtraError("NOT_FOUND");
 try {
  return await withTenant(pool, context, async db => {
   const r = await db.$client.query("SELECT app.ent3_supervisor_query($1,$2,$3::jsonb) result", [jobId, actor.membershipId, raw === null ? null : JSON.stringify(raw)]);
   return r.rows[0]?.result as unknown;
  });
 } catch (error) {
  if (error instanceof SorSiteExtraError) throw error;
  const { message, code } = error as { message?: string; code?: string };
  if (code === "22P02" || code === "22003") throw new SorSiteExtraError("INVALID_COMMAND");
  if (message === "COMMAND_CONFLICT") throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
  if (sorSiteExtraErrorCodes.includes(message as typeof sorSiteExtraErrorCodes[number])) throw new SorSiteExtraError(message as typeof sorSiteExtraErrorCodes[number]);
  throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
 }
}
export async function recordSupervisorQuery(pool: Pool, context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string, raw: unknown) {
 const parsed = recordSiteSupervisorQueryV1.safeParse(raw);
 if (!parsed.success) throw new SorSiteExtraError("INVALID_COMMAND");
 return siteSupervisorQueryV1.parse(await call(pool, context, actor, jobId, parsed.data));
}
export async function readSupervisorQueries(pool: Pool, context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string) {
 return siteSupervisorQueriesV1.parse(await call(pool, context, actor, jobId, null));
}
