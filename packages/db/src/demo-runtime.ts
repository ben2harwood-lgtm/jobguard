import type { Pool } from "pg";
import { DEMO_EMPTY_MEMBERSHIP_ID, DEMO_EMPTY_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "./demo-seed.js";
import { verifiedTenantContextFromMembership, withTenant } from "./tenant-context.js";

export type SyntheticDemoJob = Readonly<{ id: string; title: string; status: string; revision: number; updatedAt: Date }>;

export class SyntheticDemoReadError extends Error {
  constructor(readonly code: "DATABASE_UNAVAILABLE" | "MEMBERSHIP_FORBIDDEN" | "JOB_NOT_FOUND", options?: ErrorOptions) {
    super(code, options);
  }
}

/** A fixed synthetic principal bridge. It cannot select a caller-provided tenant. */
export async function readSyntheticDemo(pool: Pool) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new SyntheticDemoReadError("MEMBERSHIP_FORBIDDEN");
  const context = verifiedTenantContextFromMembership({
    identityUserId: "d1500000-0000-4000-8000-000000000001",
    membershipId: DEMO_MEMBERSHIP_ID,
    tenantId: DEMO_TENANT_ID,
  } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
  const primary = await withTenant(pool, context, async (database) => {
    const membership = await database.$client.query(
      `SELECT a.name FROM app.membership m JOIN app.account a
         ON (a.tenant_id,a.id)=(m.tenant_id,m.account_id)
       WHERE m.tenant_id=$1 AND m.id=$2 AND m.revoked_at IS NULL
         AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp())`,
      [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID],
    );
    if (membership.rowCount !== 1) throw new SyntheticDemoReadError("MEMBERSHIP_FORBIDDEN");
    const jobs = await database.$client.query<SyntheticDemoJob>(
      `SELECT id::text,title,status,revision,updated_at AS "updatedAt"
         FROM app.job j
         WHERE j.tenant_id=$1
           AND NOT EXISTS (
             SELECT 1 FROM app.job_record_proposal cp
              WHERE cp.tenant_id=j.tenant_id AND cp.job_id=j.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM app.sandbox_run sr
              WHERE sr.tenant_id=j.tenant_id AND sr.job_id=j.id
           )
         ORDER BY created_at,id`,
      [DEMO_TENANT_ID],
    );
    return { tenant: { id: DEMO_TENANT_ID, name: membership.rows[0].name as string }, jobs: jobs.rows };
  });
  const emptyContext = verifiedTenantContextFromMembership({
    identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_EMPTY_MEMBERSHIP_ID, tenantId: DEMO_EMPTY_TENANT_ID,
  } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
  const empty = await withTenant(pool, emptyContext, async (database) => {
    const membership = await database.$client.query<{ name: string }>(
      `SELECT a.name FROM app.membership m JOIN app.account a ON (a.tenant_id,a.id)=(m.tenant_id,m.account_id)
       WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.revoked_at IS NULL`,
      [DEMO_EMPTY_TENANT_ID, DEMO_EMPTY_MEMBERSHIP_ID, "d1500000-0000-4000-8000-000000000001"],
    );
    if (membership.rowCount !== 1) throw new SyntheticDemoReadError("MEMBERSHIP_FORBIDDEN");
    return { id: DEMO_EMPTY_TENANT_ID, name: membership.rows[0]!.name };
  });
  return { ...primary, tenants: [primary.tenant, empty] };
}

/** Authoritative job projection. RLS deliberately makes a foreign job indistinguishable from a missing one. */
export async function readSyntheticDemoJob(pool: Pool, jobId: string) {
  try {
    const workspace = await readSyntheticDemo(pool);
    const job = workspace.jobs.find((candidate) => candidate.id === jobId);
    if (!job) throw new SyntheticDemoReadError("JOB_NOT_FOUND");
    return { tenant: workspace.tenant, job };
  } catch (error) {
    if (error instanceof SyntheticDemoReadError) throw error;
    throw new SyntheticDemoReadError("DATABASE_UNAVAILABLE", { cause: error });
  }
}
