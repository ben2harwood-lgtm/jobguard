import type { Pool } from "pg";
import { beginRepositoryCommand } from "./repository-command.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const pendingCommands = new WeakMap<TenantTransaction, Set<string>>();

/** Recovery receipts are operation markers; the public routes still return their
 * existing current-state read after commit, never a substituted receipt DTO. */
export async function beginRecoveryCommand(db: TenantTransaction, tenantId: string, commandId: string,
  commandType: string, legacyJson: string): Promise<boolean> {
  const input = JSON.parse(legacyJson) as { caseId: string; membershipId: string };
  if(!(await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner'
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[tenantId,input.membershipId])).rowCount)throw new Error("FORBIDDEN");
  const found = (await db.$client.query<{ job_id: string }>("SELECT job_id FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [tenantId, input.caseId])).rows[0];
  if (!found) throw new Error("AUTHORIZATION_INVALID");
  const claimed = await beginRepositoryCommand(db, { tenantId, actorMembershipId: input.membershipId, commandId,
    commandType, semanticKey: commandId, jobId: found.job_id, legacyJson });
  if(claimed.kind==="claim"){
    const pending=pendingCommands.get(db)??new Set<string>();pending.add(commandId);pendingCommands.set(db,pending);
  }
  return claimed.kind==="claim";
}

/** Existing bodies finish all domain work before their final audit append.
 * Completion only reads their immutable effects and updates the already-held
 * receipt/claim, so it introduces no business lock after that audit head. */
export async function withRecoveryCommands<T>(pool: Pool, context: VerifiedTenantContext,
  work: (db: TenantTransaction) => Promise<T>): Promise<T> {
  return withTenant(pool, context, async db => {
    try {
      const result = await work(db);
      for (const commandId of pendingCommands.get(db)??[]) await db.$client.query("SELECT app.complete_command($1,'{}'::jsonb)",[commandId]);
      return result;
    } finally { pendingCommands.delete(db); }
  });
}
