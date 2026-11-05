import { z } from "zod";
import type { Pool } from "pg";
import { ExtraApprovalError } from "./extra-approval-chain-repository.js";
import { withTenant, InvalidTenantContextError, type VerifiedTenantContext, type AuthenticatedMembership } from "./tenant-context.js";
const uuid = z.guid();
const member = z.object({ extraId: uuid, canonicalId: uuid, description: z.string() }).strict();
export const extraDuplicateCandidatesV1 = z.object({ version: z.literal("extra-duplicate-candidates.v1"), jobId: uuid,
 groups: z.array(z.object({ id: uuid, extras: z.array(member) }).strict()), revision: z.number().int().nonnegative(),
 activeLinks: z.array(z.object({ linkId: uuid, duplicateId: uuid, canonicalId: uuid, duplicateLabel: z.string(), canonicalLabel: z.string() }).strict()) }).strict();
export async function readExtraDuplicateCandidates(pool: Pool, context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string) {
 if (!uuid.safeParse(jobId).success) throw new ExtraApprovalError("INVALID_COMMAND");
 if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) throw new ExtraApprovalError("PERMISSION_DENIED");
 try {
  return await withTenant(pool, context, async db => extraDuplicateCandidatesV1.parse((await db.$client.query(
   "SELECT app.extra_duplicate_candidates($1,$2) result", [actor.membershipId, jobId])).rows[0]!.result));
 } catch (error) {
  if (error instanceof InvalidTenantContextError) throw error;
  const code = (error as { message?: string }).message;
  if (code === "NOT_FOUND" || code === "PERMISSION_DENIED" || code === "MODE_FORBIDDEN") throw new ExtraApprovalError(code);
  throw new ExtraApprovalError("DATABASE_UNAVAILABLE");
 }
}
