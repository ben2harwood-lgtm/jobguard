import type { authenticatePracticeSession } from "../src/practice-session.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";

/** Old-schema fixture seed only: the session has already authenticated through real SQL.
 * The historical schema has no binding routine; preserve that original seed protocol.
 * Full-schema tests keep the production credential-bearing context. */
export function historicalPracticeSeed(auth: Awaited<ReturnType<typeof authenticatePracticeSession>>) {
  return { ...auth, context: verifiedTenantContextFromMembership({ tenantId: auth.context.tenantId,
    membershipId: auth.membershipId, identityUserId: auth.identityUserId } as AuthenticatedMembership) };
}
