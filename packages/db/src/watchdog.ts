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
  | "readiness.record" | "readiness.advance" | "things_to_check.evaluate" | "things_to_check.review" | "things_to_check.supersede"
  | "supplier_match.create" | "supplier_match.correct" | "inbox.seed" | "inbox.dismiss" | "purchase_order.revise" | "purchase_order.place"
  | "supplier_document.intake" | "supplier_document.receipt" | "supplier_document.confirm" | "evidence.begin_upload" | "evidence.finalize" | "proof.complete";

export function requestHashFor(kind: WatchdogCommandType, jobId: string, request: unknown): string {
  return createHash("sha256").update(JSON.stringify({ jobId, kind, request })).digest("hex");
}

/** A stable id for a command whose boundary carries none: the request itself is the command, so an exact retry replays. */
export function commandIdFor(kind: WatchdogCommandType, jobId: string, request: unknown): string {
  const hex = createHash("sha256").update(JSON.stringify({ kind, jobId, request })).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + (parseInt(hex[16]!, 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The tenant-wide identity claim every watchdog command makes first, in the transaction that completes it and before any audit
 * lock. "same" means this id was already claimed by the same job, kind and request (a replay); any other claim conflicts. A claim
 * racing in another transaction waits on the primary key and then conflicts, so all 17 commands share one atomic namespace. */
export async function claimCommandIdentity(database: TenantTransaction, spec: { tenantId: string; commandId: string; jobId: string; kind: WatchdogCommandType; requestHash: string }): Promise<"new" | "same"> {
  const inserted = await database.$client.query(
    "INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash)VALUES($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,command_id) DO NOTHING RETURNING command_id",
    [spec.tenantId, spec.commandId, spec.jobId, spec.kind, spec.requestHash]);
  if (inserted.rowCount) return "new";
  const existing = (await database.$client.query<{ job_id: string; command_type: string; request_hash: string }>(
    "SELECT job_id,command_type,request_hash FROM app.watchdog_command_identity WHERE tenant_id=$1 AND command_id=$2", [spec.tenantId, spec.commandId])).rows[0];
  if (!existing || existing.job_id !== spec.jobId || existing.command_type !== spec.kind || existing.request_hash !== spec.requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
  return "same";
}

/** The claimed identity for an id, read without claiming it (for a transaction that does not complete the command). */
export async function readCommandIdentity(database: TenantTransaction, tenantId: string, commandId: string): Promise<{ jobId: string; kind: string; requestHash: string } | undefined> {
  const row = (await database.$client.query<{ job_id: string; command_type: string; request_hash: string }>(
    "SELECT job_id,command_type,request_hash FROM app.watchdog_command_identity WHERE tenant_id=$1 AND command_id=$2", [tenantId, commandId])).rows[0];
  return row && { jobId: row.job_id, kind: row.command_type, requestHash: row.request_hash };
}

/** The stored first result for a command id, if any (a claim without a result belongs to a command whose result lives elsewhere). */
export async function findStoredResult(database: TenantTransaction, tenantId: string, commandId: string): Promise<{ found: false } | { found: true; result: unknown }> {
  const row = (await database.$client.query<{ result: unknown }>("SELECT result FROM app.watchdog_command_result WHERE tenant_id=$1 AND command_id=$2", [tenantId, commandId])).rows[0];
  return row ? { found: true, result: row.result } : { found: false };
}

/** Claim the id; if it was already claimed by this very command, return its stored first result. */
export async function beginStoredCommand<T>(database: TenantTransaction, spec: { tenantId: string; commandId: string; jobId: string; kind: WatchdogCommandType; requestHash: string }): Promise<{ replay: true; result: T } | { replay: false }> {
  if (await claimCommandIdentity(database, spec) === "same") {
    const stored = await findStoredResult(database, spec.tenantId, spec.commandId);
    if (stored.found) return { replay: true, result: stored.result as T };
  }
  return { replay: false };
}

/** Same transaction as the command's writes, after its identity claim. */
export async function storeCommandResult(database: TenantTransaction, row: { tenantId: string; commandId: string; result: unknown }): Promise<void> {
  await database.$client.query("INSERT INTO app.watchdog_command_result(tenant_id,command_id,result)VALUES($1,$2,$3::jsonb)", [row.tenantId, row.commandId, JSON.stringify(row.result)]);
}

/** The one replay contract for a watchdog command (CH-2 Done-when): behind the live guard and a per-job lock, claim the tenant-wide
 * identity (refusing a reused id), replay a stored result, else replay a row written before results existed when `legacy` can derive
 * it, else run and store the first result in the same transaction, whether or not it changed anything. The result is JSON-normalised
 * so a replay is byte-identical. */
export async function runStoredCommand<T>(
  database: TenantTransaction,
  spec: { tenantId: string; jobId: string; kind: WatchdogCommandType; commandId?: string | undefined; request: unknown; lockGroup?: string },
  hooks: { work: () => Promise<T>; legacy?: (commandId: string, requestHash: string) => Promise<T | undefined> },
): Promise<T> {
  const requestHash = requestHashFor(spec.kind, spec.jobId, spec.request);
  const commandId = spec.commandId ?? commandIdFor(spec.kind, spec.jobId, spec.request);
  await database.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${spec.tenantId}:${spec.jobId}:${spec.lockGroup ?? "watchdog-command"}`]);
  const begun = await beginStoredCommand<T>(database, { tenantId: spec.tenantId, commandId, jobId: spec.jobId, kind: spec.kind, requestHash });
  if (begun.replay) return begun.result;
  const earlier = await hooks.legacy?.(commandId, requestHash);
  if (earlier !== undefined) return earlier;
  const result = JSON.parse(JSON.stringify(await hooks.work())) as T;
  await storeCommandResult(database, { tenantId: spec.tenantId, commandId, result });
  return result;
}
