import { z } from "zod";
import type { Pool } from "pg";
import { ExtraApprovalError } from "./extra-approval-chain-repository.js";
import { withTenant, InvalidTenantContextError, type VerifiedTenantContext, type AuthenticatedMembership } from "./tenant-context.js";
const uuid = z.guid();
const member = z.object({ extraId: uuid, canonicalId: uuid, description: z.string() }).strict();
export const extraDuplicateCandidatesV1 = z.object({ version: z.literal("extra-duplicate-candidates.v1"), jobId: uuid,
 groups: z.array(z.object({ id: uuid, fingerprint: z.string().regex(/^[a-f0-9]{64}$/u), extras: z.array(member) }).strict()), revision: z.number().int().nonnegative(),
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

export const duplicateDispositionV1 = z.object({ version: z.literal("duplicate-disposition.v1"), commandId: uuid,
 groupId: uuid, fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
 disposition: z.enum(["not_duplicates", "reopen"]), reasonCode: z.enum(["different_work", "different_location", "review_changed"]) }).strict();
const duplicateDispositionErrorCodes = ["INVALID_COMMAND", "NOT_FOUND", "PERMISSION_DENIED", "MODE_FORBIDDEN", "SELF_DISMISSAL", "STALE_REVISION", "COMMAND_CONFLICT", "DATABASE_UNAVAILABLE"] as const;
export class DuplicateDispositionError extends Error {
 constructor(readonly code: typeof duplicateDispositionErrorCodes[number]) { super(code); }
}
/** The checked writer resolves the persisted session again; no caller-supplied actor. */
export async function resolveExtraDuplicateCandidates(pool: Pool, context: VerifiedTenantContext, sessionId: string, jobId: string, raw: unknown) {
 const parsed = duplicateDispositionV1.safeParse(raw);
 if (!parsed.success || !uuid.safeParse(jobId).success || !uuid.safeParse(sessionId).success) throw new DuplicateDispositionError("INVALID_COMMAND");
 try {
  return await withTenant(pool, context, async db => (await db.$client.query("SELECT app.extra_duplicate_resolve($1,$2,$3::jsonb) result",
   [sessionId, jobId, JSON.stringify(parsed.data)])).rows[0]!.result as Record<string, unknown>);
 } catch (error) {
  if (error instanceof InvalidTenantContextError) throw error;
  const code = (error as { message?: string }).message;
  const known = duplicateDispositionErrorCodes.find(value => value === code);
  if (known) throw new DuplicateDispositionError(known);
  if (["40001", "40P01"].includes((error as { code?: string }).code ?? "")) throw new DuplicateDispositionError("STALE_REVISION");
  throw new DuplicateDispositionError("DATABASE_UNAVAILABLE");
 }
}
