import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { verifiedTenantContextFromMembership } from "../src/tenant-context.js";

/** Synthetic membership proof only; kept outside the package's public exports. */
export const testTenantContext = (tenantId: string) => verifiedTenantContextFromMembership({
  identityUserId: "30000000-0000-4000-8000-000000000003",
  membershipId: "40000000-0000-4000-8000-000000000004",
  tenantId,
} as Parameters<typeof verifiedTenantContextFromMembership>[0]);

/** Real persisted credential and membership bridge for synthetic command fixtures. */
export async function testBoundTenantContext(owner: Pool, tenantId: string, membershipId: string) {
  const member = (await owner.query<{ identity_user_id: string }>(
    "SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [tenantId, membershipId],
  )).rows[0];
  if (!member) throw new Error("Synthetic fixture membership missing");
  const credential = randomBytes(32).toString("hex");
  await owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [`${member.identity_user_id}@fictional.invalid`, member.identity_user_id]);
  await owner.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3) ON CONFLICT(user_id,tenant_id) DO UPDATE SET membership_id=excluded.membership_id",
    [member.identity_user_id, tenantId, membershipId]);
  await owner.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')",
    [randomUUID(), member.identity_user_id, credential]);
  return verifiedTenantContextFromMembership({ identityUserId: member.identity_user_id, tenantId, membershipId } as Parameters<typeof verifiedTenantContextFromMembership>[0], { kind: "real", credential });
}
