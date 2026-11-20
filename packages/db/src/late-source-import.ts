import type { Pool } from "pg";
import { JobSourceError, lateSourceImportV1, lateSourceReceiptV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { WatchdogError } from "./watchdog.js";

/** A separate historical evidence command. Never enters CH-4 or the ordinary message writer. */
export async function importLateSource(pool: Pool, context: VerifiedTenantContext, jobId: string, digest: string, raw: unknown) {
 const input = lateSourceImportV1.safeParse(raw);
 if (!input.success) throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
 try {
  return await withTenant(pool, context, async db => {
   const row = (await db.$client.query("SELECT app.import_late_source($1,$2,$3,$4::jsonb) result", [context.tenantId, jobId, digest, JSON.stringify(input.data)])).rows[0];
   return lateSourceReceiptV1.parse(row.result);
  });
 } catch (error) {
  const message = error instanceof Error ? error.message : "";
  if (["JOB_SOURCE_FORBIDDEN", "FORBIDDEN", "WORK_STATE_FORBIDDEN"].includes(message)) throw new JobSourceError("JOB_SOURCE_FORBIDDEN");
  if (message === "SYNTHETIC_MODE_REQUIRED") throw new JobSourceError(message);
  if (message === "INVALID_JOB_SOURCE_INPUT") throw new JobSourceError(message);
  if (["COMMAND_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(message)) throw new WatchdogError("IDEMPOTENCY_CONFLICT");
  throw error;
 }
}

/** Ordinary source history only: caller authenticates job ownership before invoking this read. */
export async function readLateSources(pool:Pool,context:VerifiedTenantContext,jobId:string) {
 return withTenant(pool,context,async db=>(await db.$client.query("SELECT receipt FROM app.late_source_import WHERE tenant_id=$1 AND job_id=$2 ORDER BY source_received_at,command_id",[context.tenantId,jobId])).rows.map(row=>lateSourceReceiptV1.parse(row.receipt)));
}
