import type { Pool } from "pg";
import { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "./demo-seed.js";
import { verifiedTenantContextFromMembership, withTenant } from "./tenant-context.js";

export type SyntheticDemoJob = Readonly<{ id: string; title: string; status: string }>;

/** A fixed synthetic principal bridge. It cannot select a caller-provided tenant. */
export async function readSyntheticDemo(pool: Pool) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("Synthetic demo database access is disabled");
  const context = verifiedTenantContextFromMembership({
    identityUserId: "d1500000-0000-4000-8000-000000000001",
    membershipId: DEMO_MEMBERSHIP_ID,
    tenantId: DEMO_TENANT_ID,
  } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
  return withTenant(pool, context, async (database) => {
    const membership = await database.$client.query(
      `SELECT a.name FROM app.membership m JOIN app.account a
         ON (a.tenant_id,a.id)=(m.tenant_id,m.account_id)
       WHERE m.tenant_id=$1 AND m.id=$2 AND m.revoked_at IS NULL
         AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp())`,
      [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID],
    );
    if (membership.rowCount !== 1) throw new Error("Synthetic demo tenant has not been bootstrapped");
    const jobs = await database.$client.query<SyntheticDemoJob>(
      "SELECT id::text,title,status FROM app.job WHERE tenant_id=$1 ORDER BY created_at,id",
      [DEMO_TENANT_ID],
    );
    return { tenant: { id: DEMO_TENANT_ID, name: membership.rows[0].name as string }, jobs: jobs.rows };
  });
}
