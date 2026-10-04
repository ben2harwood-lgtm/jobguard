import { z } from "zod";
import type { TenantTransaction } from "./tenant-context.js";

export class WatchdogError extends Error {
  constructor(readonly code: "JOB_NOT_LIVE" | "JOB_NOT_FOUND") {
    super(code);
    this.name = "WatchdogError";
  }
}

/** First business lock. Held until commit, including through all audit appends.
 * Trigger rechecks acquire the same already-held share lock, never a new row lock.
 */
export async function requireLiveJob(database: TenantTransaction, jobId: string): Promise<void> {
  if (!z.string().uuid().safeParse(jobId).success) throw new WatchdogError("JOB_NOT_FOUND");
  try {
    await database.$client.query("SELECT app.require_watchdog_live($1::uuid)", [jobId]);
  } catch (error) {
    if (error instanceof Error && ["JOB_NOT_LIVE", "JOB_NOT_FOUND"].includes(error.message)) {
      throw new WatchdogError(error.message as "JOB_NOT_LIVE" | "JOB_NOT_FOUND");
    }
    throw error;
  }
}

export type WatchdogCommandType = "readiness.advance" | "things_to_check.evaluate" | "things_to_check.review" | "things_to_check.supersede";
export interface StoredCommandResult { jobId: string; kind: string; requestHash: string; result: unknown }

/** The stored command, if any. A command id is unique per tenant, whatever its job or type. */
export async function findCommandResult(database: TenantTransaction, tenantId: string, commandId: string): Promise<StoredCommandResult | undefined> {
  const row = (await database.$client.query<{ job_id: string; command_type: string; request_hash: string; result: unknown }>(
    "SELECT job_id,command_type,request_hash,result FROM app.watchdog_command_result WHERE tenant_id=$1 AND command_id=$2", [tenantId, commandId])).rows[0];
  return row && { jobId: row.job_id, kind: row.command_type, requestHash: row.request_hash, result: row.result };
}

/** Replay rule shared by every stored command: same job, same type, same request, else a conflict. */
export function replayStoredResult<T>(stored: StoredCommandResult, jobId: string, kind: WatchdogCommandType, requestHash: string): T {
  if (stored.jobId !== jobId || stored.kind !== kind || stored.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
  return stored.result as T;
}

/** Same transaction as the command's writes. A concurrent reuse of the id (another job) loses on the primary key. */
export async function storeCommandResult(database: TenantTransaction, row: { tenantId: string; commandId: string; jobId: string; kind: WatchdogCommandType; requestHash: string; result: unknown }): Promise<void> {
  try {
    await database.$client.query(
      "INSERT INTO app.watchdog_command_result(tenant_id,command_id,job_id,command_type,request_hash,result)VALUES($1,$2,$3,$4,$5,$6::jsonb)",
      [row.tenantId, row.commandId, row.jobId, row.kind, row.requestHash, JSON.stringify(row.result)]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("IDEMPOTENCY_CONFLICT");
    throw error;
  }
}
