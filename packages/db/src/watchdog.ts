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

/** Where the previous schema (before migration 0050) persisted the id of each kind of watchdog command, as (kind, job) pairs. Every row is
 * immutable, so reading it inside the claiming transaction is race-free for rows that already exist. Stores that exist for other commands
 * (invoices, receipts of money, the like) are not watchdog commands and are not listed; neither are random ids a command writes for its
 * own internal rows (a readiness snapshot's, an inbox "created" event's). */
const LEGACY_COMMAND_OWNERS = `
  SELECT 'readiness.record' AS kind, job_id FROM app.planned_work_revision WHERE tenant_id=$1 AND command_id=$2
  UNION ALL SELECT 'readiness.advance', job_id FROM app.readiness_decision WHERE tenant_id=$1 AND command_id=$2
  UNION ALL SELECT 'things_to_check.evaluate', job_id FROM app.discrepancy_finding_revision WHERE tenant_id=$1 AND command_id=$2
  UNION ALL SELECT 'things_to_check.review', job_id FROM app.discrepancy_review_outcome WHERE tenant_id=$1 AND command_id=$2
  UNION ALL SELECT 'things_to_check.supersede', job_id FROM app.supplier_bill_supersession WHERE tenant_id=$1 AND command_id=$2
  UNION ALL SELECT CASE ae.event_type WHEN 'supplier_match.confirmed' THEN 'supplier_match.create' ELSE 'supplier_match.correct' END, r.job_id FROM app.supplier_match_revision r JOIN app.audit_event ae ON(ae.tenant_id,ae.id)=(r.tenant_id,r.audit_event_id) WHERE r.tenant_id=$1 AND r.command_id=$2
  UNION ALL SELECT 'supplier_document.confirm', job_id FROM app.supplier_fact_revision WHERE tenant_id=$1 AND command_id=$2
  UNION ALL SELECT 'inbox.dismiss', job_id FROM app.inbox_outcome_event WHERE tenant_id=$1 AND command_id=$2 AND event_kind='dismissed'
  UNION ALL SELECT 'inbox.seed', nullif(split_part(semantic_key,':',2),'')::uuid FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2 AND command_type='inbox.seed'
  UNION ALL SELECT 'purchase_order.place', job_id FROM app.purchase_order_placement WHERE tenant_id=$1 AND command_id=$2
  UNION ALL SELECT 'proof.complete', job_id FROM app.stage_completion WHERE tenant_id=$1 AND command_id=$2
  UNION ALL SELECT 'evidence.begin_upload', job_id FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2`;

/** An id the previous schema persisted belongs to the kind and job that persisted it. It can be claimed only by that kind on that job
 * (its own replay); any other kind, or the same kind on another job, is a conflict, so a command whose original has not replayed yet cannot
 * have its id taken and used for a new effect. An id persisted by two kinds, or for two jobs, belongs to nobody and is refused to every
 * claim: no winner is picked among commands that already had their effects. */
async function assertNotLegacyOwned(database: TenantTransaction, spec: { tenantId: string; commandId: string; jobId: string; kind: WatchdogCommandType }): Promise<void> {
  const owners = (await database.$client.query<{ kind: string; job_id: string | null }>(LEGACY_COMMAND_OWNERS, [spec.tenantId, spec.commandId])).rows;
  const kinds = new Set(owners.map(owner => owner.kind)), jobs = new Set(owners.flatMap(owner => owner.job_id ? [owner.job_id] : []));
  if ((kinds.size && (kinds.size > 1 || !kinds.has(spec.kind))) || (jobs.size && (jobs.size > 1 || !jobs.has(spec.jobId)))) throw new Error("IDEMPOTENCY_CONFLICT");
}

/** The tenant-wide identity claim every watchdog command makes first, in the transaction that completes it and before any audit
 * lock. "same" means this id was already claimed by the same job, kind and request (a replay); any other claim conflicts. A claim
 * racing in another transaction waits on the primary key and then conflicts, so all 17 commands share one atomic namespace. An id the
 * previous schema persisted is reserved for its own kind and job (see `assertNotLegacyOwned`), whether or not it has replayed yet. The insert
 * names no conflict target on purpose: the table has a second unique key (the proof application's response record references it), and a
 * conflict target arbitrates only its own index, so a racing duplicate could surface the other index's violation instead of conflicting. */
export async function claimCommandIdentity(database: TenantTransaction, spec: { tenantId: string; commandId: string; jobId: string; kind: WatchdogCommandType; requestHash: string }): Promise<"new" | "same"> {
  // The per-id lock every previous-schema store also takes on insert (0050 `app.reserve_watchdog_command_id`), so a writer that never
  // claims cannot slip a row in between the reservation check and this claim.
  await database.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`watchdog-command-id:${spec.tenantId.toLowerCase()}:${spec.commandId.toLowerCase()}`]);
  await assertNotLegacyOwned(database, spec);
  const inserted = await database.$client.query(
    "INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash)VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING command_id",
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
