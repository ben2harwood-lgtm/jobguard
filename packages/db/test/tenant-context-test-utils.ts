import { verifiedTenantContextFromMembership } from "../src/tenant-context.js";

/** Synthetic membership proof only; kept outside the package's public exports. */
export const testTenantContext = (tenantId: string) => verifiedTenantContextFromMembership({
  identityUserId: "30000000-0000-4000-8000-000000000003",
  membershipId: "40000000-0000-4000-8000-000000000004",
  tenantId,
} as Parameters<typeof verifiedTenantContextFromMembership>[0]);
