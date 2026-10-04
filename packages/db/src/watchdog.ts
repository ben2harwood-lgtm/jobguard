import { createHash } from "node:crypto";
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

export type WatchdogCommandType =
  | "readiness.advance" | "readiness.record" | "things_to_check.evaluate" | "things_to_check.review" | "things_to_check.supersede"
  | "supplier_match.create" | "supplier_match.correct" | "inbox.dismiss" | "purchase_order.revise"
  | "supplier_document.intake" | "supplier_document.receipt" | "supplier_document.confirm" | "evidence.finalize" | "purchase_order.place";
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

export function requestHashFor(kind: WatchdogCommandType, jobId: string, request: unknown): string {
  return createHash("sha256").update(JSON.stringify({ jobId, kind, request })).digest("hex");
}

/** A stable id for a command whose boundary carries none: the request itself is the command, so an exact retry replays. */
export function commandIdFor(kind: WatchdogCommandType, jobId: string, request: unknown): string {
  const hex = createHash("sha256").update(JSON.stringify({ kind, jobId, request })).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + (parseInt(hex[16]!, 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The one replay contract for a watchdog command (CH-2 Done-when): behind the live guard and a per-job lock, a stored
 * result for the id is replayed (same job, kind and request) or refused; otherwise a row written before results existed is
 * replayed from its own table when `legacy` can derive it; otherwise the command runs and its first result is stored in the
 * same transaction, whether or not it changed anything. The result is JSON-normalised so a replay is byte-identical. */
export async function runStoredCommand<T>(
  database: TenantTransaction,
  spec: { tenantId: string; jobId: string; kind: WatchdogCommandType; commandId?: string | undefined; request: unknown; lockGroup?: string },
  hooks: { work: () => Promise<T>; legacy?: (commandId: string, requestHash: string) => Promise<T | undefined> },
): Promise<T> {
  const requestHash = requestHashFor(spec.kind, spec.jobId, spec.request);
  const commandId = spec.commandId ?? commandIdFor(spec.kind, spec.jobId, spec.request);
  await database.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${spec.tenantId}:${spec.jobId}:${spec.lockGroup ?? "watchdog-command"}`]);
  const stored = await findCommandResult(database, spec.tenantId, commandId);
  if (stored) return replayStoredResult<T>(stored, spec.jobId, spec.kind, requestHash);
  const earlier = await hooks.legacy?.(commandId, requestHash);
  if (earlier !== undefined) return earlier;
  let result: T;
  try {
    result = JSON.parse(JSON.stringify(await hooks.work())) as T;
  } catch (error) {
    const failure = error as { code?: string; constraint?: string };
    if (failure.code === "23505" && /command/u.test(failure.constraint ?? "")) throw new Error("IDEMPOTENCY_CONFLICT");
    throw error;
  }
  await storeCommandResult(database, { tenantId: spec.tenantId, commandId, jobId: spec.jobId, kind: spec.kind, requestHash, result });
  return result;
}
