import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import * as schema from "./schema.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
declare const verifiedTenantContextBrand: unique symbol;
declare const authenticatedMembershipBrand: unique symbol;

/** Proof created only after authentication and an active membership lookup. */
export interface AuthenticatedMembership {
  readonly identityUserId: string;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly [authenticatedMembershipBrand]: true;
}

/**
 * An authentication/membership bridge must create this value. The constructor is
 * intentionally not exported; M0-6 owns provenance from an authenticated principal.
 */
export interface VerifiedTenantContext {
  readonly tenantId: string;
  readonly [verifiedTenantContextBrand]: true;
}

/** M0-6 trust-boundary constructor; never accepts a tenant id on its own. */
export function verifiedTenantContextFromMembership(
  membership: AuthenticatedMembership,
): VerifiedTenantContext {
  if (
    !membership ||
    !UUID.test(membership.identityUserId) ||
    !UUID.test(membership.membershipId) ||
    !UUID.test(membership.tenantId)
  ) {
    throw new InvalidTenantContextError();
  }
  return Object.freeze({ tenantId: membership.tenantId }) as VerifiedTenantContext;
}

export class InvalidTenantContextError extends Error {
  readonly code = "INVALID_TENANT_CONTEXT";

  constructor() {
    super("A verified tenant context with a valid UUID is required");
    this.name = "InvalidTenantContextError";
  }
}

export type TenantTransaction = NodePgDatabase<typeof schema> & { $client: PoolClient };

/**
 * Runs work in one transaction with transaction-local RLS state. set_config is
 * parameterized and `true` prevents the tenant value leaking through the pool.
 */
export async function withTenant<T>(
  pool: Pool,
  context: VerifiedTenantContext,
  work: (database: TenantTransaction) => Promise<T>,
): Promise<T> {
  if (!context || typeof context.tenantId !== "string" || !UUID.test(context.tenantId)) {
    throw new InvalidTenantContextError();
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [context.tenantId]);
    const database = drizzle(client, { schema }) as TenantTransaction;
    const result = await work(database);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
