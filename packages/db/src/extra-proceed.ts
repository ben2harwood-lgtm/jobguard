import type { Pool } from "pg";
import { extraProceedViewV1, recordExtraProceedV1, SorSiteExtraError, sorSiteExtraErrorCodes } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type AuthenticatedMembership } from "./tenant-context.js";
import { RequestBindingRefusedError } from "./request-binding-error.js";

/** The server supplies the actor; the strict body contains no authority or clock. */
export async function extraProceed(pool: Pool, context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string, extraId: string, raw?: unknown) {
 if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) throw new SorSiteExtraError("NOT_FOUND");
 const body = raw === undefined ? null : recordExtraProceedV1.safeParse(raw);
 if (body && !body.success) throw new SorSiteExtraError("INVALID_COMMAND");
 try {
  return await withTenant(pool, context, async db => {
   const r = await db.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb) result", [jobId, extraId, actor.membershipId, body ? JSON.stringify(body.data) : null]);
   return extraProceedViewV1.parse(r.rows[0]?.result);
  });
 } catch (error) {
  const { message, code } = error as { message?: string; code?: string };
  // LP-6d: an unbound or mismatched request is refused like an unknown extra (never a 503).
  if (error instanceof RequestBindingRefusedError || (code === "42501" && message === "REQUEST_BINDING_REFUSED")) throw new SorSiteExtraError("NOT_FOUND");
  if (message === "COMMAND_CONFLICT") throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
  if (code === "22P02" || code === "23514") throw new SorSiteExtraError("INVALID_COMMAND");
  if (sorSiteExtraErrorCodes.includes(message as typeof sorSiteExtraErrorCodes[number])) throw new SorSiteExtraError(message as typeof sorSiteExtraErrorCodes[number]);
  throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
 }
}
