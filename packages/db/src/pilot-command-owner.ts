import type { TenantTransaction } from "./tenant-context.js";

/** Hold the bound owner through the write so a concurrent role change cannot authorize it. */
export async function requirePilotCommandOwner(db: TenantTransaction) {
  const actor = (await db.$client.query<{ id: string }>(`
    SELECT id FROM app.membership
    WHERE tenant_id=app.current_tenant() AND id=app.current_actor() AND role='owner'
     AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
    FOR SHARE`)).rows[0];
  if (!actor) throw new Error("FORBIDDEN");
}
